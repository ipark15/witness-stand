import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader.jsx';
import MessageBubble from '../components/examination/MessageBubble.jsx';
import CaseFileView from '../components/examination/CaseFileView.jsx';
import LoadingDots from '../components/ui/LoadingDots.jsx';

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

  const handleCoCounsel = useCallback(async () => {
    if (coCounselLoading || !sessionId) return;
    setCoCounselLoading(true);
    setCoCounselError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/co-counsel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: null }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // The backend returns the persisted TranscriptMessage; project it.
      setMessages((prev) => [...prev, transcriptToBubble(data.hint)]);
    } catch (err) {
      console.error('Co-counsel failed:', err);
      setCoCounselError(err.message || 'Co-counsel unavailable');
    } finally {
      setCoCounselLoading(false);
    }
  }, [coCounselLoading, sessionId]);

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

          {/* Footer: co-counsel only — no testimony input in review mode */}
          <div className="border-t border-ink/10 bg-white/30 px-8 py-3 shrink-0 flex items-center justify-between gap-4">
            <div className="font-sans text-[11px] text-ink/40 italic">
              The court has adjourned. You may still confer with co-counsel privately.
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {coCounselError && (
                <span className="font-sans text-[11px] text-crimson/80">{coCounselError}</span>
              )}
              <button
                onClick={handleCoCounsel}
                disabled={coCounselLoading}
                title="Ask co-counsel for a private nudge on this case"
                className="font-sans text-xs text-emerald-700 border border-emerald-700/30 px-3 py-1.5 rounded-md hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {coCounselLoading ? 'Consulting…' : '⚑ Confer with Co-Counsel'}
              </button>
            </div>
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
