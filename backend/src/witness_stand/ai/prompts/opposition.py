"""Opposition examiner prompt composition.

* ``build_opposition_system(...)`` — fills the persona template with the
  *stable* session context (subject/topic/intensity/intensity-guidance).
  This goes into the LLM call's ``system`` parameter and stays constant
  across every turn of the session, which is what lets the provider
  cache the prefix.
* ``build_opposition_history(...)`` — converts the session transcript
  into the ``ChatMessage`` list the LLM expects, omitting roles the model
  should not see (judge, co-counsel) and prepending the per-turn mutable
  state header to the most recent defense message.
* ``build_opposition_opening_turn(...)`` — single-prompt builder for the
  very first examiner turn, before any dialogue exists.
"""
from __future__ import annotations

from textwrap import dedent
from typing import Iterable

from witness_stand.ai.base import ChatMessage
from witness_stand.ai.prompts._loader import fill, load_template
from witness_stand.constants import INTENSITY_GUIDANCE, Intensity
from witness_stand.schemas.examiner import TranscriptMessage


# ─────────────────────────────────────────────────────────────────────────────
# System instruction
# ─────────────────────────────────────────────────────────────────────────────


def build_opposition_system(
    *,
    subject: str,
    topic: str,
    intensity: Intensity,
) -> str:
    """Stable system instruction for an entire session."""
    return fill(
        "opposition_system",
        subject=subject,
        topic=topic,
        intensity=intensity,
        intensity_guidance=INTENSITY_GUIDANCE[intensity],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Chat history construction
# ─────────────────────────────────────────────────────────────────────────────


def _per_turn_state_header(*, current_subtopic: str, jury_favor: int) -> str:
    """Tiny block prepended to the latest defense message only.

    Keeping per-turn state on the tail (rather than in the system
    instruction) preserves the cacheable prefix on every prior turn.
    """
    return dedent(
        f"""
        ── State this turn ──
        Current matter: {current_subtopic}
        Jury favor (0 hostile … 100 favorable): {jury_favor}

        ── Defense's testimony ──
        """
    ).strip() + "\n"


def build_opposition_history(
    *,
    transcript: Iterable[TranscriptMessage],
    new_defense_message: str,
    current_subtopic: str,
    jury_favor: int,
) -> list[ChatMessage]:
    """Turn the session transcript into the chat history the opposition sees.

    Inclusion rules (per design doc):
      * defense → "user"
      * past counsel → "model"
      * judge → omitted (judge is the app; including risks model imitating)
      * co_counsel → omitted (private to defense)

    The ``new_defense_message`` arrives as the most recent user turn with
    the per-turn state header prepended.
    """
    history: list[ChatMessage] = []
    for msg in transcript:
        if msg.speaker == "defense":
            history.append(ChatMessage(role="user", content=msg.content))
        elif msg.speaker == "counsel":
            history.append(ChatMessage(role="model", content=msg.content))
        # judge / co_counsel: skip

    header = _per_turn_state_header(
        current_subtopic=current_subtopic,
        jury_favor=jury_favor,
    )
    history.append(ChatMessage(role="user", content=header + new_defense_message))
    return history


# ─────────────────────────────────────────────────────────────────────────────
# Opening turn (single-prompt; no dialogue history yet)
# ─────────────────────────────────────────────────────────────────────────────


_OPENING_TEMPLATE = dedent(
    """
    ── State this turn ──
    Current matter: {current_subtopic}
    Jury favor: 50 (neutral)

    The defense has just been seated. Open the cross-examination by asking
    the student to begin explaining the current matter in their own words.
    Do not provide hints. Do not summarize the topic. Use the structured
    response schema. Set `advance` to false (the student has not yet
    spoken). Populate `scoring` with neutral 50-across-the-board values
    since there is no testimony yet to judge.
    """
).strip()


def build_opposition_opening_turn(*, current_subtopic: str) -> str:
    """Single-prompt builder for the session-opening examiner turn.

    The persona / case context is supplied via the system instruction;
    this prompt only carries the opening instruction itself.
    """
    # Eager-load the persona file to surface "template missing" errors at
    # call time, not silently. We don't use the returned text here.
    load_template("opposition_system")
    return _OPENING_TEMPLATE.format(current_subtopic=current_subtopic)
