"""Co-counsel hint endpoint.

Like /turns, the role is determined by the endpoint hit. This endpoint *is*
co-counsel: the response is, by construction, a private aside from
co-counsel. We apply the configured jury-favor penalty server-side so the
frontend cannot forget to.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from witness_stand.ai.base import LLMError
from witness_stand.ai.prompts import (
    build_co_counsel_system,
    build_co_counsel_user_turn,
)
from witness_stand.api._deps import LLMDep, SessionDep, SessionStoreDep
from witness_stand.constants import (
    CO_COUNSEL_FALLBACK_HINT,
    CO_COUNSEL_JURY_PENALTY,
)
from witness_stand.logging_setup import logger
from witness_stand.schemas.examiner import TranscriptMessage

router = APIRouter(prefix="/sessions/{session_id}/co-counsel", tags=["co-counsel"])


class CoCounselRequest(BaseModel):
    """POST /api/sessions/{id}/co-counsel body.

    Both fields are optional. If ``draft`` is present (and non-empty),
    co-counsel reacts to the in-progress testimony the student has typed
    but not yet submitted. Otherwise co-counsel emits a general nudge
    based on the current matter and transcript so far.
    """

    draft: str | None = Field(
        default=None,
        description=(
            "Text the student has typed into the testimony box but not yet "
            "submitted. When provided, co-counsel reacts to this draft "
            "specifically rather than offering a generic stuck-mode nudge."
        ),
    )


class CoCounselResponse(BaseModel):
    """POST /api/sessions/{id}/co-counsel response."""

    hint: TranscriptMessage
    jury_delta: int
    jury_favor: int


@router.post("", response_model=CoCounselResponse, status_code=status.HTTP_200_OK)
async def request_hint(
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
    body: CoCounselRequest | None = None,
) -> CoCounselResponse:
    if session.complete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is complete — co-counsel cannot be consulted post-verdict.",
        )

    # Normalize: missing body or whitespace-only draft → no draft.
    draft_raw = body.draft if body is not None else None
    draft = draft_raw.strip() if isinstance(draft_raw, str) and draft_raw.strip() else None

    # The chat_log carries the whole conversation; the transient turn we
    # build below conveys the per-call request framing (matter + draft +
    # stuck/draft suffix) and is NOT persisted to chat_log.
    transient_request = build_co_counsel_user_turn(
        current_subtopic=session.current_subtopic,
        draft=draft,
    )
    history = session.chat_log + [transient_request]

    system_instruction = build_co_counsel_system(
        subject=session.subject,
        topic=session.topic,
    )

    logger.info(
        "co_counsel_invoke",
        chat_log_turns=len(session.chat_log),
        has_draft=draft is not None,
        draft_chars=len(draft) if draft else 0,
    )
    try:
        text = await llm.chat(
            history,
            system=system_instruction,
            # Hints are short by spec — cap output aggressively.
            max_tokens=160,
        )
    except LLMError as exc:
        logger.warning("co_counsel_failed_fallback", error=str(exc))
        text = CO_COUNSEL_FALLBACK_HINT

    # Persist the consultation: stable trigger + prefixed aside to chat_log,
    # and the rich TranscriptMessage to the UI transcript.
    session.append_co_counsel_to_chat(aside=text)
    hint_msg = TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="co_counsel",
        content=text,
        created_at=datetime.now(timezone.utc),
    )
    session.transcript.append(hint_msg)

    # Apply the jury-favor penalty centrally.
    jury_delta = -CO_COUNSEL_JURY_PENALTY
    session.jury_favor = max(0, min(100, session.jury_favor + jury_delta))

    await store.update(session)

    return CoCounselResponse(
        hint=hint_msg,
        jury_delta=jury_delta,
        jury_favor=session.jury_favor,
    )
