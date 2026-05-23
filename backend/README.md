# Witness Stand — Backend

Express service that powers the courtroom-style examination app. All AI generation goes through a single provider-agnostic layer, so the underlying LLM (Claude or Gemini/Gemma) can be swapped via a single environment variable — no code changes, no frontend changes.

---

## Quick start

```bash
cd backend
cp .env.example .env        # fill in keys, pick a provider
npm install
npm run dev                  # node --watch server.js
```

On boot you'll see which provider/model is live:

```
Witness Stand backend running on http://localhost:3001 [provider=gemini, model=gemma-4-26b-a4b-it]
```

The frontend (Vite, port 5173) proxies `/api/*` to this server.

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LLM_PROVIDER` | yes | `gemini` | `gemini` (default) or `claude` |
| `GEMINI_API_KEY` | when `LLM_PROVIDER=gemini` | — | Google AI Studio key; works for both Gemini and Gemma models (Gemma is free) |
| `GEMINI_MODEL` | no | `gemma-4-26b-a4b-it` | e.g. `gemma-4-26b-a4b-it`, `gemini-2.5-flash`, `gemini-2.5-pro` |
| `ANTHROPIC_API_KEY` | when `LLM_PROVIDER=claude` | — | Loaded only when Claude is selected |
| `CLAUDE_MODEL` | no | `claude-haiku-4-5` | Any Anthropic chat model id |
| `PORT` | no | `3001` | Server port |

The wrapper **fails fast at boot** if the required key for the selected provider is missing.

---

## Switching providers

Edit `.env` only — restart the server, every AI feature picks up the change.

**Use Gemma 4 26B (default — free, open-weights, slower):**
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemma-4-26b-a4b-it
```

**Use Gemini 2.5 Flash (paid, fast):**
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
```

**Use Claude:**
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

You can also override per-invocation without touching `.env`:

```bash
LLM_PROVIDER=gemini GEMINI_MODEL=gemma-4-26b-a4b-it npm run dev
```

---

## Architecture

```
frontend (Vite, :5173)
        │  fetch('/api/...')
        ▼  (proxied)
server.js (Express, :3001)
   ├── /api/subtopics    ┐
   ├── /api/co-counsel   │── all call generate(prompt)
   └── /api/examine      ┘
                  │
                  ▼
            llm.js
              │
   ┌──────────┴──────────┐
   ▼                     ▼
@anthropic-ai/sdk    @google/genai
   (Claude)          (Gemini / Gemma)
```

### `llm.js` — the provider layer

Exports a single function plus metadata:

```js
import { generate, providerName, modelName } from './llm.js';

const text = await generate(prompt, { maxTokens: 300, temperature: 0.85 });
```

- **Dynamic import** — only the SDK for the selected provider is loaded at runtime. If you only ever run with `LLM_PROVIDER=gemini`, the Anthropic SDK is never touched (and vice versa).
- **Identical signature** for both providers (`prompt → string`), so routes are provider-agnostic.
- **Defaults**: `maxTokens=300`, `temperature=0.85`. Override per call.

### `server.js` — three routes

All three accept JSON POSTs and return JSON.

| Route | Body | Response |
|---|---|---|
| `POST /api/subtopics` | `{ subject, topic }` | `{ subtopics: string[4] }` |
| `POST /api/co-counsel` | `{ subject, topic, currentSubtopic, messageHistory }` | `{ hint: string }` |
| `POST /api/examine` | `{ subject, topic, intensity, messageHistory, currentSubtopic, juryFavor, userMessage }` | `{ role, message, qualityDelta, juryDelta, advanceSubtopic }` |

All prompts are plain-text strings with a single user turn — no provider-specific features (system prompts, tools, streaming). This is what makes the abstraction trivial.

---

## Adding a new provider

1. Add the SDK to `package.json`.
2. In `llm.js`, add a new branch alongside the existing `claude` / `gemini` blocks that:
   - Dynamically imports the SDK
   - Validates its API key from env
   - Assigns `generateFn = async (prompt, { maxTokens, temperature }) => string`
3. Update `.env.example` with the new keys.
4. Done — all three routes work with the new provider automatically.

---

## Notes on Gemma

Gemma models are served through the same `@google/genai` SDK and same `models.generateContent` endpoint as Gemini — no code changes needed beyond setting `GEMINI_MODEL`. Caveats:

- **Latency**: Gemma 4 26B is noticeably slower than `gemini-2.5-flash` (observed ~20s for short prompts in testing). Consider Flash for interactive endpoints if responsiveness matters.
- **Token budget**: Gemma's tokenizer differs from Claude's; if outputs feel truncated, bump `maxTokens` in the relevant `generate()` call.
- **Format compliance**: the `/api/subtopics` route expects a JSON array and the `/api/examine` route expects `[COUNSEL]` / `[JUDGE]` / `[ADVANCE]` tags. Smaller models may follow these conventions less reliably — `server.js` already has regex-based extraction and fallback subtopics to handle that.
