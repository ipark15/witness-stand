# Witness Stand — Repo Documentation (Working Memory)

**Last updated:** 2026-05-23  
**Scratch location:** `/home/ubuntu/witness-stand/scratch/`

---

## Project Overview

Court-themed study app for an HCI class. The core representation: studying = mock hearing / oral defense. Student is "defense counsel" who must explain material under cross-examination by an AI "opposing counsel." Values: **rigor and robustness** over ease/convenience. The student must *produce* explanations, not merely *recognize* correct ones.

---

## Repo Structure

```
witness-stand/
├── .gitignore          # includes *scratch/ (safe for our notes)
├── backend/            # Python/FastAPI
│   ├── .env.example
│   ├── pyproject.toml  # python >=3.12, fastapi, google-genai, loguru, pydantic-settings
│   ├── uv.lock
│   ├── prompts/        # Editable .md persona templates
│   │   ├── opposition_system.md
│   │   ├── co_counsel_system.md
│   │   └── subtopic_planner_system.md
│   └── src/witness_stand/
│       ├── main.py             # App entrypoint, CORS, DI setup
│       ├── config.py           # pydantic-settings config
│       ├── constants.py        # Intensities, judge transitions, scoring bounds, etc.
│       ├── logging_setup.py    # loguru + request context middleware
│       ├── ai/
│       │   ├── base.py         # LLM Protocol (8 methods), ChatMessage, FileRef, LLMError
│       │   ├── gemma.py        # GemmaLLM via google-genai SDK
│       │   └── prompts/
│       │       ├── _loader.py          # load_template/fill from prompts/*.md
│       │       ├── opposition.py       # system + history + opening builders
│       │       ├── co_counsel.py       # system + history builders
│       │       └── subtopic_planner.py # system + prompt builders
│       ├── api/
│       │   ├── __init__.py     # api_router (/api prefix)
│       │   ├── _deps.py        # DI deps: LLMDep, SessionStoreDep, SessionDep, fresh_files
│       │   ├── sessions.py     # CRUD: create/get/delete session
│       │   ├── files.py        # multipart upload → google File API
│       │   ├── subtopics.py    # planner + opening turn generation
│       │   ├── turns.py        # main loop: defense→opposition→scoring→advance?
│       │   └── co_counsel.py   # private hint endpoint (-5 jury penalty)
│       ├── schemas/
│       │   ├── session.py      # Session, SessionCreate, SessionState, SubtopicProgress
│       │   ├── examiner.py     # ExaminerTurn, TurnRequest, TranscriptMessage, OppositionResponse
│       │   ├── scoring.py      # ScoringRubric (correctness, specificity, mechanism_vs_recognition, confidence_calibration)
│       │   ├── subtopics.py    # SubtopicPlan, SubtopicsResponse
│       │   └── files.py        # FileRefDTO, FileUploadResult
│       └── services/
│           ├── session_store.py # JsonFileSessionStore (atomic FS writes, per-session locks)
│           └── deltas.py        # rubric_to_deltas: ScoringRubric → (quality_delta, jury_delta)
└── frontend/           # React/Vite
    ├── package.json    # react, react-router-dom, zustand, tailwind
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx             # Routes: / → Setup, /examination, /verdict
        ├── main.jsx
        ├── index.css
        ├── store/
        │   └── sessionStore.js # Zustand store (session config, subtopics, scores, messages, files)
        └── pages/
            ├── Setup.jsx       # Session creation form (subject, topic, intensity, file upload)
            ├── Examination.jsx # Main chat UI + sidebar (jury, evidence quality) + study guide tab
            └── Verdict.jsx     # Final score display
```

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.12+, FastAPI, uv package manager, google-genai SDK (Gemma 4), loguru, pydantic-settings |
| Frontend | React 18, Vite 5, Zustand 4, TailwindCSS 3, react-router-dom 6 |
| LLM | Gemma 4 (gemma-4-26b-a4b-it) via Google AI Studio |
| Storage | JSON files on disk (one per session) |

---

## Backend Architecture

### API Flow (Examination Main Loop)

1. **Create session** → `POST /api/sessions` (subject, topic, intensity)
2. **Upload files** → `POST /api/sessions/{id}/files` (optional course materials)
3. **Plan subtopics** → `POST /api/sessions/{id}/subtopics`
   - Generates 4 subtopics via structured LLM call
   - Also generates opening examiner turn
4. **Submit turns** → `POST /api/sessions/{id}/turns` (main loop)
   - Student message → persisted as "defense"
   - Builds multi-turn chat history (defense=user, counsel=model, judge/co_counsel=omitted)
   - Structured response: ExaminerTurn (message, advance, scoring, rationale)
   - ScoringRubric → deltas via weighted formula (mechanism 0.40, correctness 0.30, specificity 0.20, calibration 0.10)
   - If advance=true and not last subtopic → judge transition (templated)
   - If advance=true and last subtopic → session complete, verdict
5. **Co-counsel** → `POST /api/sessions/{id}/co-counsel` (-5 jury penalty)
   - Whispered nudge, does not solve for student

### Key Design Decisions

- **Roles are endpoint-determined** — never parsed from model output
- **Structured output** — all LLM responses validated via Pydantic schemas
- **Prompt layout**: persona in system instruction (stable, cacheable), per-turn state prepended to latest user message
- **Scoring**: model-judged ScoringRubric replaces old lexical scorer. Rewards mechanism-level understanding.
- **Judge transitions**: templated strings, not LLM calls — the app speaks in its own voice

### Scoring System

```
ScoringRubric:
  - correctness (0-100)       → weight 0.30
  - specificity (0-100)       → weight 0.20
  - mechanism_vs_recognition  → weight 0.40 (key dimension!)
  - confidence_calibration    → weight 0.10

composite = weighted sum → centered at 50 → mapped to:
  - quality_delta: [-15, +15]
  - jury_delta: [-10, +10]
```

### Session State

- jury_favor: 0-100, starts at 50
- subtopics: list of SubtopicProgress (name + quality 0-100)
- current_subtopic_index: advances when opposition signals `advance=true`
- transcript: ordered list of TranscriptMessage (id, speaker, content, scoring, rationale)
- Verdict: jury_favor >= 70 → Acquitted, >= 40 → Hung Jury, < 40 → Guilty

### Prompt Files (backend/prompts/)

- `opposition_system.md`: Cross-examiner persona. Interrupt vague language, demand evidence, surface assumptions, use counterexamples, pressure-test.
- `co_counsel_system.md`: Colleague whisper. Nudge don't solve, suggest structural moves, under 60 words.
- `subtopic_planner_system.md`: Curriculum planner. Produce small set of independently-testable subtopics.

---

## Frontend Architecture

- **Zustand store**: Single source of truth for session state (subject, topic, intensity, subtopics, scores, messages, files, view, verdict)
- **Pages**:
  - Setup: form to create session (subject, topic, intensity selector, file drag-drop)
  - Examination: split layout — chat panel + sidebar (jury favor bar, evidence quality per subtopic) + "Study Guide" tab (performance analysis cards)
  - Verdict: final score breakdown
- **UI theme**: Courtroom/parchment aesthetic, navy/gold/crimson colors, serif fonts, court roster sidebar

### Frontend-Backend Mismatch (Important!)

The frontend still calls OLD endpoints (`/api/subtopics`, `/api/examine`, `/api/co-counsel`) that don't match the new backend routes (`/api/sessions/{id}/subtopics`, `/api/sessions/{id}/turns`, `/api/sessions/{id}/co-counsel`). The frontend hasn't been updated to the new session-based API. This is a known gap.

---

## Constants to Remember

- SUBTOPIC_COUNT = 4
- MESSAGE_HISTORY_WINDOW = 12
- EXCHANGES_PER_SUBTOPIC = 5 (frontend only, used for progress bar)
- CO_COUNSEL_JURY_PENALTY = 5
- Intensities: "Preliminary" | "Trial" | "Appeal"
- FILE_TTL_SECONDS = 47h

---

## Git Info

- Single branch: `main`
- 5 commits total
- No pre-commit hooks, no CI
- .gitignore includes `*scratch/` — our notes won't be committed
