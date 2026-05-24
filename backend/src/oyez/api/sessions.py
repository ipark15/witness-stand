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
