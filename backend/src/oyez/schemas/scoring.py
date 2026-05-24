"""Model-judged scoring rubric.

This replaces the old word-count + keyword scorer. The opposition examiner
returns its own structured judgment of the student's latest testimony; the
service layer turns that judgment into the jury/quality deltas the frontend
already knows how to display.

Each dimension is in [0, 100]. The model fills these in honestly per turn.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ScoringRubric(BaseModel):
    """Examiner's judgment of a single piece of student testimony.

    Dimensions are deliberately chosen to encode the project's values:
    rigor and robustness, not surface compliance. Verbosity gets no
    credit here; mechanism-level explanation does.
    """

    correctness: int = Field(
        ge=0,
        le=100,
        description="Is the claim made by the student factually right?",
    )
    specificity: int = Field(
        ge=0,
        le=100,
        description=(
            "Did the student speak precisely (named the right mechanism, named "
            "the right object, gave a concrete example) rather than waving in "
            "the general direction of the idea?"
        ),
    )
    mechanism_vs_recognition: int = Field(
        ge=0,
        le=100,
        description=(
            "Did the student EXPLAIN why something happens (mechanism) or only "
            "NAME / RECOGNIZE that it happens (pattern-match)? Higher means more "
            "mechanism. This is the key dimension."
        ),
    )
    confidence_calibration: int = Field(
        ge=0,
        le=100,
        description=(
            "Did the student's expressed confidence match how correct they "
            "were? A confident wrong answer scores low; an appropriately "
            "hedged uncertain-but-mostly-right answer scores high."
        ),
    )
