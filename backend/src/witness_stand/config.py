"""Env-driven settings. Loaded once at startup; injected via FastAPI deps."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend settings — populated from env or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Provider selection ───────────────────────────────────────────────
    # Only "gemma" is implemented today; the LLM Protocol lets us add more.
    llm_provider: str = Field(default="gemma")

    # ── Gemma (Google AI Studio) ────────────────────────────────────────
    # The SDK reads either GOOGLE_API_KEY or GEMINI_API_KEY automatically;
    # we expose both so the operator can use whichever they have set.
    google_api_key: str | None = Field(default=None)
    gemini_api_key: str | None = Field(default=None)
    gemma_model: str = Field(default="gemma-4-26b-a4b-it")

    # ── Fixtures ─────────────────────────────────────────────────────────
    use_fixture_lesson_plan: bool = Field(default=False)

    # ── Server ──────────────────────────────────────────────────────────
    port: int = Field(default=8000)
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
    )

    # ── Storage ─────────────────────────────────────────────────────────
    data_dir: Path = Field(default=Path("./data"))

    @property
    def sessions_dir(self) -> Path:
        return self.data_dir / "sessions"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def resolved_google_api_key(self) -> str | None:
        """Either env var name is acceptable; google-genai picks one too."""
        return self.google_api_key or self.gemini_api_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor used as a FastAPI dependency."""
    return Settings()
