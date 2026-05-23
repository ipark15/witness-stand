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
  {
    "id": "<must match request id>",
    "content": "<text response OR JSON string for structured>"
  }
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from witness_stand.ai.base import LLM, ChatMessage, FileRef, LLMError
from witness_stand.logging_setup import logger

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
                    response = json.loads(raw)
                except (json.JSONDecodeError, OSError) as e:
                    logger.warning("file_llm_response_parse_error", error=str(e))
                    continue

                # Validate ID matches
                if response.get("id") != request_id:
                    logger.warning(
                        "file_llm_id_mismatch",
                        expected=request_id,
                        got=response.get("id"),
                    )
                    continue

                # Cleanup
                req_path.unlink(missing_ok=True)
                resp_path.unlink(missing_ok=True)

                content = response.get("content", "")
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
