"""Lesson plan (case file) endpoints.

Generates or loads the structured examination agenda before the first
turn. Supports both LLM generation and pre-baked fixture loading (for
demos and user studies where token budget matters).
"""
from __future__ import annotations

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
)
from witness_stand.schemas.session import SubtopicProgress
from witness_stand.services.fixtures import load_fixture

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
    """Project the internal plan to the frontend-safe DTO."""

    def _node_to_dto(node: CaseFileNode) -> CaseFileNodeDTO:
        return CaseFileNodeDTO(
            id=node.id,
            label=node.label,
            category=node.category,
            prompt_hint=node.prompt_hint,
            children=[_node_to_dto(c) for c in node.children],
            status=node.status,
            answer_key=node.answer_key,
        )

    return LessonPlanResponse(
        topic=plan.topic,
        matters=[_node_to_dto(c) for c in plan.children],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@router.post("", response_model=LessonPlanResponse, status_code=status.HTTP_200_OK)
async def generate_lesson_plan(
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
) -> LessonPlanResponse:
    """Generate or load the structured case file for this session.

    If USE_FIXTURE_LESSON_PLAN is set, loads from fixtures instead of
    calling the LLM. The result is persisted on the session.
    """
    if session.lesson_plan is not None:
        logger.info("lesson_plan_already_exists", session_id=session.id)
        return _plan_to_response(session.lesson_plan)

    gen: LessonPlanGeneration | None = None

    # Try fixture first if enabled
    from witness_stand.config import get_settings
    use_fixtures = get_settings().use_fixture_lesson_plan
    if use_fixtures:
        gen = load_fixture(session.subject, session.topic)
        if gen:
            logger.info(
                "lesson_plan_from_fixture",
                subject=session.subject,
                topic=session.topic,
            )

    # Fall back to LLM generation
    if gen is None:
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

    # Persist the lesson plan on the session and populate subtopics from matters
    session.lesson_plan = plan
    session.subtopics = [
        SubtopicProgress(name=matter.label)
        for matter in plan.children
    ]
    session.current_matter_index = 0
    session.current_subtopic_index = 0
    await store.update(session)

    return _plan_to_response(plan)


@router.get("", response_model=LessonPlanResponse, status_code=status.HTTP_200_OK)
async def get_lesson_plan(session: SessionDep) -> LessonPlanResponse:
    """Return the current case file state (with completion statuses)."""
    if session.lesson_plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No lesson plan has been generated for this session yet.",
        )
    return _plan_to_response(session.lesson_plan)


@router.put("/custom", response_model=LessonPlanResponse, status_code=status.HTTP_200_OK)
async def load_custom_lesson_plan(
    body: LessonPlanGeneration,
    session: SessionDep,
    store: SessionStoreDep,
) -> LessonPlanResponse:
    """Accept a custom lesson plan JSON (e.g. from ChatGPT) and apply it.

    Used in user-study mode so the facilitator can paste a pre-generated
    lesson plan without needing env vars or fixture files.
    """
    plan = _generation_to_plan(body)
    session.lesson_plan = plan
    session.subtopics = [
        SubtopicProgress(name=matter.label)
        for matter in plan.children
    ]
    session.current_matter_index = 0
    session.current_subtopic_index = 0
    await store.update(session)
    logger.info("lesson_plan_custom_loaded", session_id=session.id)
    return _plan_to_response(plan)
