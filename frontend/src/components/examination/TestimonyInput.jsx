import { WORD_COUNT, EXCHANGES_PER_SUBTOPIC } from '../../lib/constants.js';

export default function TestimonyInput({
  input,
  setInput,
  loading,
  coCounselLoading,
  exchangeCount,
  currentSubtopic,
  onSubmit,
  onCoCounsel,
}) {
  const wordCount = input.trim() ? input.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <>
      {/* Current subtopic label */}
      <div className="px-8 py-1.5 border-t border-ink/8 bg-white/20 shrink-0">
        <p className="font-sans text-xs text-ink/40">
          Current matter:{' '}
          <span className="text-navy font-semibold">{currentSubtopic}</span>
          {' '}·{' '}
          <span className="text-ink/30">
            Exchange {(exchangeCount % EXCHANGES_PER_SUBTOPIC) + (exchangeCount % EXCHANGES_PER_SUBTOPIC === 0 && exchangeCount > 0 ? EXCHANGES_PER_SUBTOPIC : 0)}/{EXCHANGES_PER_SUBTOPIC} in this matter
          </span>
        </p>
      </div>

      {/* Input Area */}
      <div className="border-t border-ink/10 bg-white/30 px-8 py-4 shrink-0">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <div className="flex justify-between mb-1.5">
              <div className="flex items-center gap-3">
                <span className="font-sans text-xs text-ink/40">Your testimony</span>
                <button
                  onClick={onCoCounsel}
                  disabled={loading || coCounselLoading}
                  title="Consult co-counsel for a hint (-5 jury favor)"
                  className="font-sans text-xs text-emerald-700 border border-emerald-700/30 px-2.5 py-0.5 rounded-md hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {coCounselLoading ? 'Consulting…' : '⚑ Co-Counsel −5'}
                </button>
              </div>
              <span
                className={`font-sans text-xs transition-colors ${
                  wordCount === 0
                    ? 'text-ink/25'
                    : wordCount < WORD_COUNT.BRIEF
                    ? 'text-crimson/60'
                    : wordCount > WORD_COUNT.THOROUGH
                    ? 'text-green-600/70'
                    : 'text-gold/70'
                }`}
              >
                {wordCount} word{wordCount !== 1 ? 's' : ''}
                {wordCount > 0 && wordCount < WORD_COUNT.BRIEF && ' — too brief'}
                {wordCount > WORD_COUNT.THOROUGH && ' — thorough'}
              </span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="State your response to the court… (Shift+Enter for new line)"
              rows={3}
              disabled={loading}
              className="w-full border border-ink/20 bg-white/60 rounded-lg px-3.5 py-2.5 font-serif text-ink text-[15px] placeholder:text-ink/25 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 resize-none transition disabled:opacity-60"
            />
          </div>
          <button
            onClick={onSubmit}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-navy text-gold font-sans text-xs tracking-widest uppercase rounded-lg border border-gold/30 hover:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all self-end shadow"
          >
            Submit
          </button>
        </div>
      </div>
    </>
  );
}
