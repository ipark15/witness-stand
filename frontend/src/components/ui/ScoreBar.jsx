import { getScoreColor } from '../../lib/scoring.js';

export default function ScoreBar({ value, height = 'h-2', className = '' }) {
  return (
    <div className={`${height} bg-ink/10 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${getScoreColor(value)}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
