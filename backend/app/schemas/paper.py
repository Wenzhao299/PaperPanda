from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class PaperDetailResponse(BaseModel):
    id: str
    arxiv_id: str
    title: str
    title_zh: str
    abstract: str
    abstract_zh: str
    summary: str
    authors: list[str]
    categories: list[str]
    primary_category: str
    doi: str
    pdf_url: str
    published_date: date | None = None
    updated_date: date | None = None
    source: str
    status: str


class PaperFulltextSection(BaseModel):
    chunk_index: int
    section: str
    content: str


class PaperFulltextResponse(BaseModel):
    paper_id: str
    sections: list[PaperFulltextSection]
