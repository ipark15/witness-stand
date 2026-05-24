# Oyez — Backend

FastAPI service that powers the courtroom-style academic cross-examination
app. All LLM calls go through a single provider-agnostic interface
(`src/oyez/ai/base.py`); the current implementation is **Gemma 4**
via Google's `google-genai` SDK.

---

## Quick start

```bash
cd backend
cp .env.example .env        # fill in GOOGLE_API_KEY
uv sync                      # creates .venv, installs locked deps
uv run fastapi dev src/oyez/main.py
```

Server listens on `http://localhost:8000` by default. The Vite frontend
(`http://localhost:5173`) is allowed via CORS out of the box.

Sanity check the wiring:

```bash
curl -s localhost:8000/healthz | jq
# {"status": "ok", "version": "0.1.0", "provider": "gemma", "model": "gemma-4-26b-a4b-it"}
```

---

## Environment variables

| Variable           | Required | Default                  | Notes |
|---|---|---|---|
| `LLM_PROVIDER`     | no       | `gemma`                  | Only `gemma` is implemented today. |
| `GOOGLE_API_KEY` *or* `GEMINI_API_KEY` | yes (for gemma) | — | Google AI Studio key. |
| `GEMMA_MODEL`      | no       | `gemma-4-26b-a4b-it`     | Any Gemma 4 model id. |
| `PORT`             | no       | `8000`                   | |
| `DATA_DIR`         | no       | `./data`                 | Session JSON + temp uploads. |

---

## Architecture

```
frontend (Vite :5173)
        │  fetch('/api/sessions/...')   (proxied)
        ▼
FastAPI (:8000)
   ├── /healthz
   ├── /api/sessions             create / get / delete
   ├── /api/sessions/{id}/files  multipart upload → google File API
   ├── /api/sessions/{id}/subtopics    file-grounded planner + opening turn
   ├── /api/sessions/{id}/turns        opposition cross-examination
   └── /api/sessions/{id}/co-counsel   private hint with jury penalty
                  │
                  ▼
           LLM Protocol (src/oyez/ai/base.py)
                  │
                  ▼
           GemmaLLM via google-genai
```

### The `LLM` Protocol

Every route talks to an `LLM` and exchanges ordinary Python values
(strings, `ChatMessage` lists, Pydantic models). Two modalities:

| Method                          | Purpose                                    |
|---|---|
| `text()`                        | single-turn plain completion               |
| `structured()`                  | single-turn JSON validated by a Pydantic schema |
| `with_files()`                  | single-turn multimodal                     |
| `structured_with_files()`       | single-turn multimodal + JSON              |
| `chat()`                        | multi-turn plain completion                |
| `structured_chat()`             | multi-turn JSON                            |
| `structured_chat_with_files()`  | multi-turn JSON grounded on files          |
| `upload_file()`                 | push a local file to the provider          |

Multi-turn methods take `list[ChatMessage]` with `role: 'user' | 'model'`
and let the provider see the actual back-and-forth (and cache the prefix
on its side). The opposition examiner uses these; subtopic planning and
the opening turn use the single-turn methods.

### Roles are endpoint-determined

The old prototype parsed model output to decide whether a message was the
Judge or Counsel. That is gone. Roles are determined by which endpoint
produced the message:

* `/turns` → **opposition counsel** (always)
* `/co-counsel` → **co-counsel** (always)
* Judge transitions are templated strings the backend picks from
  `JUDGE_TRANSITIONS` whenever the opposition's structured response sets
  `advance=true`. No LLM call.

### Prompt layout

Persona instructions are editable text under `backend/prompts/*.md`.
Per-call composition is in `src/oyez/ai/prompts/`. State that's
stable for a session (subject/topic/intensity) lives in the system
instruction; per-turn mutable state (current subtopic, jury favor) is
prepended to the latest user message so the system instruction stays
identical across calls and the prefix stays cacheable.

### Logging

Loguru via `src/oyez/logging_setup.py`. The HTTP middleware
binds a `request_id` (and `session_id` when present in the URL) onto
every log line emitted during a request. LLM calls log model, duration,
and token counts.

---

## File ingestion

`POST /api/sessions/{id}/files` accepts multipart uploads (PDF, DOCX,
images, etc.). Each file is streamed to a temp path, handed to the
provider's File API, and the resulting handle is persisted in the
session. Subsequent calls to subtopics / turns are file-grounded when
valid handles are still attached.

Google's File API expires uploads after ~48h. When a handle expires the
backend prunes it on read and surfaces `files_expired: true` in
`GET /api/sessions/{id}` so the frontend can prompt re-upload.

---

## Adding a new provider

1. Add the SDK to `pyproject.toml` via `uv add`.
2. Create `src/oyez/ai/<name>.py` implementing the `LLM`
   Protocol (eight methods).
3. Wire it into `_build_llm()` in `src/oyez/main.py`.
