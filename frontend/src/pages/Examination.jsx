import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useSessionStore from '../store/sessionStore.js';
import { EXCHANGES_PER_SUBTOPIC, VERDICT_THRESHOLDS } from '../lib/constants.js';
import LoadingDots from '../components/ui/LoadingDots.jsx';
import MessageBubble from '../components/examination/MessageBubble.jsx';
import SubtopicProgress from '../components/examination/SubtopicProgress.jsx';
import Sidebar from '../components/examination/Sidebar.jsx';
import TestimonyInput from '../components/examination/TestimonyInput.jsx';
import CaseFileView from '../components/examination/CaseFileView.jsx';

export default function Examination() {
  const navigate = useNavigate();
  const store = useSessionStore();
  const { sessionId, subject, topic, intensity, subtopics, currentSubtopicIndex, juryFavor, subtopicScores, messages, view, caseFile, evaluationFeedback } = store;

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [coCounselLoading, setCoCounselLoading] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [subtopicsLoaded, setSubtopicsLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !subject || !topic) {
      navigate('/');
    }
  }, [sessionId, subject, topic, navigate]);

  // Helper: load transcript from session, or show default opening
  const loadTranscript = useCallback(async () => {
    try {
      const r = await fetch(`/api/sessions/${sessionId}`);
      const session = await r.json();
      if (session.transcript && session.transcript.length > 0) {
        const speakerMap = { counsel: 'counsel', judge: 'judge', co_counsel: 'cocounsel', defense: null };
        session.transcript.forEach((msg) => {
          if (msg.speaker === 'defense') {
            store.addMessage({ role: 'user', content: msg.content });
          } else {
            store.addMessage({
              role: 'ai',
              content: msg.content,
              speakerRole: speakerMap[msg.speaker] || 'counsel',
            });
          }
        });
        return;
      }
    } catch (err) {
      console.warn('Failed to load opening transcript:', err);
    }
    // Build opening with current matter context if available
    const cf = useSessionStore.getState().caseFile;
    const firstMatter = cf?.matters?.[0];
    const opening = firstMatter
      ? `Court is now in session. We will begin with: **${firstMatter.label}**. Counsel, please present your understanding.`
      : 'Court is now in session. Counsel, please state your understanding of the subject matter at hand.';
    store.addMessage({
      role: 'ai',
      content: opening,
      speakerRole: 'judge',
    });
  }, [sessionId]);

  // Initialize session: try lesson plan first (creates subtopics from
  // matters), fall back to subtopics endpoint, then load transcript.
  useEffect(() => {
    if (initRef.current || !sessionId || !subject || !topic) return;
    initRef.current = true;

    if (subtopics.length > 0) {
      setSubtopicsLoaded(true);
      return;
    }

    setLoading(true);

    (async () => {
      let gotSubtopics = false;

      // 1. Try lesson plan — this creates subtopics from matters
      try {
        const planRes = await fetch(`/api/sessions/${sessionId}/lesson-plan`, { method: 'POST' });
        if (planRes.ok) {
          const plan = await planRes.json();
          store.setCaseFile(plan);
          store.setView('casefile'); // Auto-show case file sidebar
          const matterNames = plan.matters.map((m) => m.label);
          store.initSubtopics(matterNames);
          gotSubtopics = true;
        }
      } catch (err) {
        console.warn('Lesson plan generation failed, falling back to subtopics:', err);
      }

      // 2. Fall back to subtopics endpoint if lesson plan unavailable
      if (!gotSubtopics) {
        try {
          const subRes = await fetch(`/api/sessions/${sessionId}/subtopics`, { method: 'POST' });
          if (!subRes.ok) throw new Error(`HTTP ${subRes.status}`);
          const data = await subRes.json();
          store.initSubtopics(data.subtopics);
          gotSubtopics = true;
          // Also try to fetch case file in case it exists
          try {
            const cfRes = await fetch(`/api/sessions/${sessionId}/lesson-plan`);
            if (cfRes.ok) {
              const plan = await cfRes.json();
              store.setCaseFile(plan);
            }
          } catch (_) {}
        } catch (err) {
          console.error('Failed to load subtopics:', err);
          store.initSubtopics([
            'Core Definitions & Concepts',
            'Fundamental Principles',
            'Real-World Applications',
            'Advanced Edge Cases',
          ]);
        }
      }

      setSubtopicsLoaded(true);

      // 3. Load transcript / opening turn
      await loadTranscript();

      setLoading(false);
    })();
  }, [sessionId, subject, topic]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading || !sessionId) return;

    const userMsg = input.trim();
    setInput('');
    store.addMessage({ role: 'user', content: userMsg });
    setLoading(true);

    const newExchangeCount = exchangeCount + 1;
    setExchangeCount(newExchangeCount);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      store.addMessage({
        role: 'ai',
        content: data.counsel_message.content,
        speakerRole: 'counsel',
      });
      store.applyScoring(data.quality_delta, data.jury_delta);

      // Apply case file section updates + evaluation feedback
      if (data.section_updates && data.section_updates.length > 0) {
        store.applySectionUpdates(data.section_updates);
      }
      if (data.evaluation_feedback) {
        store.setEvaluationFeedback(data.evaluation_feedback);
      }

      // Show judge transition if present (subtopic advance OR session complete verdict)
      if (data.judge_transition) {
        store.addMessage({
          role: 'ai',
          content: data.judge_transition.content,
          speakerRole: 'judge',
        });
        if (data.advanced_subtopic) {
          store.nextSubtopic();
          // Announce the next matter to give student context
          const state = useSessionStore.getState();
          const nextMatter = state.caseFile?.matters?.[state.currentSubtopicIndex];
          if (nextMatter) {
            store.addMessage({
              role: 'ai',
              content: `We now turn to: **${nextMatter.label}**. Counsel, please proceed.`,
              speakerRole: 'judge',
            });
          }
        }
      }

      // If session is complete, navigate to verdict
      if (data.session_complete) {
        const finalJuryFavor = useSessionStore.getState().juryFavor;
        const verdict =
          finalJuryFavor >= VERDICT_THRESHOLDS.ACQUITTED
            ? 'Acquitted'
            : finalJuryFavor >= VERDICT_THRESHOLDS.HUNG_JURY
            ? 'Hung Jury'
            : 'Guilty';
        store.setVerdict(verdict);
        navigate('/verdict');
      }
    } catch (err) {
      console.error(err);
      store.addMessage({
        role: 'ai',
        content: 'The court reporter encountered a technical error. Please restate your testimony.',
        speakerRole: 'counsel',
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId, exchangeCount]);

  const handleCoCounsel = useCallback(async () => {
    if (loading || coCounselLoading || !sessionId) return;
    setCoCounselLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/co-counsel`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      store.applyScoring(0, data.jury_delta);
      store.addMessage({ role: 'ai', content: data.hint.content, speakerRole: 'cocounsel' });
    } catch (err) {
      // No local penalty on error — backend never processed the request,
      // so the user shouldn't pay for a hint they never received.
      store.addMessage({
        role: 'ai',
        content: 'Co-Counsel is unavailable at this time. Please try again.',
        speakerRole: 'cocounsel',
      });
    } finally {
      setCoCounselLoading(false);
    }
  }, [loading, coCounselLoading, sessionId]);

  const currentSubtopic = subtopics[currentSubtopicIndex] || topic;
  const progressFraction =
    EXCHANGES_PER_SUBTOPIC > 0
      ? (exchangeCount % EXCHANGES_PER_SUBTOPIC) / EXCHANGES_PER_SUBTOPIC
      : 0;

  return (
    <div className="h-screen flex flex-col bg-parchment overflow-hidden">
      {/* Header */}
      <header className="bg-navy px-6 py-3 flex items-center justify-between shrink-0 shadow">
        <div className="flex items-center gap-4">
          <h1 className="text-gold font-serif text-lg tracking-widest">THE WITNESS STAND</h1>
          <span className="text-parchment/25">|</span>
          <span className="font-sans text-xs text-parchment/45 uppercase tracking-widest">
            {intensity} Examination
          </span>
          <span className="text-parchment/25">|</span>
          <span className="font-sans text-xs text-parchment/45 italic">
            {subject}: {topic}
          </span>
        </div>

        <button
          onClick={() => store.setView(view === 'casefile' ? 'examination' : 'casefile')}
          className={`px-4 py-1.5 font-sans text-xs tracking-wide border rounded-lg transition-colors ${
            view === 'casefile'
              ? 'bg-gold text-navy font-semibold border-gold'
              : 'text-parchment/50 hover:text-parchment/80 border-gold/25'
          }`}
        >
          {view === 'casefile' ? 'Hide Case File' : 'Show Case File'}
        </button>
      </header>

      <SubtopicProgress
        subtopics={subtopics}
        currentIndex={currentSubtopicIndex}
        progressFraction={progressFraction}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          juryFavor={juryFavor}
          subtopicScores={subtopicScores}
          currentSubtopicIndex={currentSubtopicIndex}
        />

        {/* Main chat area */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-8 py-5 space-y-5">
            {messages.length === 0 && !loading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-4xl mb-3">⚖️</div>
                  <p className="font-serif text-ink/40 italic">Summoning the examiner…</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-ink/5 border border-ink/10 rounded-xl px-4 py-3">
                  <LoadingDots />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <TestimonyInput
            input={input}
            setInput={setInput}
            loading={loading}
            coCounselLoading={coCounselLoading}
            exchangeCount={exchangeCount}
            currentSubtopic={currentSubtopic}
            caseFile={caseFile}
            currentSubtopicIndex={currentSubtopicIndex}
            onSubmit={handleSubmit}
            onCoCounsel={handleCoCounsel}
          />
        </main>

        {/* Case File sidebar — always visible when toggled */}
        {view === 'casefile' && (
          <aside className="w-80 shrink-0 border-l border-ink/10 bg-white/20 overflow-hidden">
            <CaseFileView
              caseFile={caseFile}
              evaluationFeedback={evaluationFeedback}
              currentSubtopicIndex={currentSubtopicIndex}
              compact
            />
          </aside>
        )}
      </div>
    </div>
  );
}
