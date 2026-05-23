"""FastAPI application entrypoint.

Wires up:
* Logging (loguru) + per-request context middleware
* CORS for the Vite dev server
* The LLM provider (GemmaLLM) and session store as DI singletons
* The /api router (sessions, files, subtopics, turns, co-counsel)
* /healthz for liveness + provider self-reporting
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from witness_stand import __version__
from witness_stand.ai import GemmaLLM, LLMError
from witness_stand.api import api_router
from witness_stand.api._deps import get_llm_dep, get_session_store_dep
from witness_stand.config import Settings, get_settings
from witness_stand.logging_setup import (
    RequestContextMiddleware,
    configure_logging,
    logger,
)
from witness_stand.services import JsonFileSessionStore


def _build_llm(settings: Settings) -> GemmaLLM:
    provider = settings.llm_provider.lower()
    if provider != "gemma":
        raise LLMError(
            f"Unsupported LLM_PROVIDER {provider!r}; only 'gemma' is implemented.",
            provider=provider,
        )
    return GemmaLLM(
        api_key=settings.resolved_google_api_key,
        model=settings.gemma_model,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    configure_logging(level="INFO")
    logger.info(
        "startup",
        version=__version__,
        provider=settings.llm_provider,
        model=settings.gemma_model,
        data_dir=str(settings.data_dir),
    )

    # Ensure storage directories exist before any request lands.
    settings.sessions_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    # Build singletons and inject them via dependency_overrides.
    llm = _build_llm(settings)
    store = JsonFileSessionStore(settings.sessions_dir)

    app.dependency_overrides[get_llm_dep] = lambda: llm
    app.dependency_overrides[get_session_store_dep] = lambda: store

    # Stash on app.state too for any code that wants to reach in directly.
    app.state.llm = llm
    app.state.session_store = store
    app.state.settings = settings

    try:
        yield
    finally:
        logger.info("shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Witness Stand Backend",
        version=__version__,
        description=(
            "Courtroom-style academic cross-examination — backend API for "
            "the React frontend."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestContextMiddleware)

    app.include_router(api_router)

    @app.get("/healthz", tags=["health"])
    async def healthz() -> dict[str, object]:
        return {
            "status": "ok",
            "version": __version__,
            "provider": settings.llm_provider,
            "model": settings.gemma_model,
        }

    return app


app = create_app()
