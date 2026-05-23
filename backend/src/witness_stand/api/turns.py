"""Examination turn endpoint — the courtroom main loop.

Roles are determined by which endpoint is hit, not by parsing model output.
This endpoint *is* the opposition: the response is, by construction, from
Opposing Counsel. If the opposition signals ``advance``, the backend emits
a templated judge transition on its own authority (no LLM call) — judge
flavor is the app speaking, not the model.

The evaluation step checks the student's testimony against the case file
(lesson plan) answer keys and produces:
  * section_updates: which nodes got checked off
  * evaluation_feedback: constructive guidance about remaining gaps
  * matter advancement: if all nodes in the current matter are covered,
    the examination advances to the next matter automatically.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from witness_stand.ai.base import LLMError
from witness_stand.ai.prompts import (
    build_opposition_history,
    build_opposition_system,
)
from witness_stand.ai.prompts.evaluation import (
    build_evaluation_history,
    build_evaluation_system,
)
from witness_stand.api._deps import (
    LLMDep,
    SessionDep,
    SessionStoreDep,
    fresh_files,
)
from witness_stand.constants import JUDGE_TRANSITIONS
from witness_stand.logging_setup import bind, logger
from witness_stand.schemas.examiner import (
    ExaminerTurn,
    OppositionResponse,
    TranscriptMessage,
    TurnRequest,
)
from witness_stand.schemas.lesson_plan import (
    CaseFileNode,
    EvaluationResult,
    SectionUpdate,
)
from witness_stand.services.deltas import rubric_to_deltas

router = APIRouter(prefix="/sessions/{session_id}/turns", tags=["turns"])


def _apply_section_updates(
    plan_children: list[CaseFileNode],
    updates: list[SectionUpdate],
) -> None:
    """Apply status changes from the evaluator to the persisted case file nodes."""
    node_map: dict[str, CaseFileNode] = {}
    for matter in plan_children:
        for node in matter.children:
            node_map[node.id] = node

    for update in updates:
        node = node_map.get(update.node_id)
        if node is None:
            continue
        # Only move forward: pending→partial→covered, never backwards
        rank = {"pending": 0, "partial": 1, "covered": 2}
        if rank.get(update.new_status, 0) > rank.get(node.status, 0):
            node.status = update.new_status


def _matter_all_covered(matter: CaseFileNode) -> bool:
    """Check if every leaf node in this matter is covered."""
    if not matter.children:
        return matter.status == "covered"
    return all(child.status == "covered" for child in matter.children)


def _update_matter_status(matter: CaseFileNode) -> None:
    """Update the branch node status based on its children."""
    if not matter.children:
        return
    if all(c.status == "covered" for c in matter.children):
        matter.status = "covered"
    elif any(c.status in ("partial", "covered") for c in matter.children):
        matter.status = "partial"


@router.post("", response_model=OppositionResponse, status_code=status.HTTP_200_OK)
async def submit_turn(
    body: TurnRequest,
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
) -> OppositionResponse:
    bind(subtopic_index=session.current_subtopic_index, intensity=session.intensity)

    if session.complete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is already complete; final verdict has been entered.",
        )
    if not session.subtopics:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Session has no subtopic plan yet. POST /sessions/{id}/subtopics "
                "or /sessions/{id}/lesson-plan before submitting turns."
            ),
        )

    # 1. Build the chat history the opposition sees.
    history = build_opposition_history(
        transcript=session.transcript,
        new_defense_message=body.message,
        current_subtopic=session.current_subtopic,
        jury_favor=session.jury_favor,
    )
    system_instruction = build_opposition_system(
        subject=session.subject,
        topic=session.topic,
        intensity=session.intensity,
    )

    # 2. Persist the defense's testimony.
    now = datetime.now(timezone.utc)
    defense_msg = TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="defense",
        content=body.message,
        created_at=now,
    )
    session.transcript.append(defense_msg)

    # 3. Invoke the opposition.
    usable_files = fresh_files(session)
    logger.info(
        "opposition_invoke",
        history_turns=len(history),
        with_files=bool(usable_files),
    )
    try:
        if usable_files:
            turn = await llm.structured_chat_with_files(
                history,
                files=usable_files,
                schema=ExaminerTurn,
                system=system_instruction,
            )
        else:
            turn = await llm.structured_chat(
                history,
                schema=ExaminerTurn,
                system=system_instruction,
            )
    except LLMError as exc:
        session.transcript.pop()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Opposition unavailable: {exc}",
        ) from exc

    # 4. Persist the opposition's reply.
    counsel_msg = TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="counsel",
        content=turn.message,
        created_at=datetime.now(timezone.utc),
        scoring=turn.scoring,
        rationale=turn.rationale,
    )
    session.transcript.append(counsel_msg)

    # 5. Apply scoring deltas.
    quality_delta, jury_delta = rubric_to_deltas(turn.scoring)
    session.jury_favor = max(0, min(100, session.jury_favor + jury_delta))
    current_progress = session.subtopics[session.current_subtopic_index]
    current_progress.quality = max(
        0, min(100, current_progress.quality + quality_delta)
    )

    # 6. Case file evaluation — check the student's testimony against
    #    remaining answer keys in the current matter.
    section_updates: list[SectionUpdate] = []
    evaluation_feedback = ""
    matter_covered = False

    if session.lesson_plan and session.lesson_plan.children:
        matter_idx = min(
            session.current_matter_index,
            len(session.lesson_plan.children) - 1,
        )
        current_matter = session.lesson_plan.children[matter_idx]

        # Only evaluate if there are uncovered nodes
        has_remaining = any(
            c.status != "covered" for c in current_matter.children
        )
        if has_remaining:
            eval_system = build_evaluation_system(
                subject=session.subject,
                topic=session.topic,
                current_matter=current_matter,
            )
            eval_history = build_evaluation_history(
                transcript=session.transcript,
                new_defense_message=body.message,
            )
            try:
                eval_result = await llm.structured_chat(
                    eval_history,
                    schema=EvaluationResult,
                    system=eval_system,
                )
                section_updates = eval_result.updates
                evaluation_feedback = eval_result.feedback
                matter_covered = eval_result.all_covered

                # Apply updates to the persisted plan
                _apply_section_updates(
                    session.lesson_plan.children,
                    section_updates,
                )
                _update_matter_status(current_matter)

                # Double-check all_covered against actual node states
                matter_covered = _matter_all_covered(current_matter)

                logger.info(
                    "evaluation_complete",
                    updates=len(section_updates),
                    matter_covered=matter_covered,
                )
            except LLMError:
                logger.warning("evaluation_failed", exc_info=True)
                # Non-fatal: examination continues without evaluation

    # 7. Advance logic — matter is covered OR opposition signals advance.
    judge_msg: TranscriptMessage | None = None
    advanced = False
    session_complete = False

    should_advance = matter_covered or turn.advance
    if should_advance:
        can_advance_matter = (
            session.lesson_plan
            and session.current_matter_index < len(session.lesson_plan.children) - 1
        )
        can_advance_subtopic = (
            session.current_subtopic_index < len(session.subtopics) - 1
        )

        if can_advance_matter or can_advance_subtopic:
            if can_advance_matter:
                session.current_matter_index += 1
            if can_advance_subtopic:
                session.current_subtopic_index += 1
            advanced = True
            judge_msg = TranscriptMessage(
                id=uuid.uuid4().hex,
                speaker="judge",
                content=random.choice(JUDGE_TRANSITIONS),
                created_at=datetime.now(timezone.utc),
            )
            session.transcript.append(judge_msg)
        else:
            # Last matter/subtopic concluded — verdict.
            session.complete = True
            session.verdict = _verdict_for(session.jury_favor)
            session_complete = True
            judge_msg = TranscriptMessage(
                id=uuid.uuid4().hex,
                speaker="judge",
                content=(
                    "The court has heard sufficient testimony. The verdict: "
                    f"{session.verdict}."
                ),
                created_at=datetime.now(timezone.utc),
            )
            session.transcript.append(judge_msg)

    await store.update(session)

    logger.info(
        "turn_complete",
        advanced=advanced,
        session_complete=session_complete,
        quality_delta=quality_delta,
        jury_delta=jury_delta,
        jury_favor=session.jury_favor,
    )

    return OppositionResponse(
        counsel_message=counsel_msg,
        judge_transition=judge_msg,
        quality_delta=quality_delta,
        jury_delta=jury_delta,
        advanced_subtopic=advanced,
        session_complete=session_complete,
        section_updates=section_updates,
        evaluation_feedback=evaluation_feedback,
    )


def _verdict_for(jury_favor: int) -> str:
    if jury_favor >= 70:
        return "Acquitted"
    if jury_favor >= 40:
        return "Hung Jury"
    return "Guilty"
