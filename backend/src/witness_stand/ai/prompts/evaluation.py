"""Case file evaluation prompt composition.

Builds the system instruction and chat history for the evaluator that
checks student responses against answer keys and produces checkoff
updates + constructive feedback.

The evaluator receives the full chat history so it can credit
understanding demonstrated across multiple turns, not just the latest
message.
"""
from __future__ import annotations

from typing import Iterable

from witness_stand.ai.base import ChatMessage
from witness_stand.ai.prompts._loader import fill
from witness_stand.schemas.examiner import TranscriptMessage
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


def build_evaluation_history(
    *,
    transcript: Iterable[TranscriptMessage],
    new_defense_message: str,
) -> list[ChatMessage]:
    """Build the chat history the evaluator sees.

    Same inclusion rules as the opposition history (defense → user,
    counsel → model, judge/co_counsel omitted), with an evaluation
    instruction appended to the latest user message.
    """
    history: list[ChatMessage] = []
    for msg in transcript:
        if msg.speaker == "defense":
            history.append(ChatMessage(role="user", content=msg.content))
        elif msg.speaker == "counsel":
            history.append(ChatMessage(role="model", content=msg.content))

    eval_instruction = (
        f"Student's latest testimony:\n{new_defense_message}\n\n"
        "Evaluate which case file nodes (if any) the student's "
        "testimony satisfies. Consider understanding demonstrated "
        "across the full conversation, not just this single message. "
        "Be generous with credit."
    )
    history.append(ChatMessage(role="user", content=eval_instruction))
    return history
