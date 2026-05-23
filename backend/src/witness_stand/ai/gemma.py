"""Google Gemma (via the ``google-genai`` SDK) implementation of ``LLM``.

Notes that drove the design here:

* Gemma 4 supports native system instructions via ``GenerateContentConfig``.
* Gemma 4 supports ``response_mime_type='application/json'`` together with
  ``response_schema=<PydanticModel>`` — the SDK returns a typed instance on
  ``response.parsed``. We always validate ourselves as a belt-and-braces
  guard against the parsed field being unset on edge cases.
* Per the Gemma 4 model card, recommended sampling is
  ``temperature=1.0, top_p=0.95, top_k=64``.
* Per the Gemma 4 best practices, multimodal content is placed BEFORE text
  in the ``contents`` list.
* Thinking mode is left disabled (no ``<|think|>`` token in the system
  prompt) for latency on interactive turn endpoints.
"""
from __future__ import annotations

import json
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import TypeVar

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from witness_stand.ai.base import LLM, ChatMessage, FileRef, LLMError
from witness_stand.constants import (
    DEFAULT_MAX_OUTPUT_TOKENS,
    DEFAULT_TEMPERATURE,
    DEFAULT_TOP_K,
    DEFAULT_TOP_P,
)
from witness_stand.logging_setup import logger

T = TypeVar("T", bound=BaseModel)

_PROVIDER_NAME = "gemma"


class GemmaLLM(LLM):
    """LLM implementation backed by Google's Gemma 4 family."""

    name: str = _PROVIDER_NAME

    def __init__(self, *, api_key: str | None, model: str) -> None:
        if not api_key:
            raise LLMError(
                "Gemma backend requires GOOGLE_API_KEY (or GEMINI_API_KEY).",
                provider=_PROVIDER_NAME,
            )
        self.model = model
        # The Client picks up GOOGLE_API_KEY/GEMINI_API_KEY from env when no
        # api_key is passed, but we pass it explicitly so misconfiguration
        # surfaces here at construction time.
        self._client = genai.Client(api_key=api_key)

    # ── public API ───────────────────────────────────────────────────────

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
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        response = await self._generate(contents=[prompt], config=config)
        return _response_text(response)

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
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
            response_schema=schema,
        )
        response = await self._generate(contents=[prompt], config=config)
        return _parse_structured(response, schema)

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
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        contents = _build_multimodal_contents(files, prompt)
        response = await self._generate(contents=contents, config=config)
        return _response_text(response)

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
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
            response_schema=schema,
        )
        contents = _build_multimodal_contents(files, prompt)
        response = await self._generate(contents=contents, config=config)
        return _parse_structured(response, schema)

    # ── multi-turn chat completions ──────────────────────────────────────

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
        _validate_history(history)
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        response = await self._generate(
            contents=_history_to_contents(history),
            config=config,
        )
        return _response_text(response)

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
        _validate_history(history)
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
            response_schema=schema,
        )
        response = await self._generate(
            contents=_history_to_contents(history),
            config=config,
        )
        return _parse_structured(response, schema)

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
        _validate_history(history)
        config = self._build_config(
            system=system,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
            response_schema=schema,
        )
        response = await self._generate(
            contents=_history_to_contents(history, files=files),
            config=config,
        )
        return _parse_structured(response, schema)

    async def upload_file(
        self,
        path: Path,
        *,
        display_name: str,
        mime_type: str | None = None,
    ) -> FileRef:
        guessed_mime = mime_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        bound = logger.bind(
            llm_provider=_PROVIDER_NAME,
            display_name=display_name,
            mime_type=guessed_mime,
            size_bytes=path.stat().st_size if path.exists() else None,
        )
        start = perf_counter()
        try:
            uploaded = await self._client.aio.files.upload(
                file=str(path),
                config=types.UploadFileConfig(
                    display_name=display_name,
                    mime_type=guessed_mime,
                ),
            )
        except genai_errors.APIError as exc:  # pragma: no cover — surfaces upstream
            bound.bind(error=str(exc)).error("llm_file_upload_error")
            raise LLMError(
                f"File upload failed: {exc}",
                provider=_PROVIDER_NAME,
                cause=exc,
            ) from exc

        duration_ms = (perf_counter() - start) * 1000.0
        bound.bind(
            duration_ms=round(duration_ms, 2),
            provider_uri=uploaded.uri,
        ).info("llm_file_upload_ok")

        # The SDK populates the File with server-assigned name, uri, mime,
        # size, and expiration timestamps.
        uri = uploaded.uri or f"files/{uploaded.name}" if uploaded.name else None
        if not uri:
            raise LLMError(
                "Upload succeeded but provider returned no usable URI.",
                provider=_PROVIDER_NAME,
            )

        size_bytes = int(uploaded.size_bytes) if uploaded.size_bytes is not None else path.stat().st_size
        expires_at: datetime | None = uploaded.expiration_time

        return FileRef(
            id=str(uuid.uuid4()),
            provider=_PROVIDER_NAME,
            provider_uri=uri,
            mime_type=uploaded.mime_type or guessed_mime,
            display_name=display_name,
            size_bytes=size_bytes,
            uploaded_at=datetime.now(timezone.utc),
            expires_at=expires_at,
        )

    # ── internals ────────────────────────────────────────────────────────

    async def _generate(
        self,
        *,
        contents: list[object],
        config: types.GenerateContentConfig,
    ) -> types.GenerateContentResponse:
        bound = logger.bind(
            llm_provider=_PROVIDER_NAME,
            llm_model=self.model,
            structured=config.response_schema is not None,
            content_parts=len(contents),
        )
        bound.debug("llm_call_start")
        start = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=self.model,
                contents=contents,  # type: ignore[arg-type]
                config=config,
            )
        except genai_errors.APIError as exc:
            duration_ms = (perf_counter() - start) * 1000.0
            bound.bind(duration_ms=round(duration_ms, 2), error=str(exc)).error(
                "llm_call_error"
            )
            raise LLMError(
                f"Gemma generation failed: {exc}",
                provider=_PROVIDER_NAME,
                cause=exc,
            ) from exc

        duration_ms = (perf_counter() - start) * 1000.0
        usage = getattr(response, "usage_metadata", None)
        bound.bind(
            duration_ms=round(duration_ms, 2),
            prompt_tokens=getattr(usage, "prompt_token_count", None) if usage else None,
            output_tokens=getattr(usage, "candidates_token_count", None) if usage else None,
        ).info("llm_call_ok")
        return response

    def _build_config(
        self,
        *,
        system: str | None,
        temperature: float | None,
        top_p: float | None,
        top_k: int | None,
        max_tokens: int | None,
        response_schema: type[BaseModel] | None = None,
    ) -> types.GenerateContentConfig:
        kwargs: dict[str, object] = {
            "temperature": temperature if temperature is not None else DEFAULT_TEMPERATURE,
            "top_p": top_p if top_p is not None else DEFAULT_TOP_P,
            "top_k": top_k if top_k is not None else DEFAULT_TOP_K,
            "max_output_tokens": (
                max_tokens if max_tokens is not None else DEFAULT_MAX_OUTPUT_TOKENS
            ),
        }
        # NOTE: We intentionally avoid using response_schema with the API's
        # constrained decoding — it hangs indefinitely with Gemma 26B on the
        # free tier. Instead we request JSON via the system prompt and parse
        # the text response ourselves (see _parse_structured).
        json_schema_instruction = ""
        if response_schema is not None:
            kwargs["response_mime_type"] = "application/json"
            schema_json = json.dumps(
                response_schema.model_json_schema(), indent=2
            )
            json_schema_instruction = (
                f"\n\nYou MUST respond with valid JSON conforming to this schema:\n"
                f"```json\n{schema_json}\n```\n"
                "Output ONLY the JSON object. No markdown fences, no extra text."
            )
        if system or json_schema_instruction:
            kwargs["system_instruction"] = (system or "") + json_schema_instruction
        return types.GenerateContentConfig(**kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers (free functions so they're trivially testable)
# ─────────────────────────────────────────────────────────────────────────────


def _build_multimodal_contents(files: list[FileRef], prompt: str) -> list[object]:
    """Construct the ``contents`` list with files BEFORE text per Gemma 4 guidance."""
    parts: list[object] = [
        types.Part.from_uri(file_uri=f.provider_uri, mime_type=f.mime_type)
        for f in files
    ]
    parts.append(prompt)
    return parts


def _validate_history(history: list[ChatMessage]) -> None:
    """Cheap structural checks before we send to the provider."""
    if not history:
        raise LLMError(
            "Chat history cannot be empty.",
            provider=_PROVIDER_NAME,
        )
    if history[-1].role != "user":
        raise LLMError(
            "Chat history must end with a user turn.",
            provider=_PROVIDER_NAME,
        )


def _history_to_contents(
    history: list[ChatMessage],
    *,
    files: list[FileRef] | None = None,
) -> list[types.Content]:
    """Translate ``ChatMessage`` list into the SDK's ``Content`` shape.

    When ``files`` is non-empty, they are attached to the FIRST user turn's
    parts (per Gemma 4 modality-order guidance: files BEFORE text). This
    keeps the file parts inside the cacheable prefix.
    """
    file_parts: list[types.Part] = [
        types.Part.from_uri(file_uri=f.provider_uri, mime_type=f.mime_type)
        for f in (files or [])
    ]
    contents: list[types.Content] = []
    file_parts_attached = False

    for msg in history:
        parts: list[types.Part] = []
        if (
            not file_parts_attached
            and file_parts
            and msg.role == "user"
        ):
            parts.extend(file_parts)
            file_parts_attached = True
        parts.append(types.Part.from_text(text=msg.content))
        contents.append(types.Content(role=msg.role, parts=parts))

    return contents


def _response_text(response: types.GenerateContentResponse) -> str:
    """Extract the text payload from a generation response."""
    text = response.text
    if text is None:
        raise LLMError(
            "Model returned no text payload.",
            provider=_PROVIDER_NAME,
        )
    return text.strip()


def _parse_structured(
    response: types.GenerateContentResponse,
    schema: type[T],
) -> T:
    """Prefer the SDK's parsed object; fall back to manual JSON parsing.

    The SDK populates ``response.parsed`` when ``response_schema`` is a
    Pydantic class. In rare edge cases (e.g. partial responses, schema
    validation glitches) it can be unset; we then fall back to parsing
    ``response.text`` ourselves so callers get a clean error in one spot.
    """
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, schema):
        return parsed
    if isinstance(parsed, dict):
        try:
            return schema.model_validate(parsed)
        except ValidationError as exc:
            raise LLMError(
                f"Structured response failed validation: {exc}",
                provider=_PROVIDER_NAME,
                cause=exc,
            ) from exc

    raw = response.text
    if not raw:
        raise LLMError(
            "Structured response was empty.",
            provider=_PROVIDER_NAME,
        )
    # Strip markdown fences if present
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMError(
            f"Structured response was not valid JSON: {exc}",
            provider=_PROVIDER_NAME,
            cause=exc,
        ) from exc
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        raise LLMError(
            f"Structured response failed validation: {exc}",
            provider=_PROVIDER_NAME,
            cause=exc,
        ) from exc
