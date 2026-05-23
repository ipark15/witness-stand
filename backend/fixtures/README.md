# Lesson Plan Fixtures

Pre-generated lesson plans for demo/user-study use. These bypass the
generation API call entirely — useful for saving tokens and avoiding
Gemma's structured output quirks.

## Quick Start (User Study)

1. **Use existing fixtures** — `lesson_plans/os-paging.json` has a full
   Paging case file (5 matters, 15 nodes, answer keys included).

2. **Generate new ones** — Copy the system prompt from
   `prompts/lesson_plan_system.md`, paste into any chat LLM (ChatGPT,
   Claude, etc.), and ask it to generate a lesson plan for your topic.
   Save the JSON output here as `<subject>-<topic>.json`.

   The JSON must match the `LessonPlanGeneration` schema:
   ```json
   {
     "topic": "Paging",
     "matters": [
       {
         "label": "Matter Name",
         "nodes": [
           {
             "label": "Node Name",
             "category": "mechanism",
             "prompt_hint": "Question for student...",
             "answer_key": "Expected answer... Also acceptable: ... Not required: ..."
           }
         ]
       }
     ],
     "rationale": "Why this breakdown."
   }
   ```

   Valid categories: `motivation`, `definition`, `mechanism`, `example`,
   `tradeoff`, `distinction`.

3. **Load in the app** — Set `USE_FIXTURE_LESSON_PLAN=true` in your
   `.env` and the backend will load from fixtures instead of calling the
   LLM. The fixture file is selected by matching `<subject>-<topic>.json`
   (lowercased, spaces→dashes).

## Files

- `lesson_plans/os-paging.json` — Operating Systems / Paging (5 matters, 15 nodes)
- `lesson_plans/os-topics.json` — Topic extraction result for Operating Systems

## Generating with the Test Script

```bash
cd /path/to/witness-stand
GOOGLE_API_KEY=... python scratch/test_lesson_plan.py
# Outputs saved to scratch/test-output-*.json
```

**Note:** Gemma 4 has a known bug with constrained decoding
(google-deepmind/gemma#622). The test script uses the workaround:
`response_mime_type: "application/json"` + schema injected into the
system prompt, NOT `response_schema`.
