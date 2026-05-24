"""Session CRUD endpoints."""
from __future__ import annotations

from fastapi import APIRouter, status

from oyez.api._deps import SessionDep, SessionStoreDep, files_expired
from oyez.schemas.session import (
    Session,
    SessionCreate,
    SessionState,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionState])
async def list_sessions(store: SessionStoreDep) -> list[SessionState]:
    """List every persisted session, freshest first.

    Returns the same wire shape as ``GET /sessions/{id}`` so the frontend's
    Case History list can show subject / topic / verdict / progress without
    a per-row follow-up fetch. ``files_expired`` is conservatively reported
    as False here; review consumers don't need that flag (review is
    read-only with respect to opposition turns) and computing it per row
    would mean a TTL check on every file ref in every session.
    """
    sessions = await store.list()
    return [SessionState.from_session(s) for s in sessions]


@router.post("", response_model=SessionState, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    store: SessionStoreDep,
) -> SessionState:
    """Create a new examination session. Subtopics are not generated yet —
    the frontend should call POST /sessions/{id}/subtopics next, optionally
    after uploading course materials."""
    session = Session(
        subject=body.subject,
        topic=body.topic,
        intensity=body.intensity,
    )
    await store.create(session)
    return SessionState.from_session(session)


@router.get("/{session_id}", response_model=SessionState)
async def get_session(session: SessionDep) -> SessionState:
    """Read the full session — used by the frontend to reconnect."""
    return SessionState.from_session(session, files_expired=files_expired(session))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session: SessionDep, store: SessionStoreDep) -> None:
    await store.delete(session.id)
