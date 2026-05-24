import { create } from 'zustand';

const useSessionStore = create((set, get) => ({
  // Session config
  sessionId: null,
  subject: '',
  topic: '',
  intensity: 'Trial',

  // Subtopics
  subtopics: [],
  currentSubtopicIndex: 0,

  // Scoring
  juryFavor: 50,
  subtopicScores: [], // [{ name, quality }]

  // Messages
  messages: [], // [{ id, role: 'user'|'ai', content, speakerRole: 'counsel'|'judge'|'cocounsel' }]

  // Files
  uploadedFiles: [],

  // Case file (lesson plan)
  caseFile: null, // { topic, matters: [{ id, label, category, prompt_hint, status, children: [...] }] }
  evaluationFeedback: '',

  // UI
  view: 'examination', // 'examination' | 'casefile'

  // Verdict
  verdict: null,

  // ── Actions ──────────────────────────────────────────────────────────

  setSession: (sessionId, subject, topic, intensity) =>
    set({
      sessionId,
      subject,
      topic,
      intensity,
      subtopics: [],
      currentSubtopicIndex: 0,
      juryFavor: 50,
      subtopicScores: [],
      messages: [],
      uploadedFiles: [],
      caseFile: null,
      evaluationFeedback: '',
      view: 'examination',
      verdict: null,
    }),

  // Hydrate the store from a server SessionState payload. Used when
  // resuming an in-progress session from Case History — we want the
  // freshest persisted progress (subtopic qualities, jury favor, current
  // matter index, transcript) rather than the defaults `setSession`
  // installs for new sessions. The case file (lesson plan) lives on a
  // separate endpoint and should be fetched and `setCaseFile`'d by the
  // caller after this.
  hydrateFromSession: (s) =>
    set({
      sessionId: s.id,
      subject: s.subject,
      topic: s.topic,
      intensity: s.intensity,
      subtopics: (s.subtopics || []).map((st) => st.name),
      subtopicScores: (s.subtopics || []).map((st) => ({
        name: st.name,
        quality: st.quality ?? 50,
      })),
      currentSubtopicIndex: s.current_subtopic_index ?? 0,
      juryFavor: s.jury_favor ?? 50,
      messages: (s.transcript || []).map((msg) => {
        if (msg.speaker === 'defense') {
          return { id: msg.id, role: 'user', content: msg.content };
        }
        const speakerMap = {
          counsel: 'counsel',
          judge: 'judge',
          co_counsel: 'cocounsel',
        };
        return {
          id: msg.id,
          role: 'ai',
          content: msg.content,
          speakerRole: speakerMap[msg.speaker] || 'counsel',
        };
      }),
      uploadedFiles: [],
      caseFile: null,
      evaluationFeedback: '',
      view: 'examination',
      verdict: s.verdict ?? null,
    }),

  initSubtopics: (subtopics) =>
    set({
      subtopics,
      subtopicScores: subtopics.map((name) => ({ name, quality: 50 })),
      currentSubtopicIndex: 0,
    }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { id: Date.now() + Math.random(), ...msg }],
    })),

  applyScoring: (qualityDelta, juryDelta) =>
    set((state) => {
      const newJury = Math.max(0, Math.min(100, state.juryFavor + juryDelta));
      const scores = state.subtopicScores.map((s, i) =>
        i === state.currentSubtopicIndex
          ? { ...s, quality: Math.max(0, Math.min(100, s.quality + qualityDelta)) }
          : s
      );
      return { juryFavor: newJury, subtopicScores: scores };
    }),

  nextSubtopic: () =>
    set((state) => ({ currentSubtopicIndex: state.currentSubtopicIndex + 1 })),

  addFile: (file) =>
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles.filter((f) => f.name !== file.name), file],
    })),

  removeFile: (name) =>
    set((state) => ({ uploadedFiles: state.uploadedFiles.filter((f) => f.name !== name) })),

  setCaseFile: (caseFile) => set({ caseFile }),

  setEvaluationFeedback: (feedback) => set({ evaluationFeedback: feedback }),

  applySectionUpdates: (updates) =>
    set((state) => {
      if (!state.caseFile || !updates || updates.length === 0) return state;
      const rank = { pending: 0, partial: 1, covered: 2, skipped: 2 };
      const newMatters = state.caseFile.matters.map((matter) => ({
        ...matter,
        children: matter.children.map((node) => {
          const update = updates.find((u) => u.node_id === node.id);
          if (!update) return node;
          // Don't overwrite skipped with covered/partial
          if (node.status === 'skipped') return node;
          if ((rank[update.new_status] || 0) > (rank[node.status] || 0)) {
            return { ...node, status: update.new_status };
          }
          return node;
        }),
      }));
      const updatedMatters = newMatters.map((matter) => {
        const allDone = matter.children.every((c) => c.status === 'covered' || c.status === 'skipped');
        const anyPartial = matter.children.some((c) => ['partial', 'covered', 'skipped'].includes(c.status));
        const newStatus = allDone ? 'covered' : anyPartial ? 'partial' : matter.status;
        return { ...matter, status: newStatus };
      });
      return { caseFile: { ...state.caseFile, matters: updatedMatters } };
    }),

  skipNode: (nodeId) =>
    set((state) => {
      if (!state.caseFile) return state;
      const newMatters = state.caseFile.matters.map((matter) => ({
        ...matter,
        children: matter.children.map((node) => {
          if (node.id !== nodeId) return node;
          if (node.status === 'covered' || node.status === 'skipped') return node;
          return { ...node, status: 'skipped', revealed_answer: node.answer_key || '' };
        }),
      }));
      const updatedMatters = newMatters.map((matter) => {
        const allDone = matter.children.every((c) => c.status === 'covered' || c.status === 'skipped');
        const anyPartial = matter.children.some((c) => ['partial', 'covered', 'skipped'].includes(c.status));
        const newStatus = allDone ? 'covered' : anyPartial ? 'partial' : matter.status;
        return { ...matter, status: newStatus };
      });
      return { caseFile: { ...state.caseFile, matters: updatedMatters } };
    }),

  setView: (view) => set({ view }),

  setVerdict: (verdict) => set({ verdict }),

  reset: () =>
    set({
      sessionId: null,
      subject: '',
      topic: '',
      intensity: 'Trial',
      subtopics: [],
      currentSubtopicIndex: 0,
      juryFavor: 50,
      subtopicScores: [],
      messages: [],
      uploadedFiles: [],
      caseFile: null,
      evaluationFeedback: '',
      view: 'examination',
      verdict: null,
    }),
}));

export default useSessionStore;
