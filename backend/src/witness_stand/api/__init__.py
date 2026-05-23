"""API routers."""

from fastapi import APIRouter

from witness_stand.api import co_counsel, files, sessions, subtopics, turns

api_router = APIRouter(prefix="/api")
api_router.include_router(sessions.router)
api_router.include_router(files.router)
api_router.include_router(subtopics.router)
api_router.include_router(turns.router)
api_router.include_router(co_counsel.router)

__all__ = ["api_router"]
