"""Post-trial co-counsel chat endpoint.

The Review page exposes this as a free-form Q&A with co-counsel about
a closed case. It's structurally similar to the in-trial co-counsel
endpoint (POST /api/sessions/{id}/co-counsel) but pedagogically opposite:
in-trial co-counsel withholds answers, post-trial co-counsel gives them.

See ``oyez/ai/prompts/post_trial.py`` for why the two modes diverge.

No jury-favor penalty — the verdict is already final, and review-mode
consultations have no scoring stake. No completion gate either: the
endpoint works on any session, though the prompt assumes the trial is
over (which is what the Review page guarantees in practice).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from oyez.ai.base import LLMError
from oyez.ai.prompts import (
    build_post_trial_co_counsel_system,
    build_post_trial_user_turn,
)
from oyez.api._deps import LLMDep, SessionDep, SessionStoreDep
from oyez.constants import CO_COUNSEL_FALLBACK_HINT
from oyez.logging_setup import logger
from oyez.schemas.examiner import TranscriptMessage

router = APIRouter(
    prefix="/sessions/{session_id}/post-trial-confer",
    tags=["post-trial"],
)


class PostTrialRequest(BaseModel):
    """POST /api/sessions/{id}/post-trial-confer body."""

    question: str = Field(
        min_length=1,
        max_length=2000,
        description="The student's free-form question for co-counsel.",
    )


class PostTrialResponse(BaseModel):
    """POST /api/sessions/{id}/post-trial-confer response.

    Returns both messages as ``TranscriptMessage`` so the frontend can
    append them to its visible message list with the same shape it uses
    for the rest of the transcript.
    """

    question: TranscriptMessage
    answer: TranscriptMessage


@router.post("", response_model=PostTrialResponse, status_code=status.HTTP_200_OK)
async def post_trial_confer(
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
    body: PostTrialRequest,
) -> PostTrialResponse:
    # The route owns the chat_log; this transient turn is sent to the LLM
    # but the persisted form (question + prefixed answer) is written via
    # Session.append_post_trial_to_chat below so subsequent questions in
    # the same conversation see the prior dialogue.
    transient_request = build_post_trial_user_turn(question=body.question)
    history = session.chat_log + [transient_request]

    system_instruction = build_post_trial_co_counsel_system(
        subject=session.subject,
        topic=session.topic,
    )

    logger.info(
        "post_trial_invoke",
        chat_log_turns=len(session.chat_log),
        question_chars=len(body.question),
    )

    try:
        text = await llm.chat(
            history,
            system=system_instruction,
            # Post-trial answers can be substantive; allow more headroom
            # than the 160-token cap on in-trial nudges.
            max_tokens=600,
        )
    except LLMError as exc:
        logger.warning("post_trial_failed_fallback", error=str(exc))
        text = CO_COUNSEL_FALLBACK_HINT

    # Persist to both logs: chat_log for future LLM calls in this
    # conversation, transcript for the UI to re-render on revisit.
    session.append_post_trial_to_chat(question=body.question, answer=text)

    now = datetime.now(timezone.utc)
    question_msg = TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="defense",
        content=body.question,
        created_at=now,
    )
    answer_msg = TranscriptMessage(
        id=uuid.uuid4().hex,
        speaker="co_counsel",
        content=text,
        created_at=now,
    )
    session.transcript.append(question_msg)
    session.transcript.append(answer_msg)

    await store.update(session)

    return PostTrialResponse(question=question_msg, answer=answer_msg)
