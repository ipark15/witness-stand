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
      const rank = { pending: 0, partial: 1, covered: 2 };
      const newMatters = state.caseFile.matters.map((matter) => ({
        ...matter,
        children: matter.children.map((node) => {
          const update = updates.find((u) => u.node_id === node.id);
          if (!update) return node;
          if ((rank[update.new_status] || 0) > (rank[node.status] || 0)) {
            return { ...node, status: update.new_status };
          }
          return node;
        }),
      }));
      // Update matter-level status based on children
      const updatedMatters = newMatters.map((matter) => {
        const allCovered = matter.children.every((c) => c.status === 'covered');
        const anyPartial = matter.children.some((c) => c.status === 'partial' || c.status === 'covered');
        const newStatus = allCovered ? 'covered' : anyPartial ? 'partial' : matter.status;
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
