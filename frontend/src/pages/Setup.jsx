import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useSessionStore from '../store/sessionStore.js';

const INTENSITIES = ['Preliminary', 'Trial', 'Appeal'];

const INTENSITY_DESC = {
  Preliminary: 'Gentle probing, foundational questions',
  Trial: 'Rigorous cross-examination, no mercy',
  Appeal: 'Relentless, expert-level pressure',
};

const CASE_HISTORY = [
  {
    subject: 'Computer Science',
    topic: 'Binary Search Trees',
    date: '2025-03-15',
    verdict: 'Acquitted',
    score: 82,
  },
  {
    subject: 'Chemistry',
    topic: 'Organic Reaction Mechanisms',
    date: '2025-03-10',
    verdict: 'Hung Jury',
    score: 54,
  },
  {
    subject: 'History',
    topic: 'The French Revolution',
    date: '2025-03-05',
    verdict: 'Guilty',
    score: 31,
  },
];

const verdictColor = {
  Acquitted: 'bg-green-100 text-green-700 border-green-200',
  'Hung Jury': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Guilty: 'bg-red-100 text-red-700 border-red-200',
};

export default function Setup() {
  const navigate = useNavigate();
  const { setSession, addFile, removeFile, uploadedFiles } = useSessionStore();

  const [tab, setTab] = useState('new');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [intensity, setIntensity] = useState('Trial');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = () => {
    if (!subject.trim() || !topic.trim()) return;
    setSession(subject.trim(), topic.trim(), intensity);
    navigate('/examination');
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach((f) => addFile({ name: f.name, size: f.size }));
  };

  const handleFileInput = (e) => {
    Array.from(e.target.files).forEach((f) => addFile({ name: f.name, size: f.size }));
    e.target.value = '';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-parchment font-serif">
      {/* Header */}
      <header className="bg-navy px-8 py-5 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-gold font-serif text-2xl tracking-widest uppercase">
            The Witness Stand
          </h1>
          <p className="text-parchment/50 font-sans text-xs tracking-widest uppercase mt-0.5">
            Academic Cross-Examination System
          </p>
        </div>
        <div className="text-parchment/30 font-sans text-xs tracking-widest">Est. MMXXIV</div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ── Left Column ─────────────────────────────────────────────── */}
        <div>
          {/* Tabs */}
          <div className="flex border-b border-gold/30 mb-7">
            {[
              { key: 'new', label: 'New Session' },
              { key: 'history', label: 'Case History' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-2.5 font-sans text-sm tracking-wide transition-colors ${
                  tab === key
                    ? 'border-b-2 border-gold text-gold -mb-px font-semibold'
                    : 'text-ink/40 hover:text-ink/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'new' ? (
            <div className="space-y-6">
              {/* Live sentence */}
              <div className="bg-navy/5 border border-gold/25 rounded-lg p-5">
                <p className="font-serif text-ink text-base leading-relaxed italic">
                  "In the Matter of Academic Mastery — Defense counsel must demonstrate sufficient
                  command of{' '}
                  <span className="text-crimson font-semibold not-italic">
                    {subject || '[Subject]'}
                  </span>
                  ."
                </p>
              </div>

              <div>
                <label className="block font-sans text-xs text-ink/55 uppercase tracking-widest mb-1.5">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Computer Science"
                  className="w-full border border-ink/20 bg-white/60 rounded-lg px-3.5 py-2.5 font-serif text-ink placeholder:text-ink/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition"
                />
              </div>

              <div>
                <label className="block font-sans text-xs text-ink/55 uppercase tracking-widest mb-1.5">
                  Topic
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Binary Search Trees"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="w-full border border-ink/20 bg-white/60 rounded-lg px-3.5 py-2.5 font-serif text-ink placeholder:text-ink/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition"
                />
              </div>

              {/* Intensity */}
              <div>
                <label className="block font-sans text-xs text-ink/55 uppercase tracking-widest mb-2">
                  Examination Intensity
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {INTENSITIES.map((level) => (
                    <button
                      key={level}
                      onClick={() => setIntensity(level)}
                      className={`py-3 px-2 rounded-lg border text-center transition-all ${
                        intensity === level
                          ? 'bg-navy text-gold border-navy shadow-md'
                          : 'bg-white/50 text-ink/55 border-ink/15 hover:border-gold/50 hover:text-ink'
                      }`}
                    >
                      <div className="font-sans text-xs font-semibold tracking-wide">{level}</div>
                      <div
                        className={`font-sans text-xs mt-0.5 ${
                          intensity === level ? 'text-gold/70' : 'text-ink/35'
                        }`}
                      >
                        {INTENSITY_DESC[level].split(',')[0]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!subject.trim() || !topic.trim()}
                className="w-full py-3.5 bg-navy text-gold font-sans text-sm tracking-widest uppercase rounded-lg border border-gold/30 hover:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow"
              >
                ⚖ Call to Order
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {CASE_HISTORY.map((c, i) => (
                <div
                  key={i}
                  className="border border-gold/20 rounded-lg p-4 bg-white/30 hover:bg-white/50 transition-colors cursor-default"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-serif text-ink font-semibold text-base">{c.topic}</p>
                      <p className="font-sans text-xs text-ink/45 mt-0.5">
                        {c.subject} · {c.date}
                      </p>
                    </div>
                    <span
                      className={`font-sans text-xs px-2.5 py-1 rounded border ${verdictColor[c.verdict]}`}
                    >
                      {c.verdict}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-ink/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          c.score >= 70
                            ? 'bg-green-500'
                            : c.score >= 40
                            ? 'bg-gold'
                            : 'bg-crimson'
                        }`}
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <span className="font-sans text-xs text-ink/40 w-12 text-right">
                      {c.score}/100
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right Column ─────────────────────────────────────────────── */}
        <div>
          <h2 className="font-sans text-xs text-ink/55 uppercase tracking-widest mb-4">
            Evidence Submission
          </h2>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-gold bg-gold/8 scale-[1.01]'
                : 'border-ink/20 bg-white/20 hover:border-gold/50 hover:bg-white/30'
            }`}
          >
            <div className="text-5xl mb-3 select-none">📜</div>
            <p className="font-serif text-ink/55 text-base">
              Drag & drop study materials here
            </p>
            <p className="font-sans text-xs text-ink/30 mt-1">PDF, DOCX, TXT accepted</p>
            <span className="mt-5 inline-block font-sans text-xs text-gold border border-gold/40 px-4 py-1.5 rounded-lg hover:bg-gold/10 transition-colors">
              Browse Files
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleFileInput}
            />
          </div>

          {uploadedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {uploadedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/50 border border-ink/10 rounded-lg px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm shrink-0">📄</span>
                    <div className="min-w-0">
                      <p className="font-sans text-xs text-ink truncate max-w-[200px]">{f.name}</p>
                      <p className="font-sans text-xs text-ink/35">{formatSize(f.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="font-sans text-xs text-crimson hover:text-crimson/70 transition-colors shrink-0 ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Court Guidelines */}
          <div className="mt-8 border border-gold/25 rounded-xl p-5 bg-navy/4">
            <h3 className="font-sans text-xs text-ink/50 uppercase tracking-widest mb-4">
              Court Guidelines
            </h3>
            <ul className="space-y-2.5 font-serif text-sm text-ink/60 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-gold shrink-0">·</span>
                You will be cross-examined on your submitted topic by an AI examiner.
              </li>
              <li className="flex gap-2">
                <span className="text-gold shrink-0">·</span>
                The examiner alternates between Opposing Counsel and Judge roles.
              </li>
              <li className="flex gap-2">
                <span className="text-gold shrink-0">·</span>
                Jury Favor (0–100) tracks your cumulative performance.
              </li>
              <li className="flex gap-2">
                <span className="text-gold shrink-0">·</span>
                Score ≥70 = Acquitted · ≥40 = Hung Jury · &lt;40 = Guilty.
              </li>
              <li className="flex gap-2">
                <span className="text-gold shrink-0">·</span>
                Vague or short answers will be challenged aggressively.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
