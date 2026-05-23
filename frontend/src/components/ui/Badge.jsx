import { getStrengthColor, getStrengthLabel } from '../../lib/scoring.js';

export default function Badge({ value, label, className = '' }) {
  const displayLabel = label || getStrengthLabel(value);
  const colorClasses = getStrengthColor(value);
  return (
    <span className={`font-sans text-xs px-2 py-0.5 rounded border ${colorClasses} ${className}`}>
      {displayLabel}
    </span>
  );
}
