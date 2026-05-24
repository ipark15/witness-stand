"""Subtopic planner prompt composition."""
from __future__ import annotations

from textwrap import dedent

from oyez.ai.prompts._loader import load_template
from oyez.constants import SUBTOPIC_COUNT


def build_subtopic_planner_system() -> str:
    """Stable system instruction for the subtopic-planner persona."""
    return load_template("subtopic_planner_system")


def build_subtopic_planner_prompt(
    *,
    subject: str,
    topic: str,
    has_materials: bool,
) -> str:
    """Single-prompt builder for the subtopic-planning structured call."""
    materials_clause = (
        "Course materials have been attached. Anchor your carving to the "
        "depth and scope they imply. Do not drift to prerequisites the "
        "materials assume nor to generalizations the materials do not cover."
        if has_materials
        else "No course materials are attached. Carve the topic at the level "
        "a competent undergraduate would be expected to defend."
    )
    return dedent(
        f"""
        Subject: {subject}
        Topic: {topic}

        {materials_clause}

        Produce exactly {SUBTOPIC_COUNT} subtopics. Use the structured
        response schema provided. Populate `rationale` with one private
        sentence explaining the carving you chose.
        """
    ).strip()
