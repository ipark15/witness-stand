"""API routers."""

from fastapi import APIRouter

from oyez.api import (
    co_counsel,
    files,
    lesson_plan,
    post_trial,
    sessions,
    subtopics,
    turns,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(sessions.router)
api_router.include_router(files.router)
api_router.include_router(subtopics.router)
api_router.include_router(turns.router)
api_router.include_router(co_counsel.router)
api_router.include_router(lesson_plan.router)
api_router.include_router(post_trial.router)

__all__ = ["api_router"]
