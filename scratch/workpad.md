# Workpad — Current Task (Lesson Plan / Case File Feature)

**Last updated:** 2026-05-23 18:55 UTC  
**Context:** HCI class iteration based on professor + user feedback

---

## Implementation Progress

### Done (Stubs & Wiring)

| File | What |
|------|------|
| `backend/src/witness_stand/schemas/lesson_plan.py` | Pydantic models: `NodeCategory`, `CaseFileNode`, `LessonPlan`, `NodeSpec`, `MatterSpec`, `LessonPlanGeneration`, `CaseFileNodeDTO`, `LessonPlanResponse`, `SectionUpdate` |
| `backend/prompts/lesson_plan_system.md` | Stub prompt template (subject/topic/scope_guidance placeholders) |
| `backend/src/witness_stand/ai/prompts/lesson_plan.py` | `build_lesson_plan_system()` + `build_lesson_plan_prompt()` |
| `backend/src/witness_stand/api/lesson_plan.py` | `POST /api/sessions/{id}/lesson-plan` endpoint (generates plan, returns frontend-safe DTO) |
| `backend/src/witness_stand/schemas/examiner.py` | Added `section_updates: list[SectionUpdate]` to both `ExaminerTurn` and `OppositionResponse` |
| `backend/src/witness_stand/api/__init__.py` | Registered `lesson_plan.router` |
| `backend/src/witness_stand/ai/prompts/__init__.py` | Exported new builders |
| `backend/src/witness_stand/schemas/__init__.py` | Exported new schemas |

### Verified
- All imports pass (`uv run python -c "from witness_stand.api import api_router"` → OK)
- Schema instantiation works with defaults
- Prompt template fills correctly

### NOT YET DONE (needs workshop)
- Session schema extension (persisting lesson plan on session)
- Actual prompt content tuning (toy example needed)
- Opposition prompt changes (injecting case file state + answer key)
- Turn endpoint changes (applying section_updates to persisted plan)
- Frontend case file tab
- Relationship between lesson plan and subtopics (replace vs. coexist)

---

## The HCI Framing

**Class theme:** Challenge normative ground. Find new representations that encode new values for AI apps.

**Our values:** Rigor + robustness. Against the conventional "AI summary" approach that prioritizes ease/convenience at the risk of false confidence.

**Core insight:** Understanding you can *recognize* as correct ≠ understanding you can *produce* from scratch. The representation makes that gap visible and forces the student to close it.

---

## Feedback Summary

### Professor Feedback
> "Strong idea — interesting that study-as-question-answering deliberately makes free exploration challenging. Consider: Is there a way to lean into the question-answering piece while mitigating the feeling of stuck-ness?"

### Our Response Strategy
1. **Keep** the rigorous question-answering representation (prof finds it novel, class wants opinionated/non-traditional)
2. **Mitigate stuck-ness** through better structure/visibility, NOT by reducing rigor
3. **User study question:** Does a user know clearly *where specifically* their explanations are incomplete? Does this help identify weak points clearly vs. giving a vague sense of not knowing what to add/fix?

---

## Design Iteration: "Case File" / Lesson Plan

### Problem Being Solved
- Student feels stuck in blank chat with vague sense of inadequacy
- Unclear what "sufficient" looks like
- No visibility into what's missing vs. what's covered

### Proposed Solution: Structured Case File

**Before examination begins**, AI constructs a structured breakdown per concept:
- Main claim
- Supporting claims
- Evidence / examples
- Motivations / Why?
- Definitions
- Mechanism

**Key principle:** The case file makes the *gap* visible without filling it. The AI says what *kind* of thing is missing (e.g., "you have a motivation but no mechanism") without providing the content.

### Internal Name: "Lesson Plan"
### In-App Name: "Case File" (court flavor)

### Architecture

```
Study Material Upload
        ↓
Topic Extraction (high-level: cpu scheduling, paging, filesystems...)
        ↓
Per-Topic Breakdown (hierarchical TOC with max depth)
    For "Virtual Memory":
    ├── Why / Motivation
    ├── Definition
    ├── Example
    └── Mechanics
        ├── Page Table (mechanism + performance)
        ├── TLB (mechanism + what problem it solves + tradeoff)
        └── Hierarchical Page Tables (mechanism + tradeoff)
        ↓
Answer Key (internal, not shown to student)
    - Pre-written expected explanation per leaf node
    - Accepts reasonable alternatives (not just one answer)
        ↓
Examination (go concept-by-concept)
    - AI checks off sections as student explains
    - Case file tab shows progress visually
    - Student sees: which areas are covered, which have gaps
    - Student does NOT see: the answer key itself
```

### How This Addresses Stuck-ness
1. **Visible structure** — student sees what's expected (types of explanation), not a blank void
2. **Progress tracking** — case file shows what's been addressed, what hasn't
3. **Targeted feedback** — "You have a motivation but need the mechanism" instead of vague "insufficient"
4. **Still rigorous** — doesn't give the answer, just makes the gap legible

### How This Preserves Rigor
- Student still must produce the explanation
- App doesn't fill gaps, only names them
- Co-counsel still available for more specific help (with penalty)
- The structure itself doesn't reveal content — only *categories* of expected understanding

---

## Implementation Notes

### What Needs to Happen (Backend)

1. **New Pydantic models** for the lesson plan / case file structure
   - Hierarchical topic breakdown (with max depth constraint)
   - Per-leaf answer key (internal, never sent to frontend)
   - Per-leaf completion status (what the student has addressed)
   - Use pydantic for all types

2. **New prompt / LLM call** to generate the lesson plan
   - Input: study materials + subject/topic
   - Output: structured hierarchical breakdown + internal answer key
   - Should be a pre-examination step (after subtopics, before first turn)
   - Or maybe *replaces* the subtopic planner with a richer version

3. **Checking logic** — as student explains, model evaluates which case file sections are addressed
   - This happens during the turn loop (opposition can mark sections as covered)
   - Needs to be "easy" / forgiving for now — granular topics help
   - Retroactive: stuff from earlier can check off later sections

4. **Prompt separation** — prompts should be in separate `.md` files (already done for existing prompts ✓)

5. **Model context** — needs to see conversation history to track what's been covered (already uses multi-turn chat ✓)

### What Needs to Happen (Frontend)

1. **Case File tab** — replaces or augments the current "Study Guide" tab
   - Shows hierarchical breakdown with completion state per node
   - Visual representation of completeness
   - Still doesn't reveal the answer key — just categories and check/uncheck

2. **Better opposition feedback** — structured messages that reference specific case file gaps
   - "You explained what the TLB does, but not *how* it works mechanistically"

3. **Co-counsel UI** — better surface the co-counsel transcript

---

## Open Design Questions

1. **Granularity** — How deep should the hierarchy go? Proposed: max depth so it's reasonable to generate. Start shallow, iterate.

2. **Checking mechanism** — How does the model decide a section is "covered"?
   - Option A: Opposition return includes a `sections_addressed` field
   - Option B: Separate lightweight evaluation call after each turn
   - Option C: Opposition prompt includes the case file state and naturally references it
   - Preference: Option A or C (keeps it in the existing turn loop)

3. **Lesson plan generation** — Does this replace the subtopic planner or sit alongside it?
   - Current subtopic planner produces 4 noun phrases
   - New system would produce richer hierarchical breakdown
   - Likely: lesson plan *replaces* subtopic planner, and each top-level item IS a subtopic

4. **Few-shot example** — Need to workshop what a "good" lesson plan looks like before baking into prompt. Plan to iterate on a toy example (e.g., OS virtual memory) interactively first.

5. **Model reliability** — Will the model correctly check off the right sections? Having granular topics (fewer moving pieces per concept) helps. Testing needed.

---

## Concrete Toy Example (for workshopping)

**Topic:** Operating Systems — Virtual Memory

**Proposed Lesson Plan:**
```
Virtual Memory
├── Motivation / Why?
│   └── Why does virtual memory exist? What problem does it solve?
├── Definition
│   └── What IS virtual memory? (address space abstraction)
├── Page Table
│   ├── Mechanism: How does address translation work?
│   ├── Structure: What does a page table entry contain?
│   └── Performance Problem: Why is this slow?
├── TLB (Translation Lookaside Buffer)
│   ├── Motivation: What performance problem does TLB solve?
│   ├── Mechanism: How does TLB lookup work? (full path: TLB hit vs miss)
│   └── Tradeoff: What's the cost? (size, invalidation)
└── Hierarchical Page Tables
    ├── Motivation: Why not just one flat page table?
    ├── Mechanism: How does multi-level lookup work?
    └── Tradeoff: Speed vs. memory savings
```

**Internal Answer Key (example for one leaf):**
```
TLB Mechanism:
  Expected: "When CPU generates a virtual address, hardware first checks 
  TLB (fully-associative or set-associative cache of recent translations). 
  On hit: physical address returned immediately (1 cycle). On miss: must 
  walk page table in memory (multiple memory accesses), then TLB is updated 
  with the new mapping."
  
  Also acceptable: Description that focuses on the hardware parallel lookup 
  or the split TLB (I-TLB / D-TLB) as long as core hit/miss path is clear.
```

---

## Small Tweaks Also Needed (Not the "iteration" but tuning)

- [ ] Model prompt: clarify it's on the student's side (for co-counsel)
- [ ] Internal preprocess step on extracted topics/content for concrete expectations
- [ ] Structured prompt steps: "review the expected rubric/explanation you wrote, check if student's answer is sufficient"
- [ ] Better surface co-counsel interface / make transcript accessible
- [ ] Content scope: uploaded materials define scope (for our demo, provide reasonable study guide)

---

## Relationship to Existing Code

| Current Feature | New Feature | Relationship |
|---|---|---|
| Subtopic Planner (4 noun phrases) | Lesson Plan (hierarchical TOC) | Lesson plan likely *replaces* planner; top-level items become subtopics |
| Study Guide tab (just score bars) | Case File tab (structured completion view) | Case file *replaces* study guide |
| Opposition scoring (ScoringRubric) | Section check-off | Might add `sections_addressed: list[str]` to ExaminerTurn |
| ExaminerTurn.advance | Still needed | Advance when all required sections of current topic are covered |

---

## Next Steps (When Ready to Implement)

1. Workshop the toy example interactively → settle on structure
2. Define Pydantic models for LessonPlan / CaseFileNode / AnswerKey
3. Write the lesson plan generation prompt
4. Add section-tracking to the opposition turn loop
5. Build the case file frontend tab
6. Test with a real study session to see if model checks off sections correctly
7. Iterate on prompt/structure based on testing results
