from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.reranker import Reranker
from app.ai.summarizer import Summarizer
from app.ai.translator import Translator
from app.models.paper import Paper
from app.models.search_history import SearchHistory
from app.schemas.search import SearchHistoryItem, SearchRequest, SearchResponse, SearchResultItem


class SearchService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.reranker = Reranker()
        self.translator = Translator()
        self.summarizer = Summarizer()

    async def semantic_search(self, payload: SearchRequest, user_id: str | None = None) -> SearchResponse:
        stmt = select(Paper)

        if payload.source != "all":
            stmt = stmt.where(Paper.source == payload.source)
        if payload.categories:
            stmt = stmt.where(Paper.primary_category.in_(payload.categories))
        if payload.date_from:
            stmt = stmt.where(Paper.published_date >= payload.date_from)
        if payload.date_to:
            stmt = stmt.where(Paper.published_date <= payload.date_to)

        like = f"%{payload.query.strip()}%"
        stmt = stmt.where(or_(Paper.title.ilike(like), Paper.abstract.ilike(like)))

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int((await self.db.execute(total_stmt)).scalar_one())

        offset = (payload.page - 1) * payload.page_size
        rows = await self.db.scalars(
            stmt.order_by(Paper.published_date.desc().nullslast(), Paper.created_at.desc()).offset(offset).limit(payload.page_size)
        )
        papers = list(rows)

        candidates = [
            {
                "id": str(paper.id),
                "arxiv_id": paper.arxiv_id,
                "title": paper.title,
                "title_zh": paper.title_zh,
                "abstract": paper.abstract,
                "abstract_zh": paper.abstract_zh,
                "summary": paper.summary,
                "authors": list(paper.authors or []),
                "primary_category": paper.primary_category,
                "categories": list(paper.categories or []),
                "source": paper.source,
                "published_date": paper.published_date,
            }
            for paper in papers
        ]

        ranked = await self.reranker.rerank(payload.query, candidates)

        items: list[SearchResultItem] = []
        for item in ranked:
            title_zh = item["title_zh"] or await self.translator.translate(item["title"], target_lang="zh")
            abstract_zh = item["abstract_zh"] or await self.translator.translate(item["abstract"], target_lang="zh")
            summary = item["summary"] or await self.summarizer.summarize(item["abstract"])
            items.append(
                SearchResultItem(
                    id=item["id"],
                    arxiv_id=item["arxiv_id"],
                    title=item["title"],
                    title_zh=title_zh,
                    abstract=item["abstract"],
                    abstract_zh=abstract_zh,
                    summary=summary,
                    authors=item["authors"],
                    primary_category=item["primary_category"],
                    categories=item["categories"],
                    source=item["source"],
                    published_date=item["published_date"],
                )
            )

        if user_id:
            await self._save_history(user_id=user_id, payload=payload, result_count=total)

        return SearchResponse(
            query=payload.query,
            total=total,
            page=payload.page,
            page_size=payload.page_size,
            items=items,
        )

    async def list_history(self, user_id: str, page: int, page_size: int) -> list[SearchHistoryItem]:
        uid = uuid.UUID(user_id)
        offset = (page - 1) * page_size
        rows = await self.db.scalars(
            select(SearchHistory)
            .where(SearchHistory.user_id == uid)
            .order_by(SearchHistory.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return [
            SearchHistoryItem(
                id=str(item.id),
                query=item.query,
                filters=item.filters or {},
                result_count=item.result_count,
                created_at=item.created_at,
            )
            for item in rows
        ]

    async def _save_history(self, user_id: str, payload: SearchRequest, result_count: int) -> None:
        history = SearchHistory(
            user_id=uuid.UUID(user_id),
            query=payload.query,
            filters={
                "source": payload.source,
                "categories": payload.categories,
                "date_from": payload.date_from.isoformat() if payload.date_from else None,
                "date_to": payload.date_to.isoformat() if payload.date_to else None,
            },
            result_count=result_count,
        )
        self.db.add(history)
        await self.db.flush()
