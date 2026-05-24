# Oyez — User Study Guide

This guide explains how to run a user study session using **pre-constructed
lesson plans** instead of the built-in Gemma AI generation. This lets you
control the case file content, avoid API token costs, and eliminate quality
variance from Gemma's structured output.

---

## Overview

There are **two ways** to load a custom lesson plan:

| Method | Best for | Requires |
|--------|----------|----------|
| **UI toggle** (recommended) | Facilitators running sessions live | Browser only |
| **Fixture files + env var** | Pre-staged demos, automated testing | File system + restart |

Both methods bypass the LLM generation step entirely and load the case file
directly.

---

## Option A: UI Toggle (Recommended)

1. **Generate a lesson plan with ChatGPT** (see [Generating with ChatGPT](#generating-a-lesson-plan-with-chatgpt) below).
2. Open Oyez in your browser and go to the Setup page.
3. In the right column, click **User Study Mode** to toggle it ON.
4. Paste the JSON into the textarea that appears.
5. The validator will show "Valid JSON" if the format is correct.
6. Fill in Subject, Topic, and Intensity as usual, then click **Call to Order**.

The custom lesson plan is loaded immediately when the session starts — no
LLM call is made.

---

## Option B: Fixture Files + Env Var

1. Generate a lesson plan JSON (see below).
2. Save it to `backend/fixtures/lesson_plans/<subject>-<topic>.json`
   - Filename is `<subject>-<topic>` lowercased, spaces replaced with dashes.
   - Example: subject "Operating Systems", topic "Paging" → `operating-systems-paging.json`
3. Set the environment variable before starting the backend:
   ```bash
   USE_FIXTURE_LESSON_PLAN=true
   ```
   Or add it to `backend/.env`:
   ```
   USE_FIXTURE_LESSON_PLAN=true
   ```
4. Start the backend normally. When a session matches the fixture filename,
   it loads from the file instead of calling the LLM.

---

## Generating a Lesson Plan with ChatGPT

### Step 1: Copy the prompt

Paste the following into ChatGPT (or Claude, or any chat LLM):

> **Prompt to paste:**

```
You are a curriculum architect constructing a structured "case file" for an
oral examination. Given a subject, topic, and optionally the student's own
course materials, produce a hierarchical breakdown of what the student must
be able to explain.

Design principles:
  * Each leaf node is one discrete claim the student should produce.
  * Use the category labels to signal WHAT KIND of understanding is needed:
    motivation (why?), definition (what is it?), mechanism (how does it
    work?), example (concrete walkthrough), tradeoff (cost/alternative),
    distinction (how is X different from Y?).
  * The prompt_hint frames what the student should explain WITHOUT revealing
    the answer.
  * The answer_key is your internal expectation — concise, one paragraph,
    noting acceptable alternatives where relevant.
  * Keep depth reasonable: 3–6 top-level matters, 2–5 nodes per matter.

I need a lesson plan for:
- Subject: [YOUR SUBJECT HERE]
- Topic: [YOUR TOPIC HERE]

Return ONLY valid JSON matching this exact schema (no markdown, no code fences):

{
  "topic": "string — the topic name",
  "matters": [
    {
      "label": "string — short heading (4-8 words)",
      "nodes": [
        {
          "label": "string — short label for this node",
          "category": "one of: motivation, definition, mechanism, example, tradeoff, distinction",
          "prompt_hint": "string — question framing what the student should explain (no spoilers)",
          "answer_key": "string — the expected explanation, one concise paragraph. Also note acceptable alternatives."
        }
      ]
    }
  ],
  "rationale": "string — one sentence explaining this breakdown"
}

Aim for 3-6 top-level matters with 2-5 nodes each.
```

### Step 2: Replace the placeholders

Change `[YOUR SUBJECT HERE]` and `[YOUR TOPIC HERE]` to match your study
session. For example:

- Subject: `Computer Science`
- Topic: `Binary Search Trees`

### Step 3: Copy the JSON output

ChatGPT will return a JSON object. Copy the entire JSON (without any
markdown code fences ChatGPT may add around it).

### Step 4: Load it

- **UI toggle:** Paste into the User Study Mode textarea on the Setup page.
- **Fixture file:** Save to `backend/fixtures/lesson_plans/<subject>-<topic>.json`.

---

## JSON Schema Reference

```json
{
  "topic": "Paging",
  "matters": [
    {
      "label": "What Is Paging and Why Does It Exist?",
      "nodes": [
        {
          "label": "Motivation for Paging",
          "category": "motivation",
          "prompt_hint": "Why is paging used in modern operating systems instead of simple contiguous memory allocation?",
          "answer_key": "Paging solves the problem of external fragmentation by allowing a process's physical memory to be non-contiguous. Also acceptable: Mentioning that it simplifies the allocation of memory."
        },
        {
          "label": "Core Definitions",
          "category": "definition",
          "prompt_hint": "Define 'page' and 'frame' and explain the relationship between them.",
          "answer_key": "A page is a fixed-size block of virtual address space. A frame is a fixed-size block of physical memory. A page is mapped to a frame during translation."
        }
      ]
    }
  ],
  "rationale": "Breaks paging into conceptual layers matching typical OS coursework."
}
```

### Valid categories

| Category | What it tests |
|----------|---------------|
| `motivation` | Why does this exist? What problem does it solve? |
| `definition` | What IS it? (abstraction, not just the name) |
| `mechanism` | HOW does it work? (the load-bearing dimension) |
| `example` | Concrete instance / walkthrough |
| `tradeoff` | What's the cost? What's the alternative? |
| `distinction` | How is this different from X? |

---

## Existing Fixtures

The repo ships with a sample fixture you can use as-is or as a reference:

- `backend/fixtures/lesson_plans/operating-systems-paging.json` — Operating
  Systems / Paging (5 matters, 15 nodes, answer keys included)

---

## Tips for User Studies

- **Pre-generate 2-3 lesson plans** for different topics before the study
  session so participants can choose.
- **Test the JSON** before the study by pasting it in the UI toggle — it
  validates instantly.
- The **answer keys** in the lesson plan are used by the AI examiner to
  evaluate student responses. Better answer keys = more accurate evaluation.
- The Subject and Topic fields on the Setup page are still used for
  the examination prompts, so make sure they match your lesson plan content.
- The lesson plan's `topic` field should also match what you enter in the
  Topic input.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Invalid JSON" in textarea | Remove markdown code fences (` ```json ... ``` `) from ChatGPT output |
| "Failed to load custom lesson plan" | Check that the JSON matches the schema — all 4 node fields are required |
| Fixture not loading (env var method) | Ensure `USE_FIXTURE_LESSON_PLAN=true` is set and the filename matches `<subject>-<topic>.json` exactly |
| Lesson plan shows but examiner is generic | Make sure Subject/Topic on the Setup page match the lesson plan content |
