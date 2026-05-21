import { create } from 'zustand';

const useSessionStore = create((set, get) => ({
  // Session config
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
  messages: [], // [{ id, role: 'user'|'ai', content, speakerRole: 'counsel'|'judge' }]

  // Files
  uploadedFiles: [],

  // UI
  view: 'examination', // 'examination' | 'studyguide'

  // Verdict
  verdict: null,

  // ── Actions ──────────────────────────────────────────────────────────

  setSession: (subject, topic, intensity) =>
    set({
      subject,
      topic,
      intensity,
      subtopics: [],
      currentSubtopicIndex: 0,
      juryFavor: 50,
      subtopicScores: [],
      messages: [],
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

  setView: (view) => set({ view }),

  setVerdict: (verdict) => set({ verdict }),
}));

export default useSessionStore;
