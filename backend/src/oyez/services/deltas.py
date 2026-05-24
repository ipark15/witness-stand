"""Map the model-judged ``ScoringRubric`` into the jury/quality deltas the
frontend already knows how to display.

The mapping intentionally rewards mechanism-level understanding (the project's
core value) and refuses to reward verbosity, keyword sprinkling, or surface
confidence. The previous lexical scorer did the opposite; this is the
single-point-of-difference fix.
"""
from __future__ import annotations

from oyez.constants import (
    JURY_DELTA_MAX,
    JURY_DELTA_MIN,
    QUALITY_DELTA_MAX,
    QUALITY_DELTA_MIN,
)
from oyez.schemas.scoring import ScoringRubric


# Weights for combining the four rubric dimensions into a single 0..100 score.
# Mechanism-vs-recognition dominates because it is the load-bearing dimension
# of the project's representation. Sum is 1.0.
_WEIGHTS: dict[str, float] = {
    "correctness": 0.30,
    "specificity": 0.20,
    "mechanism_vs_recognition": 0.40,
    "confidence_calibration": 0.10,
}

# A neutral testimony lands near 50. We translate to a signed delta with this
# pivot, then scale so the bounds match the frontend's display range.
_PIVOT: int = 50


def _composite(rubric: ScoringRubric) -> float:
    return (
        _WEIGHTS["correctness"] * rubric.correctness
        + _WEIGHTS["specificity"] * rubric.specificity
        + _WEIGHTS["mechanism_vs_recognition"] * rubric.mechanism_vs_recognition
        + _WEIGHTS["confidence_calibration"] * rubric.confidence_calibration
    )


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def rubric_to_deltas(rubric: ScoringRubric) -> tuple[int, int]:
    """Return ``(quality_delta, jury_delta)`` derived from the rubric.

    Quality deltas swing in [QUALITY_DELTA_MIN, QUALITY_DELTA_MAX] and track
    the composite score relative to 50. Jury deltas are dampened versions of
    the same signal so a single wobbly turn doesn't flip the overall meter.
    """
    composite = _composite(rubric)
    # Centered signal: -50..+50 → scale to delta ranges.
    centered = composite - _PIVOT  # in [-50, 50]

    quality_span = (QUALITY_DELTA_MAX - QUALITY_DELTA_MIN) / 100.0  # ±0.3 per point
    jury_span = (JURY_DELTA_MAX - JURY_DELTA_MIN) / 100.0  # ±0.2 per point

    quality_delta = round(centered * quality_span * 2)  # *2 because centered is ±50
    jury_delta = round(centered * jury_span * 2)

    return (
        _clamp(quality_delta, QUALITY_DELTA_MIN, QUALITY_DELTA_MAX),
        _clamp(jury_delta, JURY_DELTA_MIN, JURY_DELTA_MAX),
    )
