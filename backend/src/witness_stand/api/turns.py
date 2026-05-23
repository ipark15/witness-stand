"""Examination turn endpoint — the courtroom main loop.

Roles are determined by which endpoint is hit, not by parsing model output.
This endpoint *is* the opposition: the response is, by construction, from
Opposing Counsel. If the opposition signals ``advance``, the backend emits
a templated judge transition on its own authority (no LLM call) — judge
flavor is the app speaking, not the model.

We use the multi-turn chat API so the model sees the dialogue as a
dialogue. Stable session context (subject/topic/intensity) lives in the
system instruction; per-turn mutable state (current subtopic, jury favor)
is prepended to the latest user message only — see
``ai/prompts/opposition.py``.
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
from witness_stand.services.deltas import rubric_to_deltas

router = APIRouter(prefix="/sessions/{session_id}/turns", tags=["turns"])


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
                "before submitting turns."
            ),
        )

    # 1. Build the chat history the opposition sees BEFORE we mutate the
    #    transcript — the new defense message arrives via the builder, not
    #    via the persisted transcript yet.
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

    # 3. Invoke the opposition via the chat API. File-grounded variant if
    #    we still have valid course materials.
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
        # Roll back the defense message we just appended so the transcript
        # stays consistent if the model failed.
        session.transcript.pop()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Opposition unavailable: {exc}",
        ) from exc

    # 4. Persist the opposition's reply (decorated with its own scoring + rationale).
    counsel_msg = TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="counsel",
        content=turn.message,
        created_at=datetime.now(timezone.utc),
        scoring=turn.scoring,
        rationale=turn.rationale,
    )
    session.transcript.append(counsel_msg)

    # 5. Apply scoring deltas derived from the model-judged rubric.
    quality_delta, jury_delta = rubric_to_deltas(turn.scoring)
    session.jury_favor = max(0, min(100, session.jury_favor + jury_delta))
    current_progress = session.subtopics[session.current_subtopic_index]
    current_progress.quality = max(
        0, min(100, current_progress.quality + quality_delta)
    )

    # 6. If the opposition advances, the COURT emits a templated transition
    #    and we move the cursor. No LLM call here — this is the app speaking
    #    in its own voice on its own authority.
    judge_msg: TranscriptMessage | None = None
    advanced = False
    session_complete = False

    if turn.advance:
        if session.current_subtopic_index < len(session.subtopics) - 1:
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
            # Last subtopic just concluded — render the verdict.
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
    )


def _verdict_for(jury_favor: int) -> str:
    if jury_favor >= 70:
        return "Acquitted"
    if jury_favor >= 40:
        return "Hung Jury"
    return "Guilty"
