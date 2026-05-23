"""Prompt composition layer.

Persona definitions (the *stable* part of each prompt) live in editable
``backend/prompts/*.md`` files. The functions in this package compose those
templates with per-call dynamic state.

Why both: the persona text is the thing we want to iterate on during user
studies without touching Python; the per-call composition is the thing we
want type checking and IDE help for.
"""

from witness_stand.ai.prompts.co_counsel import (
    build_co_counsel_history,
    build_co_counsel_system,
)
from witness_stand.ai.prompts.evaluation import (
    build_evaluation_history,
    build_evaluation_system,
)
from witness_stand.ai.prompts.lesson_plan import (
    build_lesson_plan_prompt,
    build_lesson_plan_system,
)
from witness_stand.ai.prompts.opposition import (
    build_opposition_history,
    build_opposition_opening_turn,
    build_opposition_system,
)
from witness_stand.ai.prompts.subtopic_planner import (
    build_subtopic_planner_prompt,
    build_subtopic_planner_system,
)

__all__ = [
    "build_co_counsel_history",
    "build_co_counsel_system",
    "build_evaluation_history",
    "build_evaluation_system",
    "build_lesson_plan_prompt",
    "build_lesson_plan_system",
    "build_opposition_history",
    "build_opposition_opening_turn",
    "build_opposition_system",
    "build_subtopic_planner_prompt",
    "build_subtopic_planner_system",
]
