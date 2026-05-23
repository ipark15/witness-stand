"""AI layer — provider-agnostic LLM Protocol and concrete implementations."""

from witness_stand.ai.base import LLM, ChatMessage, ChatRole, FileRef, LLMError
from witness_stand.ai.file_llm import FileLLM
from witness_stand.ai.gemma import GemmaLLM

__all__ = [
    "LLM",
    "ChatMessage",
    "ChatRole",
    "FileLLM",
    "FileRef",
    "GemmaLLM",
    "LLMError",
]
