import ScoreBar from '../ui/ScoreBar.jsx';
import Badge from '../ui/Badge.jsx';

export default function StudyGuideView({ topic, subtopicScores, currentSubtopicIndex }) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h2 className="font-serif text-2xl text-ink mb-1">{topic}</h2>
      <p className="font-sans text-xs text-ink/40 mb-6 uppercase tracking-widest">
        Study Guide — Performance Analysis
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subtopicScores.map((s, i) => {
          const cardBorder =
            s.quality < 40
              ? 'border-crimson/30 bg-crimson/4'
              : s.quality >= 70
              ? 'border-green-300/40 bg-green-50/30'
              : 'border-gold/25 bg-white/40';

          return (
            <div key={i} className={`border rounded-xl p-5 ${cardBorder}`}>
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-serif text-ink font-semibold text-base leading-tight">
                  {s.name}
                </h3>
                <Badge value={s.quality} className="ml-2 shrink-0" />
              </div>
              <ScoreBar value={s.quality} height="h-1.5" className="mb-3" />
              <p className="font-serif text-sm text-ink/60 leading-relaxed">
                {s.quality < 40
                  ? `Your testimony on "${s.name}" revealed significant gaps. Priority review recommended before re-examination.`
                  : s.quality < 70
                  ? `Your understanding of "${s.name}" is developing. Reinforce with targeted practice and concrete examples.`
                  : `Your command of "${s.name}" impressed the court. Continue building on this foundation.`}
              </p>
              <p className="font-sans text-xs text-ink/35 mt-2">
                Quality score: {s.quality}/100
                {i === currentSubtopicIndex ? ' · Currently under examination' : ''}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
