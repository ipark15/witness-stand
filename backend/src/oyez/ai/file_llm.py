"""File-based LLM provider for manual/agent-driven responses.

Instead of calling an LLM API, this provider writes requests to a JSON file
and polls for a response file. This allows an external operator (e.g., Devin
or a human) to read the request, compose a response, and write it back — all
without burning API tokens.

Protocol:
  1. Provider writes ``data/llm_request_{id}.json`` with the full context.
  2. Provider polls for ``data/llm_response_{id}.json`` (checks every 1s).
  3. When response file appears, provider reads it, validates, and returns.
  4. Both files are cleaned up after each exchange.

Each exchange uses unique ID-scoped file paths so concurrent requests
don't interfere with each other.

Request format (llm_request_{id}.json):
  {
    "id": "<short uuid>",
    "method": "text" | "structured" | "chat" | "structured_chat" | ...,
    "system": "<system prompt or null>",
    "prompt": "<user prompt for single-turn>",
    "history": [{"role": "user"|"model", "content": "..."}],
    "schema": "<JSON schema description if structured>",
    "schema_name": "<Pydantic model class name>",
    "files": [{"display_name": "...", "mime_type": "..."}]
  }

Response format (llm_response_{id}.json):
  The response file is whatever you want the LLM to "say". The provider
  accepts three shapes, in this order of preference:

    1. Wrapped:   {"content": "<text or stringified JSON>", "id": "..."}
                  Original format. ``id`` is optional (filename already
                  scopes the exchange) but if present must match.
    2. Structured raw:  {"some_key": "...", ...}
                  Any other JSON object — the file body IS the structured
                  response. Useful for ``structured_chat`` calls where
                  you'd otherwise have to JSON-encode-as-a-string-inside-
                  a-JSON-object. Just write the schema-conforming object.
    3. Plain text:  Anything that isn't JSON.
                  The file body IS the textual response. Useful for
                  ``chat``/``text`` calls where escaping quotes and
                  newlines in a JSON wrapper is tedious.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from oyez.ai.base import LLM, ChatMessage, FileRef, LLMError
from oyez.logging_setup import logger

T = TypeVar("T", bound=BaseModel)

_PROVIDER_NAME = "file"
_POLL_INTERVAL_S = 1.0
_TIMEOUT_S = 600  # 10 minutes max wait


class FileLLM:
    """LLM implementation backed by file-based request/response exchange."""

    name: str = _PROVIDER_NAME

    def __init__(self, *, data_dir: Path) -> None:
        self.model = "file-llm-manual"
        self._data_dir = data_dir
        self._data_dir.mkdir(parents=True, exist_ok=True)

    def _request_path(self, request_id: str) -> Path:
        return self._data_dir / f"llm_request_{request_id}.json"

    def _response_path(self, request_id: str) -> Path:
        return self._data_dir / f"llm_response_{request_id}.json"

    async def _exchange(self, request: dict) -> str:
        """Write request, poll for response, return content string."""
        request_id = str(uuid.uuid4())[:8]
        request["id"] = request_id

        req_path = self._request_path(request_id)
        resp_path = self._response_path(request_id)

        # Clean up any stale response for this ID
        resp_path.unlink(missing_ok=True)

        # Write request
        req_path.write_text(json.dumps(request, indent=2), encoding="utf-8")
        logger.info(
            "file_llm_request_written",
            request_id=request_id,
            method=request.get("method"),
            path=str(req_path),
        )

        # Poll for response
        elapsed = 0.0
        while elapsed < _TIMEOUT_S:
            await asyncio.sleep(_POLL_INTERVAL_S)
            elapsed += _POLL_INTERVAL_S

            if resp_path.exists():
                try:
                    raw = resp_path.read_text(encoding="utf-8")
                except OSError as e:
                    logger.warning("file_llm_response_read_error", error=str(e))
                    continue

                # Resolve the content. Three shapes are accepted (see the
                # module docstring): wrapped {"content": ...}, a raw
                # structured object, or plain text. We prefer the wrapper
                # when present because it lets callers smuggle the id
                # safety check, but everything else falls back to the
                # file body verbatim so manual workflows aren't forced
                # to JSON-escape their text.
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None

                if isinstance(parsed, dict) and "content" in parsed:
                    inner_id = parsed.get("id")
                    if inner_id is not None and inner_id != request_id:
                        # Stale response from a different exchange leaked
                        # into this path — wait for the real one.
                        logger.warning(
                            "file_llm_id_mismatch",
                            expected=request_id,
                            got=inner_id,
                        )
                        continue
                    content = parsed["content"]
                    # Tolerate one accidental round of double-wrapping
                    # (a common copy-paste mistake): if the unwrapped
                    # content is itself a wrapper, peel once and log.
                    if isinstance(content, str):
                        try:
                            inner = json.loads(content)
                        except (json.JSONDecodeError, TypeError):
                            inner = None
                        if isinstance(inner, dict) and "content" in inner and isinstance(inner["content"], str):
                            logger.warning(
                                "file_llm_double_wrap_unwrapped",
                                request_id=request_id,
                            )
                            content = inner["content"]
                else:
                    # No wrapper — file body IS the response. Either a
                    # raw structured object (downstream _parse will load
                    # it again) or plain text. Strip trailing whitespace
                    # so a final newline doesn't break strict JSON
                    # consumers.
                    content = raw.strip()

                # Cleanup
                req_path.unlink(missing_ok=True)
                resp_path.unlink(missing_ok=True)

                logger.info(
                    "file_llm_response_received",
                    request_id=request_id,
                    content_length=len(content),
                )
                return content

        # Timeout
        req_path.unlink(missing_ok=True)
        raise LLMError(
            f"FileLLM timed out after {_TIMEOUT_S}s waiting for response.",
            provider=_PROVIDER_NAME,
        )

    def _schema_info(self, schema: type[BaseModel]) -> dict:
        """Extract schema info for the request file."""
        return {
            "schema_name": schema.__name__,
            "schema": json.loads(schema.model_json_schema().__class__.__mro__[0].__name__)
            if False
            else schema.model_json_schema(),
        }

    # ── Single-turn methods ──────────────────────────────────────────────

    async def text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return await self._exchange({
            "method": "text",
            "system": system,
            "prompt": prompt,
        })

    async def structured(
        self,
        prompt: str,
        *,
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        request = {
            "method": "structured",
            "system": system,
            "prompt": prompt,
            **self._schema_info(schema),
        }
        raw = await self._exchange(request)
        return self._parse(raw, schema)

    async def with_files(
        self,
        prompt: str,
        *,
        files: list[FileRef],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return await self._exchange({
            "method": "with_files",
            "system": system,
            "prompt": prompt,
            "files": [{"display_name": f.display_name, "mime_type": f.mime_type} for f in files],
        })

    async def structured_with_files(
        self,
        prompt: str,
        *,
        files: list[FileRef],
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        request = {
            "method": "structured_with_files",
            "system": system,
            "prompt": prompt,
            "files": [{"display_name": f.display_name, "mime_type": f.mime_type} for f in files],
            **self._schema_info(schema),
        }
        raw = await self._exchange(request)
        return self._parse(raw, schema)

    # ── Multi-turn chat methods ──────────────────────────────────────────

    async def chat(
        self,
        history: list[ChatMessage],
        *,
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return await self._exchange({
            "method": "chat",
            "system": system,
            "history": [{"role": m.role, "content": m.content} for m in history],
        })

    async def structured_chat(
        self,
        history: list[ChatMessage],
        *,
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        request = {
            "method": "structured_chat",
            "system": system,
            "history": [{"role": m.role, "content": m.content} for m in history],
            **self._schema_info(schema),
        }
        raw = await self._exchange(request)
        return self._parse(raw, schema)

    async def structured_chat_with_files(
        self,
        history: list[ChatMessage],
        *,
        files: list[FileRef],
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        request = {
            "method": "structured_chat_with_files",
            "system": system,
            "history": [{"role": m.role, "content": m.content} for m in history],
            "files": [{"display_name": f.display_name, "mime_type": f.mime_type} for f in files],
            **self._schema_info(schema),
        }
        raw = await self._exchange(request)
        return self._parse(raw, schema)

    async def upload_file(
        self,
        path: Path,
        *,
        display_name: str,
        mime_type: str | None = None,
    ) -> FileRef:
        """For file provider, just create a local ref (files aren't uploaded anywhere)."""
        return FileRef(
            id=str(uuid.uuid4()),
            provider=_PROVIDER_NAME,
            provider_uri=str(path),
            mime_type=mime_type or "application/octet-stream",
            display_name=display_name,
            size_bytes=path.stat().st_size if path.exists() else 0,
            uploaded_at=datetime.now(timezone.utc),
            expires_at=None,
        )

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _parse(raw: str, schema: type[T]) -> T:
        """Parse raw text as JSON and validate against schema."""
        # Strip markdown fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:]  # drop opening fence
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)

        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError(
                f"FileLLM response is not valid JSON: {e}",
                provider=_PROVIDER_NAME,
            ) from e

        try:
            return schema.model_validate(data)
        except ValidationError as e:
            raise LLMError(
                f"FileLLM response doesn't match schema {schema.__name__}: {e}",
                provider=_PROVIDER_NAME,
            ) from e
