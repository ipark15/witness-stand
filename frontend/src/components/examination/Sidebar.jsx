import Avatar from '../ui/Avatar.jsx';
import ScoreBar from '../ui/ScoreBar.jsx';
import SectionHeading from '../ui/SectionHeading.jsx';
import { getScoreTextColor, getScoreLabel } from '../../lib/scoring.js';

const ROSTER = [
  { role: 'judge', name: 'The Honorable AI', label: 'Presiding Judge' },
  { role: 'counsel', name: 'AI Examiner', label: 'Opposing Counsel' },
  { role: 'defense', name: 'You', label: 'Defense Counsel' },
];

export default function Sidebar({ juryFavor, subtopicScores, currentSubtopicIndex }) {
  return (
    <aside className="w-52 shrink-0 border-r border-ink/10 bg-white/20 flex flex-col">
      {/* Court Roster */}
      <div className="p-4 border-b border-ink/10">
        <SectionHeading className="mb-3">Court Roster</SectionHeading>
        {ROSTER.map((p) => (
          <div key={p.role} className="flex items-center gap-2.5 mb-3">
            <Avatar role={p.role} size="w-7 h-7" />
            <div>
              <p className="font-sans text-xs text-ink leading-tight">{p.name}</p>
              <p className="font-sans text-xs text-ink/40">{p.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Jury Favor */}
      <div className="p-4 border-b border-ink/10">
        <div className="flex justify-between items-center mb-1.5">
          <SectionHeading>Jury Favor</SectionHeading>
          <span className="font-sans text-sm text-ink font-semibold">{juryFavor}</span>
        </div>
        <ScoreBar value={juryFavor} className="mb-1" />
        <div className="flex justify-between">
          <span className="font-sans text-xs text-crimson">Hostile</span>
          <span className={`font-sans text-xs font-semibold ${getScoreTextColor(juryFavor)}`}>
            {getScoreLabel(juryFavor)}
          </span>
          <span className="font-sans text-xs text-green-600">Favorable</span>
        </div>
      </div>

      {/* Evidence Quality */}
      <div className="p-4 flex-1 overflow-y-auto">
        <SectionHeading className="mb-3">Evidence Quality</SectionHeading>
        <div className="space-y-3">
          {subtopicScores.map((s, i) => (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <span
                  className={`font-sans text-xs truncate max-w-[110px] ${
                    i === currentSubtopicIndex ? 'text-navy font-semibold' : 'text-ink/40'
                  }`}
                >
                  {s.name}
                </span>
                <span className="font-sans text-xs text-ink/35">{s.quality}</span>
              </div>
              <ScoreBar value={s.quality} height="h-1" />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
