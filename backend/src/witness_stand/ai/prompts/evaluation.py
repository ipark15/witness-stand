"""Case file evaluation prompt composition.

Builds the system instruction and context for the evaluator that checks
student responses against answer keys and produces checkoff updates +
constructive feedback.
"""
from __future__ import annotations

from witness_stand.ai.prompts._loader import fill
from witness_stand.schemas.lesson_plan import CaseFileNode


def _format_remaining_nodes(matter: CaseFileNode) -> str:
    """Format the remaining (non-covered) leaf nodes for the evaluator."""
    lines: list[str] = []
    for node in matter.children:
        if node.status == "covered":
            continue
        lines.append(
            f"- [{node.category.value if node.category else 'group'}] "
            f"id={node.id!r}, label={node.label!r}\n"
            f"  status: {node.status}\n"
            f"  prompt_hint: {node.prompt_hint}\n"
            f"  answer_key: {node.answer_key}"
        )
    return "\n\n".join(lines) if lines else "(all nodes covered)"


def build_evaluation_system(
    *,
    subject: str,
    topic: str,
    current_matter: CaseFileNode,
) -> str:
    """System instruction for the case file evaluator."""
    remaining = _format_remaining_nodes(current_matter)
    return fill(
        "evaluation_system",
        subject=subject,
        topic=topic,
        current_matter=current_matter.label,
        remaining_nodes=remaining,
    )
