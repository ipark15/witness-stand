"""Lesson plan / case file schemas.

The lesson plan is a hierarchical breakdown of what a student should be able
to explain for a given topic. Each leaf node represents a discrete piece of
understanding (a "claim" the defense should be able to make). The internal
answer key is never sent to the frontend — only the structure and completion
state are visible to the student.

Design status: STUB — structure will evolve after workshopping the toy
example (e.g., OS virtual memory) interactively.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Node types — what kind of understanding is expected at this leaf
# ─────────────────────────────────────────────────────────────────────────────

class NodeCategory(str, Enum):
    """Category of understanding expected for a case file node.

    These are the structural labels visible to the student — they tell the
    student *what kind* of explanation is needed without revealing content.
    """

    motivation = "motivation"       # Why does this exist? What problem does it solve?
    definition = "definition"       # What IS it? (abstraction, not just the name)
    mechanism = "mechanism"         # HOW does it work? (the load-bearing dimension)
    example = "example"             # Concrete instance / walkthrough
    tradeoff = "tradeoff"           # What's the cost? What's the alternative?
    distinction = "distinction"     # How is this different from X?


# ─────────────────────────────────────────────────────────────────────────────
# Case file node — one "claim" the defense should produce
# ─────────────────────────────────────────────────────────────────────────────

class CaseFileNode(BaseModel):
    """A single node in the lesson plan hierarchy.

    Leaf nodes carry an answer_key (internal) and a completion status.
    Branch nodes group related leaves under a heading.
    """

    id: str = Field(description="Stable id for this node (slug-style, e.g. 'tlb-mechanism').")
    label: str = Field(description="Human-readable label shown to the student (short).")
    category: NodeCategory | None = Field(
        default=None,
        description="What kind of understanding this node expects. None for branch nodes.",
    )
    prompt_hint: str = Field(
        default="",
        description=(
            "A one-line question/prompt visible to the student that frames "
            "what they should explain. Does NOT reveal the answer."
        ),
    )
    children: list["CaseFileNode"] = Field(
        default_factory=list,
        description="Sub-nodes. Empty for leaf nodes.",
    )

    # ── Internal (never sent to frontend) ────────────────────────────────
    answer_key: str = Field(
        default="",
        description=(
            "The expected explanation (internal). Used by the opposition to "
            "judge whether the student's testimony satisfies this node. "
            "NOT shown to the student."
        ),
    )

    # ── Mutable state ────────────────────────────────────────────────────
    status: Literal["pending", "partial", "covered"] = Field(
        default="pending",
        description=(
            "Whether the student has addressed this node. "
            "'pending' = not yet discussed, "
            "'partial' = mentioned but incomplete, "
            "'covered' = sufficiently explained."
        ),
    )


# Allow recursive model
CaseFileNode.model_rebuild()


# ─────────────────────────────────────────────────────────────────────────────
# Lesson plan — the full case file for one examination topic
# ─────────────────────────────────────────────────────────────────────────────

class LessonPlan(BaseModel):
    """The structured case file the AI generates before examination begins.

    Top-level children correspond roughly to what subtopics were before —
    they are the major "matters" the court will examine. Within each matter,
    the hierarchy breaks the concept into the kinds of understanding the
    student should demonstrate.
    """

    topic: str = Field(description="The topic this lesson plan covers.")
    children: list[CaseFileNode] = Field(
        description="Top-level matters (the examination agenda).",
    )
    rationale: str = Field(
        default="",
        description="Internal: why this breakdown was chosen. Not shown to student.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# LLM structured output schema — what the model returns when generating a plan
# ─────────────────────────────────────────────────────────────────────────────


class NodeSpec(BaseModel):
    """One leaf node in the generated plan."""

    label: str = Field(description="Short label for this node.")
    category: NodeCategory
    prompt_hint: str = Field(
        description="Question framing what the student should explain (no spoilers).",
    )
    answer_key: str = Field(
        description=(
            "The expected explanation. One concise paragraph. Also note "
            "acceptable alternative explanations if relevant."
        ),
    )


class MatterSpec(BaseModel):
    """One top-level matter in the generated plan."""

    label: str = Field(description="Short heading (4-8 words).")
    nodes: list[NodeSpec] = Field(
        description="Leaf-level breakdown (2-5 items per matter).",
    )


class LessonPlanGeneration(BaseModel):
    """Structured output schema for the lesson plan generation LLM call.

    This is the shape the model must conform to. We post-process it into
    a LessonPlan with ids and default statuses.
    """

    topic: str
    matters: list[MatterSpec] = Field(
        description="Top-level matters to examine (3-6 items).",
    )
    rationale: str = Field(
        description="One private sentence explaining this breakdown.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# HTTP response (frontend-facing — strips answer keys)
# ─────────────────────────────────────────────────────────────────────────────

class CaseFileNodeDTO(BaseModel):
    """Frontend-safe projection of a case file node (no answer key)."""

    id: str
    label: str
    category: NodeCategory | None
    prompt_hint: str
    children: list["CaseFileNodeDTO"] = Field(default_factory=list)
    status: Literal["pending", "partial", "covered"]


CaseFileNodeDTO.model_rebuild()


class LessonPlanResponse(BaseModel):
    """GET/POST response for the lesson plan — visible to student."""

    topic: str
    matters: list[CaseFileNodeDTO]


# ─────────────────────────────────────────────────────────────────────────────
# Section check-off — what the opposition returns about coverage
# ─────────────────────────────────────────────────────────────────────────────

class SectionUpdate(BaseModel):
    """One section status change signalled by the opposition during a turn."""

    node_id: str = Field(description="Which case file node this applies to.")
    new_status: Literal["partial", "covered"] = Field(
        description="The new status for this node based on the student's testimony.",
    )
    reason: str = Field(
        default="",
        description="Brief rationale (internal) for why this status was assigned.",
    )
