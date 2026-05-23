export default function SubtopicProgress({ subtopics, currentIndex, progressFraction }) {
  return (
    <div className="bg-white/30 border-b border-ink/10 px-6 py-2.5 shrink-0">
      <div className="flex items-center gap-1 overflow-x-auto">
        {subtopics.map((st, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <div className="w-3 h-px bg-ink/15 shrink-0" />}
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isDone
                      ? 'bg-gold'
                      : isCurrent
                      ? 'bg-navy ring-2 ring-navy/30'
                      : 'bg-ink/15'
                  }`}
                />
                <span
                  className={`font-sans text-xs whitespace-nowrap ${
                    isCurrent
                      ? 'text-navy font-semibold'
                      : isDone
                      ? 'text-gold/80'
                      : 'text-ink/35'
                  }`}
                >
                  {st.length > 22 ? st.slice(0, 22) + '…' : st}
                </span>
                {isCurrent && (
                  <div className="w-16 h-1 bg-ink/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-navy rounded-full transition-all duration-700"
                      style={{ width: `${progressFraction * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
