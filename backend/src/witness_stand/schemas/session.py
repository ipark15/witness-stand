"""Session schemas — persisted state and HTTP DTOs."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, field_validator

from witness_stand.constants import INTENSITIES, Intensity

if TYPE_CHECKING:
    from witness_stand.schemas.examiner import TranscriptMessage  # noqa: F401

from witness_stand.ai.base import FileRef
from witness_stand.schemas.examiner import TranscriptMessage
from witness_stand.schemas.files import FileRefDTO


def _new_session_id() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SessionCreate(BaseModel):
    """POST /api/sessions body."""

    subject: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=200)
    intensity: Intensity

    @field_validator("intensity")
    @classmethod
    def _check_intensity(cls, v: str) -> str:
        if v not in INTENSITIES:
            raise ValueError(f"intensity must be one of {INTENSITIES}")
        return v


class SubtopicProgress(BaseModel):
    """Per-subtopic running score."""

    name: str
    quality: int = Field(default=50, ge=0, le=100)


class Session(BaseModel):
    """Authoritative persisted session state.

    This is the on-disk shape. The wire-facing projection is ``SessionState``
    below, which drops provider-internal URIs.
    """

    id: str = Field(default_factory=_new_session_id)
    subject: str
    topic: str
    intensity: Intensity

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    subtopics: list[SubtopicProgress] = Field(default_factory=list)
    current_subtopic_index: int = 0

    jury_favor: int = Field(default=50, ge=0, le=100)

    transcript: list[TranscriptMessage] = Field(default_factory=list)
    files: list[FileRef] = Field(default_factory=list)

    complete: bool = False
    verdict: str | None = None  # "Acquitted" | "Hung Jury" | "Guilty" once complete

    # ── derived ──────────────────────────────────────────────────────────

    @property
    def current_subtopic(self) -> str:
        if not self.subtopics:
            return self.topic
        idx = min(self.current_subtopic_index, len(self.subtopics) - 1)
        return self.subtopics[idx].name


class SessionState(BaseModel):
    """Wire-facing projection of a session."""

    id: str
    subject: str
    topic: str
    intensity: Intensity
    created_at: datetime
    updated_at: datetime
    subtopics: list[SubtopicProgress]
    current_subtopic_index: int
    jury_favor: int
    transcript: list[TranscriptMessage]
    files: list[FileRefDTO]
    complete: bool
    verdict: str | None
    files_expired: bool = Field(
        default=False,
        description=(
            "True if one or more attached files have passed the provider's "
            "TTL and need to be re-uploaded before the next file-grounded call."
        ),
    )

    @classmethod
    def from_session(cls, session: Session, *, files_expired: bool = False) -> "SessionState":
        return cls(
            id=session.id,
            subject=session.subject,
            topic=session.topic,
            intensity=session.intensity,
            created_at=session.created_at,
            updated_at=session.updated_at,
            subtopics=session.subtopics,
            current_subtopic_index=session.current_subtopic_index,
            jury_favor=session.jury_favor,
            transcript=session.transcript,
            files=[
                FileRefDTO(
                    id=f.id,
                    display_name=f.display_name,
                    mime_type=f.mime_type,
                    size_bytes=f.size_bytes,
                    uploaded_at=f.uploaded_at,
                    expires_at=f.expires_at,
                )
                for f in session.files
            ],
            complete=session.complete,
            verdict=session.verdict,
            files_expired=files_expired,
        )
