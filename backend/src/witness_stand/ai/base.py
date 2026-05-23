"""Provider-agnostic LLM interface.

Routes never touch a provider SDK directly. They speak to an ``LLM`` and
exchange ordinary Python values (strings, ``ChatMessage`` lists, and
Pydantic models). Adding a new provider means implementing the methods
below — nothing else changes.

Two modalities of completion are supported:

* **Single-turn**: ``text`` / ``structured`` / ``with_files`` /
  ``structured_with_files``. Use these when there is no prior dialogue
  (subtopic planning, opening turns).
* **Multi-turn (chat)**: ``chat`` / ``structured_chat`` /
  ``structured_chat_with_files``. Use these whenever the model needs to
  see prior turns. The history is passed in the provider-native
  ``[{role: 'user'|'model', parts: [...]}, ...]`` shape so prefix /
  KV-caching on the provider side can work, and so the model sees the
  dialogue as a dialogue rather than as a stringified blob.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal, Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel, Field


ChatRole = Literal["user", "model"]


class ChatMessage(BaseModel):
    """One turn in a provider-agnostic multi-turn exchange.

    Roles follow Google's convention because that's our primary provider:
    ``user`` for the human, ``model`` for the assistant's prior outputs.
    Adapters for other providers can rename on the way out.
    """

    role: ChatRole
    content: str


class FileRef(BaseModel):
    """Provider-agnostic handle to a file the model can read.

    Concrete providers stuff a provider-native identifier into ``provider_uri``
    (for Google's File API: ``files/abc123``). ``mime_type`` and metadata are
    captured so we can persist refs in session state and reconstruct them
    later without re-hitting the provider.
    """

    id: str = Field(description="Stable id (uuid) we mint for our own bookkeeping.")
    provider: str = Field(description="Which LLM provider issued this handle.")
    provider_uri: str = Field(description="Provider-native uri, e.g. 'files/abc123'.")
    mime_type: str
    display_name: str
    size_bytes: int
    uploaded_at: datetime
    expires_at: datetime | None = Field(
        default=None,
        description="When the provider will purge this file. None means no known TTL.",
    )


T = TypeVar("T", bound=BaseModel)


@runtime_checkable
class LLM(Protocol):
    """The four completion modalities the app uses.

    All methods are async and never raise provider-specific exceptions —
    implementations are expected to translate provider errors into
    ``LLMError`` (defined below) so callers can handle failures uniformly.
    """

    name: str  # human-friendly provider name, e.g. "gemma"
    model: str  # e.g. "gemma-4-26b-a4b-it"

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
        """Plain text completion — single user turn, returns the model's reply."""
        ...

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
        """JSON-mode completion validated against a Pydantic schema.

        This is how we kill ad-hoc tag parsing: the model returns a typed
        object whose fields are validated by Pydantic before our routes ever
        see them.
        """
        ...

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
        """Multimodal text completion grounded on uploaded files."""
        ...

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
        """Multimodal structured completion — files + schema together."""
        ...

    # ── multi-turn chat ─────────────────────────────────────────────────

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
        """Multi-turn text completion. ``history`` must end with a ``user`` turn."""
        ...

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
        """Multi-turn structured completion."""
        ...

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
        """Multi-turn structured completion grounded on files.

        Files are attached to the FIRST user message in ``history`` (per
        Gemma 4's modality-order guidance) so they remain part of the
        cacheable prefix on subsequent turns.
        """
        ...

    async def upload_file(
        self,
        path: Path,
        *,
        display_name: str,
        mime_type: str | None = None,
    ) -> FileRef:
        """Push a local file to the provider and return a reusable handle."""
        ...


class LLMError(RuntimeError):
    """Provider-agnostic failure. Implementations translate native errors."""

    def __init__(self, message: str, *, provider: str, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.provider = provider
        self.cause = cause
