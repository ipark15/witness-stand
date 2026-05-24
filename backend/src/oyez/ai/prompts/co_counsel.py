"""Co-counsel hint prompt composition.

Under the unified ``chat_log`` design, co-counsel reads the same
session-level chat history that opposition reads — past defense turns,
past opposition replies (prefixed `[Opposing Counsel]`), and any prior
co-counsel asides (prefixed `[Co-Counsel]`) — and replies with one short
whispered nudge.

The route owns the chat_log; this module only constructs the **transient
last user turn** that conveys the current consultation request (matter
header + optional draft + stuck/draft request suffix). That transient
turn is sent at the tail of ``chat_log`` but is NOT persisted — the
persisted form is the stable trigger string ``CO_COUNSEL_TRIGGER`` that
the Session helper writes after the call returns.

This is what gives KV cache reuse: chat_log is byte-identical between
calls, only the trailing transient varies.
"""
from __future__ import annotations

from textwrap import dedent

from oyez.ai.base import ChatMessage
from oyez.ai.prompts._loader import fill


def build_co_counsel_system(*, subject: str, topic: str) -> str:
    """Stable system instruction for the co-counsel persona within a session."""
    return fill(
        "co_counsel_system",
        subject=subject,
        topic=topic,
    )


_STUCK_REQUEST_SUFFIX = dedent(
    """
    ── Request — defense is stuck ──
    Defense has signalled they need a private hint with nothing drafted
    yet. Lean in and whisper a nudge that points at the right territory
    — name the concept, framework, or mental model they should be
    reaching for. One short turn, no question, no full answer. Start
    with "Co-Counsel leans in:" and stay under 60 words.
    """
).strip()


_DRAFT_REQUEST_SUFFIX_TEMPLATE = dedent(
    """
    ── Request — defense has a working draft ──
    Defense has typed the following testimony but has NOT yet delivered
    it to the court:

    ─────
    {draft}
    ─────

    Read the draft. Whisper a private nudge that helps the student
    *improve* it before they speak: name the concept they have not yet
    reached for, the framing that would carry more weight, or the
    structural move that would tighten the argument. Discipline holds —
    name the territory, do not unpack it; do not rewrite their testimony
    for them. If the draft is already strong, say so briefly and point
    at the one thing still missing. Start with "Co-Counsel leans in:"
    and stay under 60 words.
    """
).strip()


def build_co_counsel_user_turn(
    *,
    current_subtopic: str,
    draft: str | None = None,
) -> ChatMessage:
    """Build the transient user turn that triggers a co-counsel reply.

    This turn is appended to ``session.chat_log`` *only for the LLM call*.
    It is NOT persisted to chat_log — the persisted form (a stable trigger
    string) is written via ``Session.append_co_counsel_to_chat`` after the
    call returns. Keeping the request framing out of chat_log is what
    preserves byte-identical history across calls.
    """
    pieces = [f"Current matter: {current_subtopic}", ""]
    if draft:
        pieces.append(_DRAFT_REQUEST_SUFFIX_TEMPLATE.format(draft=draft))
    else:
        pieces.append(_STUCK_REQUEST_SUFFIX)
    return ChatMessage(role="user", content="\n".join(pieces).strip())
