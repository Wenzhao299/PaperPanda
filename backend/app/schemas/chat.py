from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChatSessionCreateRequest(BaseModel):
    title: str = Field(default="新对话", max_length=200)
    context_type: str = Field(default="search_results", max_length=32)
    context_refs: dict[str, Any] = Field(default_factory=dict)
    llm_provider: str | None = None
    llm_model: str | None = None


class ChatSessionOut(BaseModel):
    id: str
    title: str
    context_type: str
    context_refs: dict[str, Any]
    llm_provider: str
    llm_model: str
    created_at: datetime
    updated_at: datetime


class ChatMessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    metadata: dict[str, Any]
    created_at: datetime


class ChatSendResponse(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
