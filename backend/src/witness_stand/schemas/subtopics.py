"""Subtopic planning — structured LLM output + HTTP response."""
from __future__ import annotations

from pydantic import BaseModel, Field

from witness_stand.constants import SUBTOPIC_COUNT


class SubtopicPlan(BaseModel):
    """Structured output schema for the subtopic planner LLM call."""

    subtopics: list[str] = Field(
        min_length=SUBTOPIC_COUNT,
        max_length=SUBTOPIC_COUNT,
        description=(
            f"Exactly {SUBTOPIC_COUNT} distinct subtopics. Each 4–7 words, "
            "phrased as a noun phrase, scoped to the course material if "
            "provided."
        ),
    )
    rationale: str = Field(
        description="One private sentence explaining this carving.",
    )


class SubtopicsResponse(BaseModel):
    """POST /api/sessions/{id}/subtopics response."""

    subtopics: list[str]
    used_files: bool = Field(
        description="Whether the carving was anchored to attached course materials.",
    )
