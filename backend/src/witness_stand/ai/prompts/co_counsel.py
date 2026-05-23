"""Co-counsel hint prompt composition.

Co-counsel sees the same defense ↔ opposition dialogue the user sees, then
emits a single short whispered nudge. We use the chat shape so the model
can read the back-and-forth, but we only ever ask for one hint per call.
"""
from __future__ import annotations

from textwrap import dedent
from typing import Iterable

from witness_stand.ai.base import ChatMessage
from witness_stand.ai.prompts._loader import fill
from witness_stand.schemas.examiner import TranscriptMessage


def build_co_counsel_system(*, subject: str, topic: str) -> str:
    """Stable system instruction for the co-counsel persona within a session."""
    return fill(
        "co_counsel_system",
        subject=subject,
        topic=topic,
    )


_HINT_REQUEST_SUFFIX = dedent(
    """
    ── Request ──
    Defense has signalled they need a private hint. Lean in and whisper a
    nudge — one short turn, no question, no full answer. Start with
    "Co-Counsel leans in:" and stay under 60 words.
    """
).strip()


def build_co_counsel_history(
    *,
    transcript: Iterable[TranscriptMessage],
    current_subtopic: str,
) -> list[ChatMessage]:
    """Project the recent courtroom exchange into co-counsel's POV.

    Defense remains "user". Past opposition turns are surfaced as "user"
    content too, framed as quoted exchange — to co-counsel, the opposition
    is part of the external situation to react to, not the assistant whose
    voice we are continuing.
    """
    pieces: list[str] = [f"Current matter: {current_subtopic}", ""]
    for msg in transcript:
        if msg.speaker == "defense":
            pieces.append(f"Defense: {msg.content}")
        elif msg.speaker == "counsel":
            pieces.append(f"Opposing Counsel: {msg.content}")
        # judge / co_counsel asides are not relevant for this hint

    if len(pieces) == 2:
        pieces.append("(Examination has not yet produced a meaningful exchange.)")

    pieces.append("")
    pieces.append(_HINT_REQUEST_SUFFIX)
    content = "\n".join(pieces).strip()
    return [ChatMessage(role="user", content=content)]
