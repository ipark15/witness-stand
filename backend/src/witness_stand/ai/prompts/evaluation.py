"""Case file evaluation prompt composition.

Under the unified chat_log design, the evaluator reads the same
``session.chat_log`` opposition and co-counsel read — it sees the full
conversation context, including any co-counsel asides. The evaluator
call is read-only: it does NOT append to chat_log because it's an
internal "rubric check," not a turn in the conversation.

The transient user turn this module builds carries the evaluator's
instruction (which case file we're evaluating against, plus a pointer
to the latest defense testimony already present in chat_log).
"""
from __future__ import annotations

from witness_stand.ai.base import ChatMessage
from witness_stand.ai.prompts._loader import fill
from witness_stand.schemas.lesson_plan import CaseFileNode


def _format_remaining_nodes(matter: CaseFileNode) -> str:
    """Format the remaining (non-covered) leaf nodes for the evaluator."""
    lines: list[str] = []
    for node in matter.children:
        if node.status in ("covered", "skipped"):
            continue
        lines.append(
            f"- [{node.category.value if node.category else 'group'}] "
            f"id={node.id}, label={node.label}\n"
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


def build_evaluation_user_turn() -> ChatMessage:
    """Build the transient user turn that triggers the evaluator's check.

    All conversational context is in ``session.chat_log``; this turn just
    asks the evaluator to issue its structured verdict. Not persisted.
    """
    return ChatMessage(
        role="user",
        content=(
            "Evaluate which case file nodes (if any) the student's most "
            "recent testimony satisfies. Consider understanding demonstrated "
            "across the full conversation above, not just the latest message. "
            "Be generous with credit. Return the structured EvaluationResult."
        ),
    )
