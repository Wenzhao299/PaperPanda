from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class KnowledgeBaseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)


class KnowledgeBaseOut(BaseModel):
    id: str
    name: str
    description: str
    document_count: int
    created_at: datetime
    updated_at: datetime


class KnowledgeDocumentOut(BaseModel):
    id: str
    knowledge_base_id: str
    file_name: str
    file_size: int
    page_count: int
    chunk_count: int
    parse_status: str
    parse_error: str
    created_at: datetime
    updated_at: datetime


class KnowledgeChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1)


class KnowledgeBaseChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[KnowledgeChatTurn] = Field(default_factory=list)
    top_k: int = Field(default=4, ge=1, le=10)
    llm_provider: str | None = None
    llm_model: str | None = None


class KnowledgeContextChunk(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    chunk_index: int
    content: str
    score: float | None = None


class KnowledgeBaseChatResponse(BaseModel):
    answer: str
    context_chunks: list[KnowledgeContextChunk]
