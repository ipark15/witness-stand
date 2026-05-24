# Workpad — Current Task (Lesson Plan / Case File Feature)

**Last updated:** 2026-05-23 ~00:30 UTC  
**Context:** HCI class iteration based on professor + user feedback

---

## Implementation Progress

### Done (Stubs & Wiring — from `devin/lesson-plan-stubs`)

| File | What |
|------|------|
| `backend/src/witness_stand/schemas/lesson_plan.py` | Pydantic models: `NodeCategory`, `CaseFileNode`, `LessonPlan`, `NodeSpec`, `MatterSpec`, `LessonPlanGeneration`, `CaseFileNodeDTO`, `LessonPlanResponse`, `SectionUpdate`, **`EvaluationResult`** |
| `backend/prompts/lesson_plan_system.md` | Stub prompt template (subject/topic/scope_guidance placeholders) |
| `backend/prompts/evaluation_system.md` | **NEW** — evaluator prompt that compares student testimony to answer keys |
| `backend/src/witness_stand/ai/prompts/lesson_plan.py` | `build_lesson_plan_system()` + `build_lesson_plan_prompt()` |
| `backend/src/witness_stand/ai/prompts/evaluation.py` | **NEW** — `build_evaluation_system()` builds context for the evaluator |
| `backend/src/witness_stand/ai/mock.py` | **NEW** — `MockLLM` for testing without API calls |
| `backend/src/witness_stand/services/fixtures.py` | **NEW** — loads pre-generated lesson plans from JSON fixtures |
| `backend/fixtures/` | **NEW** — pre-baked lesson plans for demo/user study |
| `backend/fixtures/README.md` | **NEW** — quickstart guide for generating/loading fixtures |
| `backend/src/witness_stand/api/lesson_plan.py` | Updated: fixtures support, session persistence, GET endpoint |
| `backend/src/witness_stand/api/turns.py` | Updated: evaluation step, case file progression, matter advancement |
| `backend/src/witness_stand/schemas/session.py` | Updated: `lesson_plan` field, `current_matter_index`, `current_matter` property |
| `backend/src/witness_stand/schemas/examiner.py` | Updated: `evaluation_feedback` on `OppositionResponse` |
| `backend/src/witness_stand/main.py` | Updated: `LLM_PROVIDER=mock` support |

### Verified
- Full e2e flow with MockLLM + fixture: session create → lesson plan load → turns → evaluation → matter tracking
- Gemma evaluation test (1 API call): correctly checks off motivation + distinction as covered, marks definition as partial, gives constructive feedback

### Workshop Decisions (2026-05-23)

**Workshopped with Leon using OS → Paging as toy example.**

#### Structure settled on:
- 3–6 top-level matters per topic
- 2–5 leaf nodes per matter (~13 leaves total for a topic like Paging)
- Each leaf has: `category`, `prompt_hint`, `answer_key`, `status`
- Categories: motivation, definition, mechanism, example, tradeoff, distinction (unchanged from stubs)

#### Key design decisions:
1. **`[example]` nodes get concrete specs in prompt_hint** — e.g., "16-bit VA space, 4KB pages, 256 frames. Translate VA 0x3A7F." The student still has to produce the walkthrough, but doesn't waste time inventing the setup. Other categories keep open-ended hints.
2. **Answer key format:** ~1 paragraph canonical explanation + "Also acceptable" clause (alternative valid approaches) + "Not required" clause (sets the floor). This helps the model avoid false negatives.
3. **Two-step generation:** Topic extraction (4-5 topics from subject) → per-topic breakdown. Each step is scoped and cheaper.
4. **Softened category guidance:** Categories are guidance, not mandates. "Choose whichever categories are natural" rather than "must carry at least one."
5. **Gemma structured output workaround:** `response_mime_type: "application/json"` + schema in system prompt instead of `response_schema` (which triggers constrained decoding that hangs). See google-deepmind/gemma#622.

#### Evaluation flow:
- Each turn: evaluator gets remaining unchecked nodes + answer keys + student's latest message
- Produces: `section_updates` (what got checked off) + `feedback` (constructive gaps, no spoilers)
- App logic: advances to next matter when all nodes in current matter are covered
- Feedback is on the student's side — points at what's missing without revealing the answer

### Key Architectural Decisions
- **Fixture-first for user study:** `USE_FIXTURE_LESSON_PLAN=true` loads pre-baked plans. Someone with a chat subscription can generate new fixtures offline and drop them in `backend/fixtures/lesson_plans/`.
- **MockLLM for dev:** `LLM_PROVIDER=mock` returns scripted responses. Zero API calls.
- **Matters replace subtopics:** Lesson plan matters populate `session.subtopics` — the existing subtopic progression UI works.

### The Representation Argument (for HCI class)

**What the case file IS as a representation:** It replaces the previously tacked-on study guide with a structured artifact that serves dual purpose — (1) guides the examination in real-time by making gaps visible, and (2) becomes a completed study guide after the fact, showing what the student demonstrated and where.

---

## Recent Session Work (2026-05-24)

### Speech-to-Text / Dictation (PR #9)
- **Branch:** `devin/1779570497-speech-to-text`
- **PR:** https://github.com/LLeon360/witness-stand/pull/9
- **Status:** Code complete, pushed, PR open
- **What:** Added mic button to TestimonyInput using Web Speech API (free, browser-native)
  - `frontend/src/hooks/useSpeechRecognition.js` — custom hook wrapping SpeechRecognition API
  - `frontend/src/components/examination/TestimonyInput.jsx` — mic button bottom-right of textarea
  - Continuous mode, final transcripts only, crimson border + pulse animation when listening
  - Hidden on unsupported browsers (Firefox disabled by default)

### Viewport Layout Fix (also on PR #9 branch)
- **Issue:** Testimony input bar was clipped off screen on shorter viewports (Desktop tab adds browser chrome)
- **Fix committed (7a4288d):**
  - `Examination.jsx`: Changed `h-screen` → `fixed inset-0` (pins to actual visible viewport)
  - `Examination.jsx`: Header padding `py-3` → `py-2`
  - `TestimonyInput.jsx`: Input area padding `py-4` → `py-2`, textarea `rows={3}` → `rows={2}`, label margin `mb-1.5` → `mb-1`
- **Still needs verification** — browser tool broke before I could visually confirm the fix in user's viewport

### Browser Tool Issue
- Accidentally killed the managed Chrome process, browser tool can't reconnect
- Needs a fresh session to restore

### Pending for Next Session
1. **Verify layout fix** — open browser, check input bar is fully visible
2. **Test dictation flow** — start servers with `LLM_PROVIDER=file`, open browser, test mic button
3. **Respond as LLM backend** — watch `backend/data/llm_request_*.json`, respond with `llm_response_{id}.json`
4. **Merge PR #9** after user approves

### How to Start Servers
```bash
# Backend with FileLLM (you respond manually via files)
cd /home/ubuntu/witness-stand/backend
LLM_PROVIDER=file uv run uvicorn witness_stand.main:app --host 0.0.0.0 --port 8000

# Frontend
cd /home/ubuntu/witness-stand/frontend
npx vite --host 0.0.0.0 --port 5173
```

### FileLLM Protocol
1. Backend writes `data/llm_request_{id}.json` with: system prompt, user prompt, schema
2. Watch for requests: `ls backend/data/llm_request_*.json`
3. Write response: `data/llm_response_{id}.json` with `{"id": "<same_id>", "content": "<json_string>"}`
4. Backend picks up within 1s
