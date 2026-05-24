"""Pydantic schemas — request/response contracts for the HTTP API and the
typed-output contracts for structured LLM calls.
"""

from oyez.schemas.examiner import (
    ExaminerTurn,
    OppositionResponse,
    Speaker,
    TranscriptMessage,
    TurnRequest,
)
from oyez.schemas.files import FileRefDTO, FileUploadResult
from oyez.schemas.lesson_plan import (
    CaseFileNode,
    CaseFileNodeDTO,
    LessonPlan,
    LessonPlanGeneration,
    LessonPlanResponse,
    NodeCategory,
    SectionUpdate,
)
from oyez.schemas.scoring import ScoringRubric
from oyez.schemas.session import (
    Session,
    SessionCreate,
    SessionState,
    SubtopicProgress,
)
from oyez.schemas.subtopics import SubtopicPlan, SubtopicsResponse

__all__ = [
    "CaseFileNode",
    "CaseFileNodeDTO",
    "ExaminerTurn",
    "FileRefDTO",
    "FileUploadResult",
    "LessonPlan",
    "LessonPlanGeneration",
    "LessonPlanResponse",
    "NodeCategory",
    "OppositionResponse",
    "ScoringRubric",
    "SectionUpdate",
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
