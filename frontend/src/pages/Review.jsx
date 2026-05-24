import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader.jsx';
import MessageBubble from '../components/examination/MessageBubble.jsx';
import CaseFileView from '../components/examination/CaseFileView.jsx';
import LoadingDots from '../components/ui/LoadingDots.jsx';
import useSpeechRecognition from '../hooks/useSpeechRecognition.js';

// Maps a persisted TranscriptMessage.speaker to the shape MessageBubble expects.
// Defense → user-side bubble. Everyone else is AI-side with a speakerRole tag.
const SPEAKER_TO_AI_KIND = {
  counsel: 'counsel',
  judge: 'judge',
  co_counsel: 'cocounsel',
};

function transcriptToBubble(msg) {
  if (msg.speaker === 'defense') {
    return { id: msg.id, role: 'user', content: msg.content };
  }
  return {
    id: msg.id,
    role: 'ai',
    content: msg.content,
    speakerRole: SPEAKER_TO_AI_KIND[msg.speaker] || 'counsel',
  };
}

const VERDICT_STYLES = {
  Acquitted: 'bg-green-100 text-green-700 border-green-200',
  'Hung Jury': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Guilty: 'bg-red-100 text-red-700 border-red-200',
};

function VerdictBadge({ verdict, complete }) {
  if (!complete) {
    return (
      <span className="font-sans text-xs px-2.5 py-1 rounded border bg-ink/5 text-ink/55 border-ink/15">
        In Progress
      </span>
    );
  }
  const cls = VERDICT_STYLES[verdict] || 'bg-ink/5 text-ink/55 border-ink/15';
  return (
    <span className={`font-sans text-xs px-2.5 py-1 rounded border ${cls}`}>
      {verdict || 'Unknown'}
    </span>
  );
}

export default function Review() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [caseFile, setCaseFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coCounselLoading, setCoCounselLoading] = useState(false);
  const [coCounselError, setCoCounselError] = useState(null);
  const [question, setQuestion] = useState('');
  const messagesEndRef = useRef(null);

  // Load session + case file in parallel. Case file is optional — older
  // sessions may not have one (we treat 404 as "no plan generated").
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [sRes, planRes] = await Promise.all([
          fetch(`/api/sessions/${sessionId}`),
          fetch(`/api/sessions/${sessionId}/lesson-plan`).catch(() => null),
        ]);
        if (!sRes.ok) {
          throw new Error(`Session not found (${sRes.status})`);
        }
        const sData = await sRes.json();
        if (cancelled) return;
        setSession(sData);
        setMessages((sData.transcript || []).map(transcriptToBubble));
        if (planRes && planRes.ok) {
          const planData = await planRes.json();
          if (!cancelled) setCaseFile(planData);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Failed to load session');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Auto-scroll to bottom of transcript whenever messages grow (e.g. after
  // a co-counsel reply during review).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Dictation: append final transcript chunks to the question textarea,
  // preserving anything the user already typed.
  const onTranscript = useCallback((text) => {
    setQuestion((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(' ');
      return prev + (needsSpace ? ' ' : '') + text.trim();
    });
  }, []);

  const {
    listening,
    supported: speechSupported,
    error: speechError,
    toggle: toggleDictation,
  } = useSpeechRecognition({ onTranscript });

  const handleAsk = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || coCounselLoading || !sessionId) return;
    setCoCounselLoading(true);
    setCoCounselError(null);
    // Optimistically append the user's question so the UI feels responsive
    // while we wait for the LLM. We tag it with a tentative id which the
    // backend's persisted TranscriptMessage will replace once the answer
    // arrives.
    const optimisticQuestionId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticQuestionId, role: 'user', content: trimmed },
    ]);
    setQuestion('');
    try {
      const res = await fetch(`/api/sessions/${sessionId}/post-trial-confer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Replace the optimistic question with the persisted one and append
      // the answer. Two messages, same shape the transcript uses elsewhere.
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticQuestionId),
        transcriptToBubble(data.question),
        transcriptToBubble(data.answer),
      ]);
    } catch (err) {
      console.error('Post-trial co-counsel failed:', err);
      setCoCounselError(err.message || 'Co-counsel unavailable');
      // Drop the optimistic bubble on failure so the user can retry.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticQuestionId));
      // Restore the question so the user doesn't lose what they typed.
      setQuestion(trimmed);
    } finally {
      setCoCounselLoading(false);
    }
  }, [question, coCounselLoading, sessionId]);

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment font-serif flex flex-col">
        <AppHeader subtitle="Case Review">
          <button
            onClick={() => navigate('/')}
            className="font-sans text-xs text-parchment/70 hover:text-gold border border-gold/30 px-3.5 py-1.5 rounded transition-colors"
          >
            ← Back to Chambers
          </button>
        </AppHeader>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">📁</div>
            <p className="font-serif text-ink/45 italic">Retrieving case file…</p>
            <LoadingDots />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-parchment font-serif flex flex-col">
        <AppHeader subtitle="Case Review">
          <button
            onClick={() => navigate('/')}
            className="font-sans text-xs text-parchment/70 hover:text-gold border border-gold/30 px-3.5 py-1.5 rounded transition-colors"
          >
            ← Back to Chambers
          </button>
        </AppHeader>
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md text-center px-6">
            <div className="text-4xl mb-3">⚠</div>
            <p className="font-serif text-ink/55">{loadError}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-5 font-sans text-xs tracking-widest uppercase bg-navy text-gold border border-gold/30 px-5 py-2.5 rounded-lg hover:bg-navy/90 transition-colors"
            >
              Return to Chambers
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-parchment font-serif flex flex-col">
      <AppHeader subtitle="Case Review">
        <button
          onClick={() => navigate('/')}
          className="font-sans text-xs text-parchment/70 hover:text-gold border border-gold/30 px-3.5 py-1.5 rounded transition-colors"
        >
          ← Back to Chambers
        </button>
      </AppHeader>

      {/* Case meta strip */}
      <div className="bg-navy/95 border-b border-gold/25 px-8 py-3 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <p className="font-sans text-[10px] text-parchment/40 uppercase tracking-widest mb-0.5">
            In the Matter of
          </p>
          <p className="font-serif text-gold text-base truncate">
            {session?.topic}{' '}
            <span className="font-sans text-xs text-parchment/45">· {session?.subject}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-sans text-xs text-parchment/45">
            Jury Favor:{' '}
            <span className="text-gold font-semibold">{session?.jury_favor ?? 0}/100</span>
          </span>
          <VerdictBadge verdict={session?.verdict} complete={session?.complete} />
        </div>
      </div>

      {/* Read-only notice */}
      <div className="bg-gold/8 border-b border-gold/20 px-8 py-1.5 shrink-0">
        <p className="font-sans text-[11px] text-ink/55 italic text-center">
          Reviewing closed proceedings — examination is read-only. Co-counsel remains available for
          private conferral.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main: transcript */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto px-8 py-5 space-y-5">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-4xl mb-3">📜</div>
                  <p className="font-serif text-ink/40 italic">
                    No transcript was recorded for this case.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
            )}

            {coCounselLoading && (
              <div className="flex justify-center">
                <div className="border border-emerald-700/25 bg-emerald-50/60 rounded-xl px-4 py-3">
                  <span className="font-sans text-xs text-emerald-700/70 italic mr-2">
                    Co-Counsel conferring…
                  </span>
                  <LoadingDots />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer: post-trial chat with co-counsel. No examiner input —
              the trial is over, this is a private debrief Q&A. */}
          <div className="border-t border-ink/10 bg-white/30 px-8 py-3 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-sans text-xs text-ink/40">
                Post-trial conference with co-counsel
              </span>
              {coCounselError && (
                <span className="font-sans text-[11px] text-crimson/80">{coCounselError}</span>
              )}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  rows={2}
                  disabled={coCounselLoading}
                  placeholder={
                    listening
                      ? 'Listening — speak your question…'
                      : 'Ask co-counsel about this case… (Shift+Enter for new line)'
                  }
                  className={`w-full border bg-white/60 rounded-lg px-3 py-2 pr-11 font-serif text-ink text-[14px] placeholder:text-ink/25 focus:outline-none focus:ring-1 resize-none transition disabled:opacity-60 ${
                    listening
                      ? 'border-crimson/50 focus:border-crimson focus:ring-crimson/30'
                      : 'border-ink/20 focus:border-emerald-700/40 focus:ring-emerald-700/20'
                  }`}
                />
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleDictation}
                    disabled={coCounselLoading}
                    title={speechError || (listening ? 'Stop dictation' : 'Start dictation')}
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
              <button
                onClick={handleAsk}
                disabled={!question.trim() || coCounselLoading}
                className="font-sans text-xs text-parchment bg-emerald-700 border border-emerald-700 px-4 py-2 rounded-md hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
              >
                {coCounselLoading ? 'Asking…' : 'Ask'}
              </button>
            </div>
            {speechError && (
              <p className="mt-1 font-sans text-[11px] text-crimson/80 leading-snug">
                {speechError}
              </p>
            )}
          </div>
        </main>

        {/* Right: case file (always visible in review) */}
        <aside className="w-80 shrink-0 border-l border-ink/10 bg-white/20 overflow-hidden flex flex-col">
          <CaseFileView
            caseFile={caseFile}
            evaluationFeedback={null}
            currentSubtopicIndex={-1}
            compact
            readOnly
          />
        </aside>
      </div>
    </div>
  );
}
