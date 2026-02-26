from __future__ import annotations

import uuid

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.paper import Paper, PaperChunk
from app.schemas.paper import PaperDetailResponse, PaperFulltextResponse, PaperFulltextSection


class PaperService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_paper(self, paper_id: str) -> PaperDetailResponse:
        paper = await self._fetch_paper(paper_id)
        return PaperDetailResponse(
            id=str(paper.id),
            arxiv_id=paper.arxiv_id,
            title=paper.title,
            title_zh=paper.title_zh,
            abstract=paper.abstract,
            abstract_zh=paper.abstract_zh,
            summary=paper.summary,
            authors=list(paper.authors or []),
            categories=list(paper.categories or []),
            primary_category=paper.primary_category,
            doi=paper.doi,
            pdf_url=paper.pdf_url,
            published_date=paper.published_date,
            updated_date=paper.updated_date,
            source=paper.source,
            status=paper.status,
        )

    async def get_fulltext(self, paper_id: str) -> PaperFulltextResponse:
        paper = await self._fetch_paper(paper_id)
        chunks = await self.db.scalars(
            select(PaperChunk).where(PaperChunk.paper_id == paper.id).order_by(PaperChunk.chunk_index.asc())
        )
        sections = [
            PaperFulltextSection(
                chunk_index=chunk.chunk_index,
                section=chunk.section,
                content=chunk.content,
            )
            for chunk in chunks
        ]

        if not sections:
            sections = [
                PaperFulltextSection(
                    chunk_index=0,
                    section="abstract",
                    content=paper.abstract,
                )
            ]

        return PaperFulltextResponse(paper_id=str(paper.id), sections=sections)

    async def _fetch_paper(self, paper_id: str) -> Paper:
        try:
            pid = uuid.UUID(paper_id)
        except ValueError as exc:
            raise AppError("Invalid paper id.", status_code=status.HTTP_400_BAD_REQUEST, code="invalid_paper_id") from exc

        paper = await self.db.scalar(select(Paper).where(Paper.id == pid))
        if not paper:
            raise AppError("Paper not found.", status_code=status.HTTP_404_NOT_FOUND, code="paper_not_found")
        return paper
