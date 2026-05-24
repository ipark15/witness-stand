import { useCallback } from 'react';
import { WORD_COUNT, EXCHANGES_PER_SUBTOPIC } from '../../lib/constants.js';
import useSpeechRecognition from '../../hooks/useSpeechRecognition.js';

function CurrentMatterHints({ caseFile, currentSubtopicIndex }) {
  if (!caseFile) return null;
  const matter = caseFile.matters[currentSubtopicIndex];
  if (!matter) return null;
  const remaining = matter.children.filter((n) => n.status !== 'covered' && n.status !== 'skipped');
  if (remaining.length === 0) return null;

  return (
    <div className="px-8 py-2 border-t border-ink/5 bg-navy/[0.02]">
      <p className="font-sans text-[10px] text-ink/35 uppercase tracking-wider mb-1.5">What to address:</p>
      <div className="flex flex-wrap gap-1.5">
        {remaining.map((node) => (
          <span
            key={node.id}
            className={`inline-block font-sans text-[11px] px-2 py-0.5 rounded border ${
              node.status === 'partial'
                ? 'border-gold/40 bg-gold/5 text-gold'
                : 'border-ink/10 bg-white/40 text-ink/50'
            }`}
            title={node.prompt_hint}
          >
            {node.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TestimonyInput({
  input,
  setInput,
  loading,
  coCounselLoading,
  exchangeCount,
  currentSubtopic,
  caseFile,
  currentSubtopicIndex,
  onSubmit,
  onCoCounsel,
}) {
  const wordCount = input.trim() ? input.trim().split(/\s+/).filter(Boolean).length : 0;

  const onTranscript = useCallback(
    (text) => {
      setInput((prev) => {
        const needsSpace = prev.length > 0 && !prev.endsWith(' ');
        return prev + (needsSpace ? ' ' : '') + text.trim();
      });
    },
    [setInput],
  );

  const { listening, supported, error: speechError, toggle } = useSpeechRecognition({ onTranscript });

  return (
    <>
      {/* Current matter + inline hints */}
      <div className="px-8 py-1.5 border-t border-ink/8 bg-white/20 shrink-0">
        <p className="font-sans text-xs text-ink/40">
          Current matter:{' '}
          <span className="text-navy font-semibold">{currentSubtopic}</span>
        </p>
      </div>

      <CurrentMatterHints caseFile={caseFile} currentSubtopicIndex={currentSubtopicIndex} />

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
                  title={
                    wordCount > 0
                      ? 'Show your draft to co-counsel for feedback before delivering'
                      : 'Consult co-counsel for a private nudge'
                  }
                  className="font-sans text-xs text-emerald-700 border border-emerald-700/30 px-2.5 py-0.5 rounded-md hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {coCounselLoading
                    ? 'Consulting…'
                    : wordCount > 0
                    ? '⚑ Check Draft'
                    : '⚑ Co-Counsel'}
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
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder={listening ? 'Listening — speak your testimony…' : 'State your response to the court… (Shift+Enter for new line)'}
                rows={3}
                disabled={loading}
                className={`w-full border bg-white/60 rounded-lg px-3.5 py-2.5 pr-12 font-serif text-ink text-[15px] placeholder:text-ink/25 focus:outline-none focus:ring-1 resize-none transition disabled:opacity-60 ${
                  listening
                    ? 'border-crimson/50 focus:border-crimson focus:ring-crimson/30'
                    : 'border-ink/20 focus:border-gold focus:ring-gold/30'
                }`}
              />
              {supported && (
                <button
                  onClick={toggle}
                  title={speechError || (listening ? 'Stop dictation' : 'Start dictation')}
                  disabled={loading}
                  type="button"
                  className={`absolute right-2 bottom-2 p-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    listening
                      ? 'bg-crimson/10 text-crimson hover:bg-crimson/20 animate-pulse'
                      : 'text-ink/30 hover:text-ink/60 hover:bg-ink/5'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    {listening ? (
                      /* Stop icon (filled square) */
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    ) : (
                      /* Microphone icon */
                      <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Zm7 10a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 11Z" />
                    )}
                  </svg>
                </button>
              )}
            </div>
            {speechError && (
              <p className="mt-1 font-sans text-[11px] text-crimson/80 leading-snug">
                {speechError}
              </p>
            )}
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
