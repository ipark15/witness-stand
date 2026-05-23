import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useSessionStore from '../store/sessionStore.js';
import { EXCHANGES_PER_SUBTOPIC, VERDICT_THRESHOLDS } from '../lib/constants.js';
import LoadingDots from '../components/ui/LoadingDots.jsx';
import MessageBubble from '../components/examination/MessageBubble.jsx';
import SubtopicProgress from '../components/examination/SubtopicProgress.jsx';
import Sidebar from '../components/examination/Sidebar.jsx';
import TestimonyInput from '../components/examination/TestimonyInput.jsx';
import StudyGuideView from '../components/examination/StudyGuideView.jsx';

export default function Examination() {
  const navigate = useNavigate();
  const store = useSessionStore();
  const { sessionId, subject, topic, intensity, subtopics, currentSubtopicIndex, juryFavor, subtopicScores, messages, view } = store;

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

  // Load subtopics on mount — calls POST /api/sessions/{id}/subtopics
  // which also generates the opening examiner turn
  useEffect(() => {
    if (initRef.current || !sessionId || !subject || !topic) return;
    initRef.current = true;

    if (subtopics.length > 0) {
      setSubtopicsLoaded(true);
      return;
    }

    setLoading(true);
    fetch(`/api/sessions/${sessionId}/subtopics`, { method: 'POST' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        store.initSubtopics(data.subtopics);
        setSubtopicsLoaded(true);
        // Fetch the session transcript for the opening turn
        return fetch(`/api/sessions/${sessionId}`)
          .then((r) => r.json())
          .then((session) => {
            if (session.transcript && session.transcript.length > 0) {
              session.transcript.forEach((msg) => {
                const speakerMap = { counsel: 'counsel', judge: 'judge', co_counsel: 'cocounsel', defense: null };
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
            } else {
              store.addMessage({
                role: 'ai',
                content: 'Court is now in session. Counsel, please state your understanding of the subject matter at hand.',
                speakerRole: 'judge',
              });
            }
          })
          .catch((err) => {
            console.warn('Failed to load opening transcript:', err);
            store.addMessage({
              role: 'ai',
              content: 'Court is now in session. Counsel, please state your understanding of the subject matter at hand.',
              speakerRole: 'judge',
            });
          });
      })
      .catch((err) => {
        console.error('Failed to load subtopics:', err);
        store.initSubtopics([
          'Core Definitions & Concepts',
          'Fundamental Principles',
          'Real-World Applications',
          'Advanced Edge Cases',
        ]);
        setSubtopicsLoaded(true);
        store.addMessage({
          role: 'ai',
          content: 'Court is now in session. Counsel, please state your understanding of the subject matter at hand.',
          speakerRole: 'judge',
        });
      })
      .finally(() => setLoading(false));
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

      // Show judge transition if present (subtopic advance OR session complete verdict)
      if (data.judge_transition) {
        store.addMessage({
          role: 'ai',
          content: data.judge_transition.content,
          speakerRole: 'judge',
        });
        if (data.advanced_subtopic) {
          store.nextSubtopic();
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

        <div className="flex border border-gold/25 rounded-lg overflow-hidden">
          {['examination', 'studyguide'].map((v) => (
            <button
              key={v}
              onClick={() => store.setView(v)}
              className={`px-4 py-1.5 font-sans text-xs tracking-wide transition-colors ${
                view === v
                  ? 'bg-gold text-navy font-semibold'
                  : 'text-parchment/50 hover:text-parchment/80'
              }`}
            >
              {v === 'examination' ? 'Examination' : 'Study Guide'}
            </button>
          ))}
        </div>
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

        <main className="flex-1 flex flex-col overflow-hidden">
          {view === 'examination' ? (
            <>
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
                onSubmit={handleSubmit}
                onCoCounsel={handleCoCounsel}
              />
            </>
          ) : (
            <StudyGuideView
              topic={topic}
              subtopicScores={subtopicScores}
              currentSubtopicIndex={currentSubtopicIndex}
            />
          )}
        </main>
      </div>
    </div>
  );
}
