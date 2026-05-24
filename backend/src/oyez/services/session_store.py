"""Session persistence.

The default ``JsonFileSessionStore`` writes one JSON file per session under
``settings.sessions_dir``. Writes are atomic (tempfile + rename) and a
per-session ``asyncio.Lock`` serializes concurrent updaters in-process. This
is appropriate for a single-backend course project; swap in a real DB by
implementing the ``SessionStore`` Protocol.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol, runtime_checkable

from oyez.schemas.session import Session


class SessionNotFound(LookupError):
    """Raised when a session id is unknown or evicted."""

    def __init__(self, session_id: str) -> None:
        super().__init__(f"Session not found: {session_id}")
        self.session_id = session_id


@runtime_checkable
class SessionStore(Protocol):
    """Persistence interface — call sites depend on this, not the impl."""

    async def create(self, session: Session) -> Session:
        ...

    async def get(self, session_id: str) -> Session:
        ...

    async def list(self) -> list[Session]:
        ...

    async def update(self, session: Session) -> Session:
        ...

    async def delete(self, session_id: str) -> None:
        ...


# ─────────────────────────────────────────────────────────────────────────────
# FS-backed implementation
# ─────────────────────────────────────────────────────────────────────────────


class JsonFileSessionStore(SessionStore):
    """One JSON file per session, atomic writes, in-process locking."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    # ── public API ───────────────────────────────────────────────────────

    async def create(self, session: Session) -> Session:
        async with await self._lock_for(session.id):
            path = self._path_for(session.id)
            if path.exists():
                # Practically impossible (uuid collision) but cheap to guard.
                raise FileExistsError(f"Session already exists: {session.id}")
            self._write_atomic(path, session)
        return session

    async def get(self, session_id: str) -> Session:
        path = self._path_for(session_id)
        if not path.exists():
            raise SessionNotFound(session_id)
        return self._read(path)

    async def list(self) -> list[Session]:
        """Return every persisted session, freshest first.

        Cheap implementation: iterate the sessions directory and parse each
        JSON file. Files that fail to parse are skipped with a warning so a
        single corrupted session can't take the whole listing down.
        """
        sessions: list[Session] = []
        for path in self._root.glob("*.json"):
            try:
                sessions.append(self._read(path))
            except Exception:  # noqa: BLE001 — best-effort listing
                # We deliberately swallow per-file errors so the listing
                # remains usable even if one session file is malformed
                # (e.g. mid-write crash, schema drift). Callers that need
                # strict reads should use get() per id.
                continue
        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions

    async def update(self, session: Session) -> Session:
        async with await self._lock_for(session.id):
            path = self._path_for(session.id)
            if not path.exists():
                raise SessionNotFound(session.id)
            session.updated_at = datetime.now(timezone.utc)
            self._write_atomic(path, session)
        return session

    async def delete(self, session_id: str) -> None:
        async with await self._lock_for(session_id):
            path = self._path_for(session_id)
            if path.exists():
                path.unlink()

    # ── internals ────────────────────────────────────────────────────────

    def _path_for(self, session_id: str) -> Path:
        # Reject anything that could escape the sessions dir.
        if not session_id.isalnum():
            raise ValueError(f"Invalid session id: {session_id!r}")
        return self._root / f"{session_id}.json"

    def _read(self, path: Path) -> Session:
        data = json.loads(path.read_text(encoding="utf-8"))
        return Session.model_validate(data)

    def _write_atomic(self, path: Path, session: Session) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        payload = session.model_dump_json(indent=2)
        tmp.write_text(payload, encoding="utf-8")
        os.replace(tmp, path)

    async def _lock_for(self, session_id: str) -> asyncio.Lock:
        async with self._locks_guard:
            lock = self._locks.get(session_id)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[session_id] = lock
            return lock


# ─────────────────────────────────────────────────────────────────────────────
# In-memory implementation (for tests / ephemeral demos)
# ─────────────────────────────────────────────────────────────────────────────


class InMemorySessionStore(SessionStore):
    def __init__(self) -> None:
        self._data: dict[str, Session] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._guard = asyncio.Lock()

    async def create(self, session: Session) -> Session:
        async with await self._lock(session.id):
            if session.id in self._data:
                raise FileExistsError(f"Session already exists: {session.id}")
            self._data[session.id] = session.model_copy(deep=True)
        return session

    async def get(self, session_id: str) -> Session:
        if session_id not in self._data:
            raise SessionNotFound(session_id)
        return self._data[session_id].model_copy(deep=True)

    async def list(self) -> list[Session]:
        # Deep-copy on the way out so callers can't mutate stored state.
        sessions = [s.model_copy(deep=True) for s in self._data.values()]
        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions

    async def update(self, session: Session) -> Session:
        async with await self._lock(session.id):
            if session.id not in self._data:
                raise SessionNotFound(session.id)
            session.updated_at = datetime.now(timezone.utc)
            self._data[session.id] = session.model_copy(deep=True)
        return session

    async def delete(self, session_id: str) -> None:
        async with await self._lock(session_id):
            self._data.pop(session_id, None)

    async def _lock(self, session_id: str) -> asyncio.Lock:
        async with self._guard:
            lock = self._locks.get(session_id)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[session_id] = lock
            return lock
