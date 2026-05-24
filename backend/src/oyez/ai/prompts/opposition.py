"""Opposition examiner prompt composition.

* ``build_opposition_system(...)`` — fills the persona template with the
  *stable* session context (subject/topic/intensity/intensity-guidance).
  This goes into the LLM call's ``system`` parameter and stays constant
  across every turn of the session, which is what lets the provider
  cache the prefix.
* ``compose_opposition_defense_turn(...)`` — composes the user-turn content
  (state header + defense's testimony) that gets persisted to ``chat_log``.
  Routes call this once per turn, append it via
  ``Session.append_defense_to_chat``, and send the chat_log to the LLM.
* ``build_opposition_opening_turn(...)`` — single-prompt builder for the
  very first examiner turn, before any dialogue exists.
"""
from __future__ import annotations

from textwrap import dedent

from oyez.ai.prompts._loader import fill, load_template
from oyez.constants import INTENSITY_GUIDANCE, Intensity


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
# Defense-turn composition (state header + testimony)
# ─────────────────────────────────────────────────────────────────────────────


def _per_turn_state_header(*, current_subtopic: str, jury_favor: int) -> str:
    """Tiny block prepended once to the defense turn at write time.

    Once persisted to chat_log this string is frozen there; it does not
    get rewritten on subsequent calls. That's deliberate — frozen state
    in history is an accurate record of state-at-the-time-of-turn.
    """
    return dedent(
        f"""
        ── State this turn ──
        Current matter: {current_subtopic}
        Jury favor (0 hostile … 100 favorable): {jury_favor}

        ── Defense's testimony ──
        """
    ).strip() + "\n"


def compose_opposition_defense_turn(
    *,
    new_defense_message: str,
    current_subtopic: str,
    jury_favor: int,
) -> str:
    """Compose the user-turn content for a defense submission.

    The result is a single string ready to persist to ``chat_log`` as a
    ``role="user"`` ``ChatMessage`` via ``Session.append_defense_to_chat``.
    """
    header = _per_turn_state_header(
        current_subtopic=current_subtopic,
        jury_favor=jury_favor,
    )
    return header + new_defense_message


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
