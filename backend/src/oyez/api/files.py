"""Course-material file upload endpoint."""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status

from oyez.ai.base import LLMError
from oyez.api._deps import LLMDep, SessionDep, SessionStoreDep
from oyez.schemas.files import FileRefDTO, FileUploadResult

router = APIRouter(prefix="/sessions/{session_id}/files", tags=["files"])


@router.post(
    "",
    response_model=FileUploadResult,
    status_code=status.HTTP_201_CREATED,
)
async def upload_files(
    files: list[UploadFile],
    session: SessionDep,
    store: SessionStoreDep,
    llm: LLMDep,
) -> FileUploadResult:
    """Upload one or more course-material files to the session.

    Each file is streamed to a temp path, handed to the LLM provider via
    its file API, and the resulting handle is persisted in the session.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file is required.",
        )

    new_refs = []
    for upload in files:
        display_name = upload.filename or "untitled"
        # Spool to a temp file so the SDK can read it as a path. The temp file
        # is deleted on context exit; the provider keeps its own copy.
        suffix = Path(display_name).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            try:
                shutil.copyfileobj(upload.file, tmp)
                tmp_path = Path(tmp.name)
            finally:
                upload.file.close()
        try:
            ref = await llm.upload_file(
                tmp_path,
                display_name=display_name,
                mime_type=upload.content_type,
            )
        except LLMError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            ) from exc
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
        new_refs.append(ref)

    session.files.extend(new_refs)
    await store.update(session)

    return FileUploadResult(
        files=[
            FileRefDTO(
                id=f.id,
                display_name=f.display_name,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                uploaded_at=f.uploaded_at,
                expires_at=f.expires_at,
            )
            for f in new_refs
        ]
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: str,
    session: SessionDep,
    store: SessionStoreDep,
) -> None:
    """Remove an attached file from a session.

    We don't delete the upstream provider copy — it expires on its own TTL.
    """
    before = len(session.files)
    session.files = [f for f in session.files if f.id != file_id]
    if len(session.files) == before:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File {file_id} not attached to this session.",
        )
    await store.update(session)
