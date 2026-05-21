import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useSessionStore from '../store/sessionStore.js';

const EXCHANGES_PER_SUBTOPIC = 5;

function LoadingDots() {
  return (
    <div className="flex gap-1 py-1">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="w-1.5 h-1.5 bg-ink/30 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 mb-1.5 justify-end">
            <span className="font-sans text-xs text-ink/40">Defense Counsel</span>
            <div className="w-6 h-6 rounded-full bg-gold flex items-center justify-center text-navy text-xs font-bold">
              D
            </div>
          </div>
          <div className="rounded-xl rounded-tr-sm px-4 py-3 bg-white/70 border border-gold/30 shadow-sm">
            <p className="font-serif text-ink text-[15px] leading-relaxed">{msg.content}</p>
          </div>
        </div>
      </div>
    );
  }

  if (msg.speakerRole === 'cocounsel') {
    return (
      <div className="flex justify-center">
        <div className="max-w-lg w-full">
          <div className="flex items-center gap-2 mb-1.5 justify-center">
            <div className="w-5 h-5 rounded-full bg-emerald-700 flex items-center justify-center text-white text-xs font-bold">
              CC
            </div>
            <span className="font-sans text-xs text-emerald-700/70 italic">Co-Counsel — Private</span>
            <span className="font-sans text-xs text-ink/30">(-5 jury favor)</span>
          </div>
          <div className="rounded-xl px-4 py-3 border border-emerald-700/25 bg-emerald-50/60 shadow-sm">
            <p className="font-serif text-ink/80 text-[14px] leading-relaxed italic">{msg.content}</p>
          </div>
        </div>
      </div>
    );
  }

  const isJudge = msg.speakerRole === 'judge';
  return (
    <div className="flex justify-start">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isJudge ? 'bg-navy text-gold' : 'bg-crimson text-white'
            }`}
          >
            {isJudge ? 'J' : 'C'}
          </div>
          <span className="font-sans text-xs text-ink/40">
            {isJudge ? 'The Honorable Court' : 'Opposing Counsel'}
          </span>
        </div>
        <div
          className={`rounded-xl rounded-tl-sm px-4 py-3 border shadow-sm ${
            isJudge
              ? 'bg-navy/6 border-navy/20'
              : 'bg-crimson/5 border-crimson/20'
          }`}
        >
          <p className="font-serif text-ink text-[15px] leading-relaxed">{msg.content}</p>
        </div>
      </div>
    </div>
  );
}

export default function Examination() {
  const navigate = useNavigate();
  const store = useSessionStore();
  const { subject, topic, intensity, subtopics, currentSubtopicIndex, juryFavor, subtopicScores, messages, view } = store;

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [coCounselLoading, setCoCounselLoading] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [subtopicsLoaded, setSubtopicsLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!subject || !topic) {
      navigate('/');
    }
  }, [subject, topic, navigate]);

  // Load subtopics on mount
  useEffect(() => {
    if (initRef.current || !subject || !topic) return;
    initRef.current = true;

    if (subtopics.length > 0) {
      setSubtopicsLoaded(true);
      return;
    }

    fetch('/api/subtopics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, topic }),
    })
      .then((r) => r.json())
      .then((data) => {
        store.initSubtopics(data.subtopics);
        setSubtopicsLoaded(true);
      })
      .catch(() => {
        store.initSubtopics([
          'Core Definitions & Concepts',
          'Fundamental Principles',
          'Real-World Applications',
          'Advanced Edge Cases',
        ]);
        setSubtopicsLoaded(true);
      });
  }, [subject, topic]);

  // Send opening question once subtopics are loaded and no messages yet
  const openingFired = useRef(false);
  useEffect(() => {
    if (!subtopicsLoaded || subtopics.length === 0 || messages.length > 0 || openingFired.current) return;
    openingFired.current = true;

    setLoading(true);
    fetch('/api/examine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        topic,
        intensity,
        messageHistory: [],
        currentSubtopic: subtopics[0],
        juryFavor: 50,
        userMessage: 'The defense is ready. Please begin the examination.',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        store.addMessage({ role: 'ai', content: data.message, speakerRole: data.role });
      })
      .catch(() => {
        store.addMessage({
          role: 'ai',
          content:
            'Court is now in session. Counsel, please state your understanding of the subject matter at hand.',
          speakerRole: 'judge',
        });
      })
      .finally(() => setLoading(false));
  }, [subtopicsLoaded, subtopics]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    store.addMessage({ role: 'user', content: userMsg });
    setLoading(true);

    const newExchangeCount = exchangeCount + 1;
    setExchangeCount(newExchangeCount);

    try {
      const res = await fetch('/api/examine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          topic,
          intensity,
          messageHistory: store.messages,
          currentSubtopic: subtopics[currentSubtopicIndex] || topic,
          juryFavor,
          userMessage: userMsg,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      store.addMessage({ role: 'ai', content: data.message, speakerRole: data.role });
      store.applyScoring(data.qualityDelta, data.juryDelta);

      // Advance subtopic if AI signals mastery OR exchange limit reached
      const shouldAdvance = data.advanceSubtopic || newExchangeCount % EXCHANGES_PER_SUBTOPIC === 0;
      if (shouldAdvance) {
        const nextIdx = currentSubtopicIndex + 1;
        if (nextIdx >= subtopics.length) {
          const finalJuryFavor = useSessionStore.getState().juryFavor;
          const verdict =
            finalJuryFavor >= 70 ? 'Acquitted' : finalJuryFavor >= 40 ? 'Hung Jury' : 'Guilty';
          store.setVerdict(verdict);
          navigate('/verdict');
        } else {
          store.nextSubtopic();
        }
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
  }, [input, loading, exchangeCount, subject, topic, intensity, subtopics, currentSubtopicIndex, juryFavor]);

  const handleCoCounsel = useCallback(async () => {
    if (loading || coCounselLoading) return;
    setCoCounselLoading(true);
    store.applyScoring(0, -5);
    try {
      const res = await fetch('/api/co-counsel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          topic,
          currentSubtopic: subtopics[currentSubtopicIndex] || topic,
          messageHistory: store.messages,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      store.addMessage({ role: 'ai', content: data.hint, speakerRole: 'cocounsel' });
    } catch (err) {
      store.addMessage({
        role: 'ai',
        content: 'Co-Counsel leans in: Your argument needs more specificity. Focus on the core definition and a concrete example.',
        speakerRole: 'cocounsel',
      });
    } finally {
      setCoCounselLoading(false);
    }
  }, [loading, coCounselLoading, subject, topic, subtopics, currentSubtopicIndex]);

  const currentSubtopic = subtopics[currentSubtopicIndex] || topic;
  const wordCount = input.trim() ? input.trim().split(/\s+/).filter(Boolean).length : 0;
  const progressFraction =
    EXCHANGES_PER_SUBTOPIC > 0
      ? (exchangeCount % EXCHANGES_PER_SUBTOPIC) / EXCHANGES_PER_SUBTOPIC
      : 0;

  return (
    <div className="h-screen flex flex-col bg-parchment overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
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

      {/* ── Subtopic Progress ───────────────────────────────────────── */}
      <div className="bg-white/30 border-b border-ink/10 px-6 py-2.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {subtopics.map((st, i) => {
            const isDone = i < currentSubtopicIndex;
            const isCurrent = i === currentSubtopicIndex;
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

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="w-52 shrink-0 border-r border-ink/10 bg-white/20 flex flex-col">
          {/* Court Roster */}
          <div className="p-4 border-b border-ink/10">
            <h3 className="font-sans text-xs text-ink/45 uppercase tracking-widest mb-3">
              Court Roster
            </h3>
            {[
              { initial: 'J', bg: 'bg-navy', text: 'text-gold', name: 'The Honorable AI', role: 'Presiding Judge' },
              { initial: 'C', bg: 'bg-crimson', text: 'text-white', name: 'AI Examiner', role: 'Opposing Counsel' },
              { initial: 'D', bg: 'bg-gold', text: 'text-navy', name: 'You', role: 'Defense Counsel' },
            ].map((p) => (
              <div key={p.role} className="flex items-center gap-2.5 mb-3">
                <div
                  className={`w-7 h-7 rounded-full ${p.bg} ${p.text} flex items-center justify-center text-xs font-bold shrink-0`}
                >
                  {p.initial}
                </div>
                <div>
                  <p className="font-sans text-xs text-ink leading-tight">{p.name}</p>
                  <p className="font-sans text-xs text-ink/40">{p.role}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Jury Favor */}
          <div className="p-4 border-b border-ink/10">
            <div className="flex justify-between items-center mb-1.5">
              <h3 className="font-sans text-xs text-ink/45 uppercase tracking-widest">
                Jury Favor
              </h3>
              <span className="font-sans text-sm text-ink font-semibold">{juryFavor}</span>
            </div>
            <div className="h-2 bg-ink/10 rounded-full overflow-hidden mb-1">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  juryFavor >= 70 ? 'bg-green-500' : juryFavor >= 40 ? 'bg-gold' : 'bg-crimson'
                }`}
                style={{ width: `${juryFavor}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-xs text-crimson">Hostile</span>
              <span
                className={`font-sans text-xs font-semibold ${
                  juryFavor >= 70 ? 'text-green-600' : juryFavor >= 40 ? 'text-gold' : 'text-crimson'
                }`}
              >
                {juryFavor >= 70 ? 'Favorable' : juryFavor >= 40 ? 'Neutral' : 'Hostile'}
              </span>
              <span className="font-sans text-xs text-green-600">Favorable</span>
            </div>
          </div>

          {/* Evidence Quality */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="font-sans text-xs text-ink/45 uppercase tracking-widest mb-3">
              Evidence Quality
            </h3>
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
                  <div className="h-1 bg-ink/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        s.quality >= 70
                          ? 'bg-green-500'
                          : s.quality >= 40
                          ? 'bg-gold'
                          : 'bg-crimson'
                      }`}
                      style={{ width: `${s.quality}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main Panel ──────────────────────────────────────────── */}
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
                          onClick={handleCoCounsel}
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
                            : wordCount < 20
                            ? 'text-crimson/60'
                            : wordCount > 80
                            ? 'text-green-600/70'
                            : 'text-gold/70'
                        }`}
                      >
                        {wordCount} word{wordCount !== 1 ? 's' : ''}
                        {wordCount > 0 && wordCount < 20 && ' — too brief'}
                        {wordCount > 80 && ' — thorough'}
                      </span>
                    </div>
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="State your response to the court… (Shift+Enter for new line)"
                      rows={3}
                      disabled={loading}
                      className="w-full border border-ink/20 bg-white/60 rounded-lg px-3.5 py-2.5 font-serif text-ink text-[15px] placeholder:text-ink/25 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 resize-none transition disabled:opacity-60"
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !input.trim()}
                    className="px-6 py-3 bg-navy text-gold font-sans text-xs tracking-widest uppercase rounded-lg border border-gold/30 hover:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all self-end shadow"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── Study Guide ──────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-8">
              <h2 className="font-serif text-2xl text-ink mb-1">{topic}</h2>
              <p className="font-sans text-xs text-ink/40 mb-6 uppercase tracking-widest">
                Study Guide — Performance Analysis
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subtopicScores.map((s, i) => {
                  const strength =
                    s.quality >= 70 ? 'Strong' : s.quality >= 40 ? 'Developing' : 'Weak';
                  const strengthColor =
                    s.quality >= 70
                      ? 'bg-green-100 text-green-700 border-green-200'
                      : s.quality >= 40
                      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                      : 'bg-red-100 text-red-700 border-red-200';
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
                        <span
                          className={`font-sans text-xs px-2 py-0.5 rounded border ml-2 shrink-0 ${strengthColor}`}
                        >
                          {strength}
                        </span>
                      </div>
                      <div className="h-1.5 bg-ink/10 rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.quality >= 70
                              ? 'bg-green-500'
                              : s.quality >= 40
                              ? 'bg-gold'
                              : 'bg-crimson'
                          }`}
                          style={{ width: `${s.quality}%` }}
                        />
                      </div>
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
          )}
        </main>
      </div>
    </div>
  );
}
