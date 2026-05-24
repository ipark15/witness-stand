"""Fixture loader for pre-generated lesson plans.

Allows starting sessions with hardcoded lesson plans to save API tokens
during development and user studies.
"""
from __future__ import annotations

import json
from pathlib import Path

from oyez.schemas.lesson_plan import LessonPlanGeneration

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "fixtures" / "lesson_plans"


def _fixture_key(subject: str, topic: str) -> str:
    """Convert subject + topic into a fixture filename slug."""
    slug = f"{subject}-{topic}".lower().replace(" ", "-").replace("/", "-")
    return slug


def load_fixture(subject: str, topic: str) -> LessonPlanGeneration | None:
    """Load a pre-generated lesson plan from fixtures, or None if not found."""
    key = _fixture_key(subject, topic)
    path = _FIXTURES_DIR / f"{key}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    try:
        return LessonPlanGeneration.model_validate(data)
    except Exception:
        return None


def list_fixtures() -> list[str]:
    """List available fixture filenames (without extension)."""
    if not _FIXTURES_DIR.exists():
        return []
    return [p.stem for p in _FIXTURES_DIR.glob("*.json")]
