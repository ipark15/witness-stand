import { SCORE_THRESHOLDS } from './constants.js';

export function getScoreColor(value) {
  if (value >= SCORE_THRESHOLDS.FAVORABLE) return 'bg-green-500';
  if (value >= SCORE_THRESHOLDS.NEUTRAL) return 'bg-gold';
  return 'bg-crimson';
}

export function getScoreTextColor(value) {
  if (value >= SCORE_THRESHOLDS.FAVORABLE) return 'text-green-600';
  if (value >= SCORE_THRESHOLDS.NEUTRAL) return 'text-gold';
  return 'text-crimson';
}

export function getScoreLevel(value) {
  if (value >= SCORE_THRESHOLDS.FAVORABLE) return 'favorable';
  if (value >= SCORE_THRESHOLDS.NEUTRAL) return 'neutral';
  return 'hostile';
}

export function getScoreLabel(value) {
  if (value >= SCORE_THRESHOLDS.FAVORABLE) return 'Favorable';
  if (value >= SCORE_THRESHOLDS.NEUTRAL) return 'Neutral';
  return 'Hostile';
}

export function getStrengthLabel(value) {
  if (value >= SCORE_THRESHOLDS.FAVORABLE) return 'Strong';
  if (value >= SCORE_THRESHOLDS.NEUTRAL) return 'Developing';
  return 'Weak';
}

export function getStrengthColor(value) {
  if (value >= SCORE_THRESHOLDS.FAVORABLE) return 'bg-green-100 text-green-700 border-green-200';
  if (value >= SCORE_THRESHOLDS.NEUTRAL) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-red-100 text-red-700 border-red-200';
}
