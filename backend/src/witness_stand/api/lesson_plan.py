"""Lesson plan (case file) endpoint.

Generates the structured examination agenda before the first turn. This
replaces / augments the subtopic planner with a richer hierarchical
breakdown that makes gaps visible to the student without revealing answers.

Design status: STUB — the LLM call and response processing will evolve
after workshopping the toy example. The wiring is in place.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status

from witness_stand.ai.base import LLMError
from witness_stand.ai.prompts.lesson_plan import (
    build_lesson_plan_prompt,
    build_lesson_plan_system,
)
from witness_stand.api._deps import (
    LLMDep,
    SessionDep,
    SessionStoreDep,
    fresh_files,
)
from witness_stand.logging_setup import logger
from witness_stand.schemas.lesson_plan import (
    CaseFileNode,
    CaseFileNodeDTO,
    LessonPlan,
    LessonPlanGeneration,
    LessonPlanResponse,
    NodeCategory,
)

router = APIRouter(prefix="/sessions/{session_id}/lesson-plan", tags=["lesson-plan"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _slugify(label: str) -> str:
    """Turn a label into a URL-safe id slug."""
    return label.lower().replace(" ", "-").replace("/", "-")[:40]


def _generation_to_plan(gen: LessonPlanGeneration) -> LessonPlan:
    """Convert the raw LLM output into our internal LessonPlan with ids."""
    children: list[CaseFileNode] = []
    for matter in gen.matters:
        matter_id = _slugify(matter.label)
        leaf_nodes = [
            CaseFileNode(
                id=f"{matter_id}--{_slugify(node.label)}",
                label=node.label,
                category=node.category,
                prompt_hint=node.prompt_hint,
                answer_key=node.answer_key,
                status="pending",
            )
            for node in matter.nodes
        ]
        branch = CaseFileNode(
            id=matter_id,
            label=matter.label,
            category=None,
            children=leaf_nodes,
            status="pending",
        )
        children.append(branch)

    return LessonPlan(
        topic=gen.topic,
        children=children,
        rationale=gen.rationale,
    )


def _plan_to_response(plan: LessonPlan) -> LessonPlanResponse:
    """Project the internal plan to the frontend-safe DTO (strips answer keys)."""

    def _node_to_dto(node: CaseFileNode) -> CaseFileNodeDTO:
        return CaseFileNodeDTO(
            id=node.id,
            label=node.label,
            category=node.category,
            prompt_hint=node.prompt_hint,
            children=[_node_to_dto(c) for c in node.children],
            status=node.status,
        )

    return LessonPlanResponse(
        topic=plan.topic,
        matters=[_node_to_dto(c) for c in plan.children],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.post("", response_model=LessonPlanResponse, status_code=status.HTTP_200_OK)
async def generate_lesson_plan(
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
) -> LessonPlanResponse:
    """Generate the structured case file / lesson plan for this session.

    Should be called after session creation (and optionally after file
    upload). The result is persisted on the session and drives both the
    examination agenda and the case file tab in the frontend.
    """
    usable_files = fresh_files(session)
    prompt = build_lesson_plan_prompt(
        subject=session.subject,
        topic=session.topic,
        has_materials=bool(usable_files),
    )
    system_instruction = build_lesson_plan_system(
        subject=session.subject,
        topic=session.topic,
        has_materials=bool(usable_files),
    )

    logger.info(
        "lesson_plan_invoke",
        with_files=bool(usable_files),
        subject=session.subject,
        topic=session.topic,
    )

    try:
        if usable_files:
            gen = await llm.structured_with_files(
                prompt,
                files=usable_files,
                schema=LessonPlanGeneration,
                system=system_instruction,
            )
        else:
            gen = await llm.structured(
                prompt,
                schema=LessonPlanGeneration,
                system=system_instruction,
            )
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Lesson plan generation failed: {exc}",
        ) from exc

    plan = _generation_to_plan(gen)

    # TODO: Persist the lesson plan on the session once the Session schema
    # is extended. For now we just return it. The session schema change is
    # part of the workshop discussion (how lesson plan relates to subtopics).
    #
    # session.lesson_plan = plan
    # await store.update(session)

    return _plan_to_response(plan)
