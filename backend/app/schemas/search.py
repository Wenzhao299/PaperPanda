from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    source: Literal["arxiv", "conference", "journal", "all"] = "all"
    categories: list[str] = Field(default_factory=list)
    date_from: date | None = None
    date_to: date | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class SearchResultItem(BaseModel):
    id: str
    arxiv_id: str
    title: str
    title_zh: str
    abstract: str
    abstract_zh: str
    summary: str
    authors: list[str]
    primary_category: str
    categories: list[str]
    source: str
    published_date: date | None = None


class SearchResponse(BaseModel):
    query: str
    total: int
    page: int
    page_size: int
    items: list[SearchResultItem]


class SearchHistoryItem(BaseModel):
    id: str
    query: str
    filters: dict
    result_count: int
    created_at: datetime
