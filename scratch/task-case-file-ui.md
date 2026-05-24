# Task: Case File UI — Visual Representation

## Context

The case file is the core **design representation** for the HCI class project. It replaces the old tacked-on "Study Guide" tab with a structured artifact that:
1. **During examination** — makes gaps visible (what *kind* of explanation is missing) without spoiling answers
2. **After examination** — serves as a completed study guide showing what was demonstrated

The representation reframes "I don't know what I'm missing" → "I can see exactly which *type* of gap I have."

## UX Design

### Where It Lives

Replace the current "Study Guide" toggle in the Examination page header with "Case File" (court theming). Same toggle pattern: `examination | casefile` views.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  THE WITNESS STAND │ Trial Examination │ OS: Paging          │
│                                     [Examination] [Case File]│
├─── Subtopic Progress Bar ────────────────────────────────────┤
│ Sidebar │                                                    │
│         │  CASE FILE — Paging                                │
│ (same)  │                                                    │
│         │  ┌─ 1. Fundamentals and Motivation ──── ●●○ ────┐ │
│         │  │  [motivation] Motivation for Paging    ✓      │ │
│         │  │  [distinction] Paging vs. Segmentation ◐      │ │
│         │  │  [definition] Core Definitions         ○      │ │
│         │  └───────────────────────────────────────────────┘ │
│         │                                                    │
│         │  ┌─ 2. Address Translation ──────── ○○○ ────────┐ │
│         │  │  [mechanism] The Translation Process   ○      │ │
│         │  │  [example] Translation Walkthrough      ○      │ │
│         │  │  [mechanism] Role of the Offset         ○      │ │
│         │  └───────────────────────────────────────────────┘ │
│         │                                                    │
│         │  ── Evaluation Feedback ──                         │
│         │  "You've explained what pages are, but haven't     │
│         │   addressed how the system locates the right       │
│         │   frame — think about the lookup step."            │
│         │                                                    │
└─────────┴────────────────────────────────────────────────────┘
```

### Node Status Indicators

- `○` **pending** (gray) — not yet addressed
- `◐` **partial** (amber/gold) — mentioned but incomplete  
- `✓` **covered** (green) — sufficiently explained

### Category Badges

Each leaf node shows its category as a small colored badge:
- `motivation` — blue
- `definition` — purple
- `mechanism` — navy
- `example` — amber
- `tradeoff` — crimson
- `distinction` — teal

### Matter Cards

Each matter is a collapsible card:
- Header shows matter label + summary dots (filled/half/empty per node status)
- **Current matter** (matching `currentSubtopicIndex`) is expanded by default and highlighted
- **Completed matters** show a subtle green border
- **Future matters** are collapsed and slightly muted

### Prompt Hints

Each leaf node shows its `prompt_hint` as small italic text below the label. This is the guiding question the student should try to answer.

### Evaluation Feedback Banner

At the bottom of the case file (or below the current matter), show the latest `evaluation_feedback` from the turn response. This is the constructive guidance about remaining gaps.

### Data Flow

1. **On session init**: After subtopics load, call `GET /api/sessions/{id}/lesson-plan` to fetch the case file structure
2. **On each turn response**: The `section_updates` and `evaluation_feedback` fields update the local case file state
3. **Store state**: Add `caseFile` (the hierarchical structure) and `evaluationFeedback` (latest feedback string) to the Zustand store

### Implementation Plan

1. Add `caseFile` and `evaluationFeedback` to sessionStore
2. Create `CaseFileView.jsx` component in `components/examination/`
3. Fetch lesson plan on mount (or after subtopics load)
4. Apply `section_updates` from turn responses to update node statuses
5. Wire the view toggle to show CaseFileView instead of StudyGuideView
6. Style with existing Tailwind classes + court theming

## Files to Create/Modify

- **NEW**: `frontend/src/components/examination/CaseFileView.jsx`
- **MODIFY**: `frontend/src/store/sessionStore.js` — add caseFile state + actions
- **MODIFY**: `frontend/src/pages/Examination.jsx` — fetch lesson plan, apply updates, wire toggle
- **DELETE/REPLACE**: `StudyGuideView.jsx` is superseded (keep for now, swap in toggle)
