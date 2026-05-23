"""Load persona templates from ``backend/prompts/*.md`` once at import."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

# This file lives at  src/witness_stand/ai/prompts/_loader.py
# Templates live at   backend/prompts/*.md
# Walk up four levels to reach the backend root.
_PROMPTS_DIR = Path(__file__).resolve().parents[4] / "prompts"


class PromptTemplateNotFound(FileNotFoundError):
    pass


@lru_cache(maxsize=None)
def load_template(name: str) -> str:
    """Read ``backend/prompts/<name>.md`` from disk, cached.

    The cache is process-lifetime; restart the server to pick up edits to
    the .md files.
    """
    path = _PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise PromptTemplateNotFound(
            f"Prompt template '{name}.md' not found in {_PROMPTS_DIR}"
        )
    return path.read_text(encoding="utf-8").strip()


def fill(template_name: str, **fields: object) -> str:
    """Load ``<template_name>.md`` and ``.format(**fields)`` it.

    Persona templates use Python ``str.format`` placeholders (``{subject}``,
    ``{topic}``, ...). To include a literal brace, double it: ``{{`` / ``}}``.
    """
    template = load_template(template_name)
    try:
        return template.format(**fields)
    except KeyError as exc:
        raise KeyError(
            f"Prompt template '{template_name}.md' references unknown field {exc}. "
            f"Available fields: {sorted(fields)}."
        ) from exc
