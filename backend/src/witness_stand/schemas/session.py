"""Session schemas — persisted state and HTTP DTOs."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, field_validator, model_validator

from witness_stand.ai.base import ChatMessage
from witness_stand.constants import INTENSITIES, Intensity

if TYPE_CHECKING:
    from witness_stand.schemas.examiner import TranscriptMessage  # noqa: F401

from witness_stand.ai.base import FileRef
from witness_stand.schemas.examiner import TranscriptMessage
from witness_stand.schemas.files import FileRefDTO
from witness_stand.schemas.lesson_plan import LessonPlan

# ─────────────────────────────────────────────────────────────────────────────
# chat_log content shaping — single source of truth for what gets persisted
# into the unified LLM-facing chat. Per the unified-chat-log task doc:
#  * Defense's testimony → user turn (with state header prepended once at
#    write time, then frozen forever).
#  * Opposition's reply → model turn with "[Opposing Counsel] " prefix.
#  * Co-counsel's aside → model turn with "[Co-Counsel] " prefix.
#  * Co-counsel trigger  → stable content-free user turn so the alternation
#    is legal and the consultation is visible to subsequent readers.
#  * Judge transitions  → omitted (app-level scene direction).
# ─────────────────────────────────────────────────────────────────────────────

OPPOSITION_PREFIX = "[Opposing Counsel] "
CO_COUNSEL_PREFIX = "[Co-Counsel] "
CO_COUNSEL_TRIGGER = "(Defense whispers to co-counsel privately.)"


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

    # Unified LLM-facing append-only chat history. All personas read from
    # this; the transcript is kept separately for UI display because it
    # is richer (judge transitions, scoring, timestamps).
    chat_log: list[ChatMessage] = Field(default_factory=list)

    files: list[FileRef] = Field(default_factory=list)

    lesson_plan: LessonPlan | None = Field(
        default=None,
        description="The structured case file for this session (populated after generation or loaded from fixture).",
    )
    current_matter_index: int = 0

    complete: bool = False
    verdict: str | None = None  # "Acquitted" | "Hung Jury" | "Guilty" once complete

    # ── derived ──────────────────────────────────────────────────────────

    @property
    def current_subtopic(self) -> str:
        if not self.subtopics:
            return self.topic
        idx = min(self.current_subtopic_index, len(self.subtopics) - 1)
        return self.subtopics[idx].name

    @property
    def current_matter(self) -> str:
        if not self.lesson_plan or not self.lesson_plan.children:
            return self.topic
        idx = min(self.current_matter_index, len(self.lesson_plan.children) - 1)
        return self.lesson_plan.children[idx].label

    # ── chat_log mutation helpers ────────────────────────────────────────
    #
    # These are the *only* sanctioned way to grow the chat_log. They take
    # whatever transient header / prefix is appropriate for the persona and
    # bake it into the persisted entry, so the persisted chat_log is the
    # source of truth and projection logic disappears.

    def append_defense_to_chat(self, *, content_with_state_header: str) -> None:
        """Persist a defense turn to chat_log. Caller supplies the already-
        composed user content (with state header baked in once, then frozen).
        """
        self.chat_log.append(ChatMessage(role="user", content=content_with_state_header))

    def append_opposition_to_chat(self, *, message: str) -> None:
        """Persist an opposition reply to chat_log with the speaker prefix."""
        self.chat_log.append(
            ChatMessage(role="model", content=OPPOSITION_PREFIX + message)
        )

    def append_co_counsel_to_chat(self, *, aside: str) -> None:
        """Persist a co-counsel consultation pair (stable trigger + prefixed reply)
        to chat_log. The trigger keeps user/model alternation legal and gives
        subsequent readers a signal that a private aside happened here.
        """
        self.chat_log.append(ChatMessage(role="user", content=CO_COUNSEL_TRIGGER))
        self.chat_log.append(
            ChatMessage(role="model", content=CO_COUNSEL_PREFIX + aside)
        )

    # ── backfill ─────────────────────────────────────────────────────────

    @model_validator(mode="after")
    def _backfill_chat_log(self) -> "Session":
        """If a session was persisted before chat_log existed, project the
        existing transcript into chat_log so the next LLM call has history.

        Conservative: we don't have a record of historical per-turn state
        (current matter / jury favor at the time of each turn), so the
        backfilled defense turns get no state header — just the raw content.
        Going forward, fresh writes go through the helpers above and carry
        state headers normally.
        """
        if self.chat_log or not self.transcript:
            return self
        for msg in self.transcript:
            if msg.speaker == "defense":
                self.chat_log.append(ChatMessage(role="user", content=msg.content))
            elif msg.speaker == "counsel":
                self.chat_log.append(
                    ChatMessage(role="model", content=OPPOSITION_PREFIX + msg.content)
                )
            elif msg.speaker == "co_counsel":
                self.chat_log.append(
                    ChatMessage(role="user", content=CO_COUNSEL_TRIGGER)
                )
                self.chat_log.append(
                    ChatMessage(role="model", content=CO_COUNSEL_PREFIX + msg.content)
                )
            # judge: omitted from chat_log on purpose
        return self


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
