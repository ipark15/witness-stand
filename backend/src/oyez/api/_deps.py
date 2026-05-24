"""Shared FastAPI dependencies."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Path, status

from oyez.ai.base import LLM
from oyez.schemas.session import Session
from oyez.services.session_store import SessionNotFound, SessionStore


def get_llm_dep() -> LLM:  # overridden in app startup via dependency_overrides
    raise RuntimeError(
        "LLM dependency was not initialized. main.py must override get_llm_dep."
    )


def get_session_store_dep() -> SessionStore:  # overridden in app startup
    raise RuntimeError(
        "SessionStore dependency was not initialized. main.py must override "
        "get_session_store_dep."
    )


LLMDep = Annotated[LLM, Depends(get_llm_dep)]
SessionStoreDep = Annotated[SessionStore, Depends(get_session_store_dep)]


async def load_session(
    session_id: Annotated[str, Path(min_length=8, max_length=64)],
    store: SessionStoreDep,
) -> Session:
    try:
        return await store.get(session_id)
    except SessionNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {exc.session_id} not found.",
        ) from exc


SessionDep = Annotated[Session, Depends(load_session)]


def files_expired(session: Session) -> bool:
    """True if any attached file has passed its provider TTL."""
    now = datetime.now(timezone.utc)
    return any(
        f.expires_at is not None and f.expires_at <= now for f in session.files
    )


def fresh_files(session: Session) -> list:
    """Return the subset of files that have not expired."""
    now = datetime.now(timezone.utc)
    return [
        f for f in session.files
        if f.expires_at is None or f.expires_at > now
    ]
