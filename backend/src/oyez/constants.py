"""Project-wide constants. No inline magic strings in routes or prompts."""
from __future__ import annotations

from typing import Final, Literal

# ─────────────────────────────────────────────────────────────────────────────
# Examination intensity
# ─────────────────────────────────────────────────────────────────────────────

Intensity = Literal["Preliminary", "Trial", "Appeal"]
INTENSITIES: Final[tuple[Intensity, ...]] = ("Preliminary", "Trial", "Appeal")

# Per-intensity behavioral guidance used in the opposition prompt.
INTENSITY_GUIDANCE: Final[dict[Intensity, str]] = {
    "Preliminary": (
        "Probe foundational understanding. Ask the student to define terms in "
        "their own words and to walk through one concrete example end-to-end. "
        "Push back on vague language ('basically', 'kind of') and demand a "
        "precise restatement. Do not accept a one-line answer as proof of "
        "understanding — request the underlying mechanism."
    ),
    "Trial": (
        "Cross-examine rigorously. Surface assumptions the student left "
        "implicit, point out where their explanation could equally well "
        "describe a different concept, and demand they distinguish. Ask "
        "follow-ups that require composing two ideas, not just naming one. "
        "Treat fluent-sounding answers with extra suspicion: they are the most "
        "likely site of pattern-matched recognition without real understanding."
    ),
    "Appeal": (
        "Apply expert-level pressure. Require precise technical language, "
        "demand justification for every claim, and use counterexamples and "
        "edge cases to probe robustness. A correct surface answer earns the "
        "next harder question, not approval. Reject hand-waving and require "
        "the student to either ground a claim or retract it."
    ),
}

# ─────────────────────────────────────────────────────────────────────────────
# Judge transitions
# Templated strings used when the opposition signals `advance=True`. No LLM
# call — these are intentional, fixed flavor text that the app emits on its
# own authority. If we ever want richer judge dialogue it gets its own
# explicit endpoint.
# ─────────────────────────────────────────────────────────────────────────────

JUDGE_TRANSITIONS: Final[tuple[str, ...]] = (
    "The court is satisfied on this point. Counsel, you may proceed to the next matter.",
    "Very well. The court will move on. Opposing counsel, your next line of inquiry.",
    "Noted. The bench accepts the testimony on this subtopic. Proceed.",
    "So entered into the record. We turn now to the next matter.",
    "Sufficient for the present. Opposing counsel, continue.",
    "The court accepts this. We shall move forward.",
)

# Fallback opening line when the model fails — judge speaks because the app
# decided the judge speaks, not because anything was parsed.
JUDGE_OPENING_FALLBACK: Final[str] = (
    "Court is now in session. Counsel for the defense, please prepare to be "
    "examined on the matter at hand."
)

# ─────────────────────────────────────────────────────────────────────────────
# Co-counsel
# ─────────────────────────────────────────────────────────────────────────────

CO_COUNSEL_FALLBACK_HINT: Final[str] = (
    "Co-Counsel leans in: focus on the core mechanism — what causes what, and "
    "in what order. Pick one concrete example and walk it through end-to-end "
    "before generalizing."
)

# Co-counsel use carries a jury-favor penalty. Centralized so the frontend
# and backend agree.
CO_COUNSEL_JURY_PENALTY: Final[int] = 5

# ─────────────────────────────────────────────────────────────────────────────
# Scoring bounds
# ─────────────────────────────────────────────────────────────────────────────

QUALITY_DELTA_MIN: Final[int] = -15
QUALITY_DELTA_MAX: Final[int] = 15
JURY_DELTA_MIN: Final[int] = -10
JURY_DELTA_MAX: Final[int] = 10

# ─────────────────────────────────────────────────────────────────────────────
# Session limits
# ─────────────────────────────────────────────────────────────────────────────

SUBTOPIC_COUNT: Final[int] = 4
MESSAGE_HISTORY_WINDOW: Final[int] = 12  # turns of context sent to the model

# Google File API objects expire ~48h after upload. We persist this in the
# session and prune on read.
FILE_TTL_SECONDS: Final[int] = 47 * 3600  # one-hour safety margin

# ─────────────────────────────────────────────────────────────────────────────
# Model sampling defaults (per Gemma 4 best practice)
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_TEMPERATURE: Final[float] = 1.0
DEFAULT_TOP_P: Final[float] = 0.95
DEFAULT_TOP_K: Final[int] = 64
DEFAULT_MAX_OUTPUT_TOKENS: Final[int] = 768
