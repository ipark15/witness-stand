"""Prompt composition layer.

Persona definitions (the *stable* part of each prompt) live in editable
``backend/prompts/*.md`` files. The functions in this package compose those
templates with per-call dynamic state.

Why both: the persona text is the thing we want to iterate on during user
studies without touching Python; the per-call composition is the thing we
want type checking and IDE help for.
"""

from oyez.ai.prompts.co_counsel import (
    build_co_counsel_system,
    build_co_counsel_user_turn,
)
from oyez.ai.prompts.evaluation import (
    build_evaluation_system,
    build_evaluation_user_turn,
)
from oyez.ai.prompts.lesson_plan import (
    build_lesson_plan_prompt,
    build_lesson_plan_system,
)
from oyez.ai.prompts.opposition import (
    build_opposition_opening_turn,
    build_opposition_system,
    compose_opposition_defense_turn,
)
from oyez.ai.prompts.subtopic_planner import (
    build_subtopic_planner_prompt,
    build_subtopic_planner_system,
)

__all__ = [
    "build_co_counsel_system",
    "build_co_counsel_user_turn",
    "build_evaluation_system",
    "build_evaluation_user_turn",
    "build_lesson_plan_prompt",
    "build_lesson_plan_system",
    "build_opposition_opening_turn",
    "build_opposition_system",
    "compose_opposition_defense_turn",
    "build_subtopic_planner_prompt",
    "build_subtopic_planner_system",
]
