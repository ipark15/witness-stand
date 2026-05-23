"""Pydantic schemas — request/response contracts for the HTTP API and the
typed-output contracts for structured LLM calls.
"""

from witness_stand.schemas.examiner import (
    ExaminerTurn,
    OppositionResponse,
    Speaker,
    TranscriptMessage,
    TurnRequest,
)
from witness_stand.schemas.files import FileRefDTO, FileUploadResult
from witness_stand.schemas.scoring import ScoringRubric
from witness_stand.schemas.session import (
    Session,
    SessionCreate,
    SessionState,
    SubtopicProgress,
)
from witness_stand.schemas.subtopics import SubtopicPlan, SubtopicsResponse

__all__ = [
    "ExaminerTurn",
    "FileRefDTO",
    "FileUploadResult",
    "OppositionResponse",
    "ScoringRubric",
    "Session",
    "SessionCreate",
    "SessionState",
    "Speaker",
    "SubtopicPlan",
    "SubtopicProgress",
    "SubtopicsResponse",
    "TranscriptMessage",
    "TurnRequest",
]
