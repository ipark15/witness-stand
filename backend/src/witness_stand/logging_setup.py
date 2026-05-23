"""Structured logging setup using loguru.

Why loguru: zero-config sane defaults, structured ``.bind(...)`` context
that flows through async code, simple sink redirection, and one place
to swap to JSON output for production.

Conventions used elsewhere in the codebase:

* Import the logger as ``from witness_stand.logging_setup import logger``.
* Bind per-request context (request_id, session_id) via the FastAPI
  middleware in this module. Within a request handler, just ``logger.info(...)``
  — the bound context is included automatically.
* For ad-hoc structured fields, prefer ``logger.bind(key=value).info(msg)`` or
  ``logger.info(msg, key=value)`` (loguru accepts both); avoid f-string
  interpolation of structured data.
"""
from __future__ import annotations

import sys
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from typing import Any

from loguru import logger as _logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Re-export so the rest of the app imports `logger` from one place.
logger = _logger

# Bound context lives on a ContextVar so it survives async hops within one
# request without being shared across concurrent requests.
_request_ctx: ContextVar[dict[str, Any]] = ContextVar("request_ctx", default={})


# ─────────────────────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────────────────────


def configure_logging(
    *,
    level: str = "INFO",
    json: bool = False,
    file_path: str | None = None,
) -> None:
    """Reset loguru sinks and install ours.

    Call this once at app startup. Safe to call multiple times (idempotent
    across reloads in ``fastapi dev``).
    """
    logger.remove()

    if json:
        # Compact structured output suitable for log aggregators.
        logger.add(
            sys.stderr,
            level=level,
            serialize=True,
            backtrace=False,
            diagnose=False,
        )
    else:
        # Developer-friendly colorful format with bound context inline.
        logger.add(
            sys.stderr,
            level=level,
            backtrace=True,
            diagnose=False,
            format=(
                "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> "
                "<level>{level: <7}</level> "
                "<cyan>{name}:{function}:{line}</cyan> "
                "{extra} <level>{message}</level>"
            ),
        )

    if file_path:
        logger.add(
            file_path,
            level=level,
            rotation="10 MB",
            retention="7 days",
            enqueue=True,
            backtrace=True,
            diagnose=False,
            serialize=json,
        )

    # Patch every log record to fold the current request context into `extra`.
    logger.configure(patcher=_patch_record_with_context)


def _patch_record_with_context(record: dict[str, Any]) -> None:
    ctx = _request_ctx.get()
    if ctx:
        record["extra"].update(ctx)


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI middleware
# ─────────────────────────────────────────────────────────────────────────────


REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Bind a fresh ``request_id`` (and ``session_id`` when present in path)
    onto the logger for the duration of every HTTP request.

    Also logs a single request-summary line per request with method, path,
    status, and duration.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER, uuid.uuid4().hex[:12])
        session_id = request.path_params.get("session_id")  # populated after routing

        ctx: dict[str, Any] = {"request_id": request_id}
        if session_id:
            ctx["session_id"] = session_id

        token = _request_ctx.set(ctx)
        # Use loguru's `catch=True` would swallow; we want propagation but with
        # a clean log. Time the request manually.
        from time import perf_counter

        start = perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            duration_ms = (perf_counter() - start) * 1000.0
            # Re-pull session_id in case it was set after routing.
            sess = request.path_params.get("session_id")
            if sess and "session_id" not in ctx:
                ctx["session_id"] = sess
            logger.bind(
                method=request.method,
                path=request.url.path,
                status=status_code,
                duration_ms=round(duration_ms, 2),
            ).info("http_request")
            _request_ctx.reset(token)


def bind(**kwargs: Any) -> None:
    """Add extra structured fields to the current request context.

    Use inside a request handler to attach domain values (e.g. ``llm_model``,
    ``subtopic_index``) that subsequent log lines should carry automatically.
    """
    current = _request_ctx.get().copy()
    current.update(kwargs)
    _request_ctx.set(current)


__all__ = [
    "REQUEST_ID_HEADER",
    "RequestContextMiddleware",
    "bind",
    "configure_logging",
    "logger",
]
