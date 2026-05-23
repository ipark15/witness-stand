"""Examiner turn — structured output from the opposition + request/response DTOs."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from witness_stand.schemas.lesson_plan import SectionUpdate
from witness_stand.schemas.scoring import ScoringRubric

# Who in the courtroom is speaking on a given message. This is determined by
# the endpoint that produced the message, never parsed from model output.
Speaker = Literal["defense", "counsel", "judge", "co_counsel"]


class ExaminerTurn(BaseModel):
    """The structured output schema the opposition examiner conforms to.

    The role is implicit (this is what the opposition endpoint returns) —
    there is no `role` field. Anything that parses prose to determine the
    speaker is a bug.
    """

    message: str = Field(
        description=(
            "What Opposing Counsel says to the student this turn. One focused "
            "question or one focused challenge. Under 80 words."
        ),
    )
    advance: bool = Field(
        description=(
            "True only if the student has actually demonstrated mechanism-level "
            "understanding of the current subtopic. The default is false."
        ),
    )
    scoring: ScoringRubric = Field(
        description="Honest judgment of the student's latest testimony.",
    )
    rationale: str = Field(
        description=(
            "One private sentence: why you chose this question/challenge. The "
            "student does not see this."
        ),
    )
    section_updates: list[SectionUpdate] = Field(
        default_factory=list,
        description=(
            "Case file sections addressed by the student's testimony this turn. "
            "Empty if no sections were meaningfully advanced. The opposition "
            "reviews the case file answer key and signals when the student's "
            "explanation covers a node."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# HTTP request / response shapes
# ─────────────────────────────────────────────────────────────────────────────


class TurnRequest(BaseModel):
    """POST /api/sessions/{id}/turns body."""

    message: str = Field(min_length=1, description="The defense's testimony.")


class TranscriptMessage(BaseModel):
    """A persisted turn in a session's transcript."""

    id: str
    speaker: Speaker
    content: str
    created_at: datetime
    # Only populated for opposition turns — the model's rationale + scoring
    # for the *student's* preceding message. Frontend can display the scoring
    # but should not surface rationale to the student.
    scoring: ScoringRubric | None = None
    rationale: str | None = None


class OppositionResponse(BaseModel):
    """POST /api/sessions/{id}/turns response.

    Bundles the opposition's reply, the resulting score deltas, and — if
    the examiner signaled ``advance`` — a templated judge transition picked
    by the backend (NOT an LLM call).
    """

    counsel_message: TranscriptMessage = Field(
        description="The opposition's reply to the student's testimony.",
    )
    judge_transition: TranscriptMessage | None = Field(
        default=None,
        description=(
            "If the opposition set `advance=true`, the court emits a templated "
            "transition. Absent when not advancing."
        ),
    )
    quality_delta: int = Field(
        description=(
            "Change to the current subtopic's quality score, derived from the "
            "examiner's scoring rubric. Bounded by configured min/max."
        ),
    )
    jury_delta: int = Field(
        description="Change to overall jury favor, bounded by configured min/max.",
    )
    advanced_subtopic: bool = Field(
        description="Did the examination move to the next subtopic this turn?",
    )
    session_complete: bool = Field(
        description="True if the last subtopic just concluded.",
    )
    section_updates: list[SectionUpdate] = Field(
        default_factory=list,
        description="Case file nodes whose status changed this turn.",
    )
