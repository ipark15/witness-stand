"""Mock LLM for testing app logic without hitting the real API.

Returns scripted responses based on the requested schema type. Useful for:
- Development/debugging of endpoint wiring and app logic
- User studies where lesson plans are pre-baked fixtures
- Saving Gemma free-tier tokens
"""
from __future__ import annotations

from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from witness_stand.ai.base import ChatMessage, FileRef, LLMError
from witness_stand.schemas.examiner import ExaminerTurn
from witness_stand.schemas.lesson_plan import (
    EvaluationResult,
    LessonPlanGeneration,
    MatterSpec,
    NodeCategory,
    NodeSpec,
    SectionUpdate,
)
from witness_stand.schemas.scoring import ScoringRubric

T = TypeVar("T", bound=BaseModel)

_PROVIDER_NAME = "mock"


def _mock_examiner_turn() -> ExaminerTurn:
    return ExaminerTurn(
        message=(
            "Counsel, you've stated what paging does, but you haven't explained "
            "*how* a virtual address gets translated. Walk me through the "
            "mechanical steps."
        ),
        advance=False,
        scoring=ScoringRubric(
            correctness=60,
            specificity=40,
            mechanism_vs_recognition=50,
            confidence_calibration=55,
        ),
        rationale="Student gave a high-level definition but no mechanism detail.",
    )


def _mock_evaluation_result() -> EvaluationResult:
    return EvaluationResult(
        updates=[],
        feedback=(
            "You're on the right track with the motivation for paging. "
            "Try to be more specific about the translation mechanism — "
            "think about how the address itself gets split up."
        ),
        all_covered=False,
    )


class MockLLM:
    """Drop-in replacement for GemmaLLM that returns scripted responses."""

    name: str = "mock"
    model: str = "mock-llm"

    async def text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return "This is a mock response for testing purposes."

    async def structured(
        self,
        prompt: str,
        *,
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        return self._mock_for_schema(schema)

    async def with_files(
        self,
        prompt: str,
        *,
        files: list[FileRef],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return "This is a mock file-grounded response."

    async def structured_with_files(
        self,
        prompt: str,
        *,
        files: list[FileRef],
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        return self._mock_for_schema(schema)

    async def chat(
        self,
        history: list[ChatMessage],
        *,
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return "Mock chat response."

    async def structured_chat(
        self,
        history: list[ChatMessage],
        *,
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        return self._mock_for_schema(schema)

    async def structured_chat_with_files(
        self,
        history: list[ChatMessage],
        *,
        files: list[FileRef],
        schema: type[T],
        system: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
    ) -> T:
        return self._mock_for_schema(schema)

    async def upload_file(
        self,
        path: Path,
        *,
        display_name: str,
        mime_type: str | None = None,
    ) -> FileRef:
        raise LLMError("MockLLM does not support file upload.", provider=_PROVIDER_NAME)

    def _mock_for_schema(self, schema: type[T]) -> T:
        """Return a scripted response for known schema types."""
        if schema is ExaminerTurn:
            return _mock_examiner_turn()  # type: ignore[return-value]
        if schema is EvaluationResult:
            return _mock_evaluation_result()  # type: ignore[return-value]
        if schema is LessonPlanGeneration:
            return LessonPlanGeneration(
                topic="Mock Topic",
                matters=[
                    MatterSpec(
                        label="Mock Matter",
                        nodes=[
                            NodeSpec(
                                label="Mock Node",
                                category=NodeCategory.definition,
                                prompt_hint="What is this?",
                                answer_key="A mock answer.",
                            )
                        ],
                    )
                ],
                rationale="Mock rationale.",
            )  # type: ignore[return-value]
        raise LLMError(
            f"MockLLM has no scripted response for schema {schema.__name__}.",
            provider=_PROVIDER_NAME,
        )
