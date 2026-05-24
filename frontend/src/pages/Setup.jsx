import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useSessionStore from '../store/sessionStore.js';
import { INTENSITIES, INTENSITY_DESC } from '../lib/constants.js';
import AppHeader from '../components/layout/AppHeader.jsx';
import ScoreBar from '../components/ui/ScoreBar.jsx';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [fileObjects, setFileObjects] = useState([]);

  // User study mode
  const [studyMode, setStudyMode] = useState(false);
  const [customPlanJson, setCustomPlanJson] = useState('');
  const [jsonError, setJsonError] = useState(null);

  const handleSubmit = useCallback(async () => {
    if (!subject.trim() || !topic.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          topic: topic.trim(),
          intensity,
        }),
      });
      if (!sessionRes.ok) {
        const detail = await sessionRes.json().catch(() => ({}));
        throw new Error(detail.detail || `Failed to create session (${sessionRes.status})`);
      }
      const session = await sessionRes.json();
      const sessionId = session.id;

      if (fileObjects.length > 0) {
        for (const f of fileObjects) {
          const formData = new FormData();
          formData.append('files', f);
          const uploadRes = await fetch(`/api/sessions/${sessionId}/files`, {
            method: 'POST',
            body: formData,
          });
          if (!uploadRes.ok) {
            console.warn(`File upload failed for ${f.name}, continuing without it`);
          }
        }
      }

      // If user study mode, load the custom lesson plan
      if (studyMode && customPlanJson.trim()) {
        let parsed;
        try {
          parsed = JSON.parse(customPlanJson.trim());
        } catch {
          throw new Error('Invalid JSON in custom lesson plan');
        }
        const planRes = await fetch(`/api/sessions/${sessionId}/lesson-plan/custom`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
        });
        if (!planRes.ok) {
          const detail = await planRes.json().catch(() => ({}));
          throw new Error(detail.detail || `Failed to load custom lesson plan (${planRes.status})`);
        }
      }

      setSession(sessionId, subject.trim(), topic.trim(), intensity);
      navigate('/examination');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create session');
    } finally {
      setSubmitting(false);
    }
  }, [subject, topic, intensity, submitting, fileObjects, studyMode, customPlanJson, setSession, navigate]);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((f) => addFile({ name: f.name, size: f.size }));
    setFileObjects((prev) => [...prev.filter((fo) => !files.some((f) => f.name === fo.name)), ...files]);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((f) => addFile({ name: f.name, size: f.size }));
    setFileObjects((prev) => [...prev.filter((fo) => !files.some((f) => f.name === fo.name)), ...files]);
    e.target.value = '';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-parchment font-serif">
      <AppHeader subtitle="Academic Cross-Examination System">
        <div className="text-parchment/30 font-sans text-xs tracking-widest">Est. MMXXIV</div>
      </AppHeader>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left Column */}
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

              {error && (
                <div className="bg-crimson/10 border border-crimson/30 rounded-lg px-4 py-2.5 font-sans text-sm text-crimson">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!subject.trim() || !topic.trim() || submitting}
                className="w-full py-3.5 bg-navy text-gold font-sans text-sm tracking-widest uppercase rounded-lg border border-gold/30 hover:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow"
              >
                {submitting ? 'Convening Court…' : '⚖ Call to Order'}
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
                    <ScoreBar value={c.score} height="h-1.5" className="flex-1" />
                    <span className="font-sans text-xs text-ink/40 w-12 text-right">
                      {c.score}/100
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column */}
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
                    onClick={() => { removeFile(f.name); setFileObjects((prev) => prev.filter((fo) => fo.name !== f.name)); }}
                    className="font-sans text-xs text-crimson hover:text-crimson/70 transition-colors shrink-0 ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* User Study Mode */}
          <div className="mt-8 border border-gold/25 rounded-xl p-5 bg-navy/4">
            <button
              onClick={() => setStudyMode(!studyMode)}
              className="w-full flex items-center justify-between group"
            >
              <h3 className="font-sans text-xs text-ink/50 uppercase tracking-widest">
                User Study Mode
              </h3>
              <div className="flex items-center gap-2">
                <span className="font-sans text-xs text-ink/30">
                  {studyMode ? 'ON' : 'OFF'}
                </span>
                <div
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    studyMode ? 'bg-gold' : 'bg-ink/20'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      studyMode ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            </button>

            {studyMode && (
              <div className="mt-4 space-y-3">
                <p className="font-serif text-sm text-ink/55 leading-relaxed">
                  Paste a lesson plan JSON generated by ChatGPT (or another LLM) to
                  skip the built-in AI generation step. This loads the case file
                  directly when the session starts.
                </p>
                <textarea
                  value={customPlanJson}
                  onChange={(e) => {
                    setCustomPlanJson(e.target.value);
                    setJsonError(null);
                    if (e.target.value.trim()) {
                      try {
                        JSON.parse(e.target.value.trim());
                      } catch {
                        setJsonError('Invalid JSON');
                      }
                    }
                  }}
                  placeholder={'{\n  "topic": "Paging",\n  "matters": [\n    {\n      "label": "What Is Paging?",\n      "nodes": [\n        {\n          "label": "Motivation",\n          "category": "motivation",\n          "prompt_hint": "Why is paging used?",\n          "answer_key": "Paging solves..."\n        }\n      ]\n    }\n  ],\n  "rationale": "..."\n}'}
                  rows={10}
                  className="w-full border border-ink/20 bg-white/60 rounded-lg px-3.5 py-2.5 font-mono text-xs text-ink placeholder:text-ink/25 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30 transition resize-y"
                />
                {jsonError && (
                  <p className="font-sans text-xs text-crimson">{jsonError}</p>
                )}
                {customPlanJson.trim() && !jsonError && (
                  <p className="font-sans text-xs text-green-600">Valid JSON</p>
                )}
                <p className="font-sans text-xs text-ink/35 leading-relaxed">
                  See the <span className="font-semibold">User Study Guide</span> in
                  the repo for the ChatGPT prompt and JSON schema.
                </p>
              </div>
            )}
          </div>

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
