"""Lesson plan (case file) prompt composition.

* ``build_lesson_plan_system(...)`` — fills the persona template with
  stable session context (subject/topic/scope guidance).
* ``build_lesson_plan_prompt(...)`` — single-prompt builder for the
  structured generation call.

Design status: STUB — prompt content in lesson_plan_system.md will evolve
after workshopping the toy example interactively.
"""
from __future__ import annotations

from textwrap import dedent

from oyez.ai.prompts._loader import fill, load_template


def build_lesson_plan_system(
    *,
    subject: str,
    topic: str,
    has_materials: bool,
) -> str:
    """Stable system instruction for the lesson plan generator."""
    scope_guidance = (
        "Course materials have been attached. Anchor your breakdown to the "
        "depth and scope they imply. Do not drift to prerequisites the "
        "materials assume nor to generalizations the materials do not cover."
        if has_materials
        else "No course materials are attached. Construct the breakdown at "
        "the level a competent undergraduate would be expected to defend "
        "in an oral examination."
    )
    return fill(
        "lesson_plan_system",
        subject=subject,
        topic=topic,
        scope_guidance=scope_guidance,
    )


def build_lesson_plan_prompt(
    *,
    subject: str,
    topic: str,
    has_materials: bool,
) -> str:
    """Single-prompt builder for the lesson plan structured call."""
    materials_clause = (
        "Course materials are attached — use them to calibrate depth and "
        "select which sub-concepts to include."
        if has_materials
        else "No materials attached — use standard curriculum knowledge for "
        "this subject at an undergraduate level."
    )
    return dedent(
        f"""
        Subject: {subject}
        Topic: {topic}

        {materials_clause}

        Produce a structured lesson plan / case file. Use the structured
        response schema provided. Each top-level matter should break into
        2–5 leaf nodes with category, prompt_hint, and answer_key filled.
        Populate `rationale` with one private sentence explaining the
        breakdown you chose.
        """
    ).strip()
