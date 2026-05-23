import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSessionStore from '../store/sessionStore.js';

const VERDICT_CONFIG = {
  Acquitted: {
    icon: '⚖️',
    tagline: 'Defense counsel has demonstrated sufficient mastery of the subject matter.',
    barColor: 'bg-green-500',
    textColor: 'text-green-700',
    border: 'border-green-400',
    bg: 'bg-green-50',
    qualityLabel: (q) => (q >= 70 ? 'Compelling' : q >= 40 ? 'Adequate' : 'Marginal'),
  },
  'Hung Jury': {
    icon: '🔔',
    tagline:
      'The jury is divided. Counsel showed partial mastery but significant gaps remain.',
    barColor: 'bg-gold',
    textColor: 'text-gold',
    border: 'border-gold/60',
    bg: 'bg-gold/5',
    qualityLabel: (q) => (q >= 70 ? 'Compelling' : q >= 40 ? 'Adequate' : 'Insufficient'),
  },
  Guilty: {
    icon: '🔨',
    tagline: 'Defense counsel failed to demonstrate adequate command of the material.',
    barColor: 'bg-crimson',
    textColor: 'text-crimson',
    border: 'border-crimson/50',
    bg: 'bg-crimson/5',
    qualityLabel: (q) => (q >= 70 ? 'Adequate' : q >= 40 ? 'Marginal' : 'Insufficient'),
  },
};

export default function Verdict() {
  const navigate = useNavigate();
  const { subject, topic, intensity, juryFavor, subtopicScores, verdict } = useSessionStore();

  useEffect(() => {
    if (!verdict) navigate('/');
  }, [verdict, navigate]);

  if (!verdict) return null;

  const cfg = VERDICT_CONFIG[verdict];
  const overallScore = juryFavor;

  const criteria = [
    {
      label: 'Jury Favor',
      value: overallScore,
      desc:
        overallScore >= 70
          ? 'The jury found your arguments persuasive.'
          : overallScore >= 40
          ? 'The jury was partially convinced.'
          : 'The jury was not persuaded.',
    },
    ...subtopicScores.map((s) => ({
      label: s.name,
      value: s.quality,
      desc: cfg.qualityLabel(s.quality),
    })),
  ];

  return (
    <div className="min-h-screen bg-parchment font-serif">
      {/* Header */}
      <header className="bg-navy px-8 py-5 shadow-md">
        <h1 className="text-gold font-serif text-2xl tracking-widest uppercase">
          The Witness Stand
        </h1>
        <p className="text-parchment/45 font-sans text-xs tracking-widest uppercase mt-0.5">
          Final Verdict — {subject}: {topic}
        </p>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Verdict Banner */}
        <div
          className={`border-2 rounded-2xl p-10 text-center mb-8 shadow-sm ${cfg.border} ${cfg.bg}`}
        >
          <div className="text-5xl mb-4">{cfg.icon}</div>
          <p className="font-sans text-xs text-ink/40 uppercase tracking-widest mb-2">
            The Court Finds the Defense
          </p>
          <h2 className={`font-serif text-6xl font-bold mb-4 ${cfg.textColor}`}>{verdict}</h2>
          <p className="font-serif text-ink/60 text-lg italic max-w-md mx-auto leading-relaxed">
            {cfg.tagline}
          </p>
          <div className="mt-4 font-sans text-xs text-ink/35 uppercase tracking-widest">
            {intensity} Examination · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Final Score */}
        <div className="bg-white/50 border border-ink/10 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h3 className="font-sans text-xs text-ink/45 uppercase tracking-widest mb-1">
                Jury Favor Score
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-5xl text-ink">{overallScore}</span>
                <span className="font-serif text-2xl text-ink/35">/100</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-sans text-xs text-ink/40 mb-0.5">Threshold to Acquit</p>
              <p className="font-sans text-sm text-green-600 font-semibold">≥ 70</p>
            </div>
          </div>
          <div className="h-4 bg-ink/8 rounded-full overflow-hidden relative">
            {/* Threshold markers */}
            <div className="absolute top-0 bottom-0 left-[40%] w-px bg-gold/50" />
            <div className="absolute top-0 bottom-0 left-[70%] w-px bg-green-400/60" />
            <div
              className={`h-full rounded-full transition-all duration-700 ${cfg.barColor}`}
              style={{ width: `${overallScore}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 font-sans text-xs text-ink/35">
            <span>0 — Guilty</span>
            <span>40 — Hung</span>
            <span>70 — Acquitted</span>
            <span>100</span>
          </div>
        </div>

        {/* Criteria Breakdown */}
        <div className="bg-white/50 border border-ink/10 rounded-2xl p-6 mb-8 shadow-sm">
          <h3 className="font-sans text-xs text-ink/45 uppercase tracking-widest mb-5">
            Evidence Quality Breakdown
          </h3>
          <div className="space-y-4">
            {criteria.map((c, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="font-serif text-ink text-base">
                    {i === 0 ? '⚖ ' : ''}
                    {c.label}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-sans text-xs text-ink/40">{c.desc}</span>
                    <span
                      className={`font-sans text-sm font-semibold ${
                        c.value >= 70
                          ? 'text-green-600'
                          : c.value >= 40
                          ? 'text-gold'
                          : 'text-crimson'
                      }`}
                    >
                      {c.value}
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-ink/8 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      c.value >= 70 ? 'bg-green-500' : c.value >= 40 ? 'bg-gold' : 'bg-crimson'
                    }`}
                    style={{ width: `${c.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex-1 py-3.5 border border-ink/20 rounded-xl font-sans text-sm text-ink/55 hover:border-gold hover:text-ink transition-colors"
          >
            New Case
          </button>
          <button
            onClick={() => {
              useSessionStore.getState().setSession(subject, topic, intensity);
              navigate('/examination');
            }}
            className="flex-1 py-3.5 bg-navy text-gold rounded-xl font-sans text-sm tracking-wide hover:bg-navy/90 transition-colors shadow"
          >
            Retry Examination
          </button>
        </div>
      </div>
    </div>
  );
}
