"""Subtopic planning endpoint."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from witness_stand.ai.base import LLMError
from witness_stand.ai.prompts import (
    build_opposition_opening_turn,
    build_opposition_system,
    build_subtopic_planner_prompt,
    build_subtopic_planner_system,
)
from witness_stand.api._deps import (
    LLMDep,
    SessionDep,
    SessionStoreDep,
    fresh_files,
)
from witness_stand.logging_setup import logger
from witness_stand.schemas.examiner import ExaminerTurn, TranscriptMessage
from witness_stand.schemas.session import Session, SubtopicProgress
from witness_stand.schemas.subtopics import SubtopicPlan, SubtopicsResponse

router = APIRouter(prefix="/sessions/{session_id}/subtopics", tags=["subtopics"])


@router.post("", response_model=SubtopicsResponse, status_code=status.HTTP_200_OK)
async def plan_subtopics(
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
) -> SubtopicsResponse:
    """Generate the subtopic plan and seed the opening examiner turn.

    Grounded on attached course materials when present. The opening turn
    is a single-turn structured call (no history exists yet).
    """
    usable_files = fresh_files(session)
    prompt = build_subtopic_planner_prompt(
        subject=session.subject,
        topic=session.topic,
        has_materials=bool(usable_files),
    )
    planner_system = build_subtopic_planner_system()

    logger.info(
        "subtopics_invoke",
        with_files=bool(usable_files),
        subject=session.subject,
        topic=session.topic,
    )
    try:
        if usable_files:
            plan = await llm.structured_with_files(
                prompt,
                files=usable_files,
                schema=SubtopicPlan,
                system=planner_system,
            )
        else:
            plan = await llm.structured(
                prompt,
                schema=SubtopicPlan,
                system=planner_system,
            )
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Subtopic planning failed: {exc}",
        ) from exc

    session.subtopics = [SubtopicProgress(name=name) for name in plan.subtopics]
    session.current_subtopic_index = 0

    # Seed the opening turn now so the frontend gets the first question in
    # the same trip. This is conceptually part of "begin the session" —
    # failures here are non-fatal; the frontend can call /turns to start.
    opening = await _generate_opening(session, llm)
    if opening is not None:
        session.transcript.append(opening)

    await store.update(session)

    return SubtopicsResponse(
        subtopics=[s.name for s in session.subtopics],
        used_files=bool(usable_files),
    )


async def _generate_opening(session: Session, llm) -> TranscriptMessage | None:
    prompt = build_opposition_opening_turn(current_subtopic=session.current_subtopic)
    system_instruction = build_opposition_system(
        subject=session.subject,
        topic=session.topic,
        intensity=session.intensity,
    )
    try:
        turn = await llm.structured(
            prompt,
            schema=ExaminerTurn,
            system=system_instruction,
        )
    except LLMError as exc:
        logger.warning("opening_turn_failed", error=str(exc))
        return None

    return TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="counsel",
        content=turn.message,
        created_at=datetime.now(timezone.utc),
        scoring=turn.scoring,
        rationale=turn.rationale,
    )
