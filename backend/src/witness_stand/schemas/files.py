"""File-related DTOs."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FileRefDTO(BaseModel):
    """Public projection of a session's attached file.

    We intentionally do not expose the provider URI — the frontend has no
    need for it, and it changes when files are re-uploaded on expiry.
    """

    id: str
    display_name: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime
    expires_at: datetime | None


class FileUploadResult(BaseModel):
    """POST /api/sessions/{id}/files response."""

    files: list[FileRefDTO]
