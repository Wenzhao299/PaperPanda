from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from fastapi import status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding import build_embedding_provider
from app.config import get_settings
from app.core.exceptions import AppError
from app.db.milvus import ensure_milvus_collections, get_milvus
from app.models.paper import Paper
from app.models.search_history import PaperViewHistory, SearchHistory
from app.schemas.search import (
    PaperViewHistoryItem,
    SearchHistoryItem,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)


@dataclass(slots=True)
class _SemanticHit:
    arxiv_id: str
    distance: float | None
    rank: int


@dataclass(slots=True)
class _SearchCacheEntry:
    created_at: float
    ranked: list[dict[str, Any]]


_SEARCH_CACHE_TTL_SECONDS = 300
_SEARCH_CACHE_MAX_ITEMS = 128
_SEARCH_CACHE: OrderedDict[str, _SearchCacheEntry] = OrderedDict()
_SEARCH_CACHE_LOCK = threading.Lock()


class SearchService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()
        self.embedding_provider = build_embedding_provider()

    async def semantic_search(self, payload: SearchRequest, user_id: str | None = None) -> SearchResponse:
        query = payload.query.strip()
        if not query:
            return SearchResponse(
                query=payload.query,
                total=0,
                total_pages=0,
                page=payload.page,
                page_size=payload.page_size,
                items=[],
            )
        recall_k = max(self.settings.rerank_recall_top_k, payload.page_size * 5)

        cache_key = self._build_cache_key(query=query, payload=payload)
        cached = self._get_cached_ranking(cache_key)

        if cached is None:
            semantic_hits = await self._semantic_recall(query=query, limit=recall_k)
            ranked = await self._semantic_candidates(payload=payload, hits=semantic_hits)
            self._set_cached_ranking(cache_key=cache_key, ranked=ranked)
        else:
            ranked = cached.ranked

        total = len(ranked)
        total_pages = (total + payload.page_size - 1) // payload.page_size if total else 0
        offset = (payload.page - 1) * payload.page_size
        paged = ranked[offset : offset + payload.page_size]
        items = await self._build_result_items(candidates=paged, enable_translation=payload.enable_translation)

        if user_id and payload.page == 1:
            await self._save_history(user_id=user_id, payload=payload, result_count=total)

        return SearchResponse(
            query=payload.query,
            total=total,
            total_pages=total_pages,
            page=payload.page,
            page_size=payload.page_size,
            items=items,
            rerank_applied=False,
            rerank_providers=[],
            rerank_reason="disabled",
            rerank_provider_errors={},
        )

    async def _semantic_recall(self, query: str, limit: int) -> list[_SemanticHit]:
        try:
            vector_rows = await self.embedding_provider.embed([query])
            if not vector_rows:
                return []
            vector = vector_rows[0]
            client = get_milvus()
            ensure_milvus_collections(client)
            try:
                raw_hits = client.search(
                    collection_name="paper_abstracts",
                    data=[vector],
                    limit=max(1, limit),
                    output_fields=["arxiv_id"],
                )
            except Exception:
                raw_hits = client.search(
                    collection_name="paper_abstracts",
                    data=[vector],
                    limit=max(1, limit),
                )
        except Exception:
            return []

        rows = raw_hits[0] if isinstance(raw_hits, list) and raw_hits else []
        result: list[_SemanticHit] = []
        for index, item in enumerate(rows, start=1):
            if not isinstance(item, dict):
                continue
            entity = item.get("entity")
            arxiv_id = str(item.get("arxiv_id", "")).strip()
            if not arxiv_id and isinstance(entity, dict):
                arxiv_id = str(entity.get("arxiv_id", "")).strip()
            if not arxiv_id:
                continue
            distance = item.get("distance")
            distance_value = float(distance) if isinstance(distance, (int, float)) else None
            result.append(_SemanticHit(arxiv_id=arxiv_id, distance=distance_value, rank=index))
        return result

    async def _semantic_candidates(
        self,
        payload: SearchRequest,
        hits: list[_SemanticHit],
    ) -> list[dict[str, Any]]:
        if not hits:
            return []

        hit_map = {hit.arxiv_id: hit for hit in hits}
        ordered_ids = list(dict.fromkeys(hit.arxiv_id for hit in hits if hit.arxiv_id))
        stmt = self._apply_paper_filters(select(Paper), payload).where(Paper.arxiv_id.in_(ordered_ids))
        papers = list(await self.db.scalars(stmt))
        paper_by_arxiv = {paper.arxiv_id: paper for paper in papers}

        max_rank = max(len(hits), 1)
        merged: list[dict[str, Any]] = []
        for arxiv_id in ordered_ids:
            paper = paper_by_arxiv.get(arxiv_id)
            hit = hit_map.get(arxiv_id)
            if not paper or not hit:
                continue
            rank_score = 1.0 - ((hit.rank - 1) / max(max_rank - 1, 1))
            distance_score = self._normalize_distance(hit.distance)
            semantic_score = 0.7 * rank_score + 0.3 * distance_score
            candidate = self._paper_to_candidate(paper)
            candidate["semantic_rank"] = hit.rank
            candidate["semantic_score"] = semantic_score
            merged.append(candidate)
        return merged

    async def _build_result_items(
        self,
        candidates: list[dict[str, Any]],
        enable_translation: bool,
    ) -> list[SearchResultItem]:
        items: list[SearchResultItem] = []
        for item in candidates:
            title = str(item.get("title", "")).strip()
            abstract = str(item.get("abstract", "")).strip()
            title_zh_saved = str(item.get("title_zh", "")).strip()
            abstract_zh_saved = str(item.get("abstract_zh", "")).strip()
            title_zh = title_zh_saved or title
            abstract_zh = abstract_zh_saved or abstract

            # 翻译已改为离线入库，检索阶段仅回传已保存字段。
            if not enable_translation:
                title_zh = title
                abstract_zh = abstract

            items.append(
                SearchResultItem(
                    id=str(item["id"]),
                    arxiv_id=str(item["arxiv_id"]),
                    title=title,
                    title_zh=title_zh,
                    abstract=abstract,
                    abstract_zh=abstract_zh,
                    summary=str(item.get("summary", "")).strip(),
                    authors=list(item.get("authors", [])),
                    primary_category=str(item.get("primary_category", "")),
                    categories=list(item.get("categories", [])),
                    source=str(item.get("source", "arxiv")),
                    published_date=item.get("published_date"),
                    semantic_score=float(item.get("semantic_score", 0.0)),
                    keyword_score=None,
                    llm_score=None,
                    rerank_score=None,
                    baseline_score=None,
                )
            )
        return items

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

    async def list_paper_views(self, user_id: str, page: int, page_size: int) -> list[PaperViewHistoryItem]:
        uid = uuid.UUID(user_id)
        offset = (page - 1) * page_size
        rows = await self.db.execute(
            select(PaperViewHistory, Paper)
            .join(Paper, Paper.id == PaperViewHistory.paper_id)
            .where(PaperViewHistory.user_id == uid)
            .order_by(PaperViewHistory.viewed_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return [
            PaperViewHistoryItem(
                id=str(view.id),
                paper_id=str(view.paper_id),
                arxiv_id=paper.arxiv_id,
                title=paper.title,
                title_zh=paper.title_zh,
                source=paper.source,
                published_date=paper.published_date,
                view_count=view.view_count,
                viewed_at=view.viewed_at,
            )
            for view, paper in rows.all()
        ]

    async def save_paper_view(self, user_id: str, paper_id: str) -> PaperViewHistoryItem:
        try:
            uid = uuid.UUID(user_id)
        except ValueError as exc:
            raise AppError("Invalid user id.", status_code=status.HTTP_400_BAD_REQUEST, code="invalid_user_id") from exc

        try:
            pid = uuid.UUID(paper_id)
        except ValueError as exc:
            raise AppError("Invalid paper id.", status_code=status.HTTP_400_BAD_REQUEST, code="invalid_paper_id") from exc

        paper = await self.db.scalar(select(Paper).where(Paper.id == pid))
        if not paper:
            raise AppError("Paper not found.", status_code=status.HTTP_404_NOT_FOUND, code="paper_not_found")

        item = await self.db.scalar(
            select(PaperViewHistory).where(PaperViewHistory.user_id == uid, PaperViewHistory.paper_id == pid)
        )
        now = datetime.now(timezone.utc)
        if item is None:
            item = PaperViewHistory(
                user_id=uid,
                paper_id=pid,
                view_count=1,
                viewed_at=now,
            )
            self.db.add(item)
        else:
            item.view_count = int(item.view_count) + 1
            item.viewed_at = now
        await self.db.flush()

        return PaperViewHistoryItem(
            id=str(item.id),
            paper_id=str(item.paper_id),
            arxiv_id=paper.arxiv_id,
            title=paper.title,
            title_zh=paper.title_zh,
            source=paper.source,
            published_date=paper.published_date,
            view_count=item.view_count,
            viewed_at=item.viewed_at,
        )

    async def _save_history(self, user_id: str, payload: SearchRequest, result_count: int) -> None:
        history = SearchHistory(
            user_id=uuid.UUID(user_id),
            query=payload.query,
            filters={
                "source": payload.source,
                "categories": payload.categories,
                "published_year": payload.published_year,
                "date_from": payload.date_from.isoformat() if payload.date_from else None,
                "date_to": payload.date_to.isoformat() if payload.date_to else None,
                "enable_translation": payload.enable_translation,
            },
            result_count=result_count,
        )
        self.db.add(history)
        await self.db.flush()

    def _apply_paper_filters(self, stmt: Any, payload: SearchRequest) -> Any:
        stmt = stmt.where(Paper.status == "active")
        if payload.source == "arxiv":
            stmt = stmt.where(Paper.source == "arxiv")
        elif payload.source == "conference":
            stmt = stmt.where(or_(Paper.source == "conference", Paper.source.like("conference.%")))
        elif payload.source == "journal":
            stmt = stmt.where(or_(Paper.source == "journal", Paper.source.like("journal.%")))
        if payload.categories:
            stmt = stmt.where(Paper.primary_category.in_(payload.categories))
        if payload.published_year:
            date_from = date(payload.published_year, 1, 1)
            date_to = date(payload.published_year, 12, 31)
            stmt = stmt.where(Paper.published_date >= date_from, Paper.published_date <= date_to)
        if payload.date_from:
            stmt = stmt.where(Paper.published_date >= payload.date_from)
        if payload.date_to:
            stmt = stmt.where(Paper.published_date <= payload.date_to)
        return stmt

    @staticmethod
    def _paper_to_candidate(paper: Paper) -> dict[str, Any]:
        return {
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

    @staticmethod
    def _normalize_distance(value: float | None) -> float:
        if value is None:
            return 0.0
        if -1.0 <= value <= 1.0:
            return (value + 1.0) / 2.0
        return 1.0 / (1.0 + max(value, 0.0))

    def _build_cache_key(self, query: str, payload: SearchRequest) -> str:
        cache_payload = {
            "query": query,
            "source": payload.source,
            "categories": sorted(payload.categories),
            "published_year": payload.published_year,
            "date_from": payload.date_from.isoformat() if payload.date_from else "",
            "date_to": payload.date_to.isoformat() if payload.date_to else "",
            "page_size": payload.page_size,
        }
        raw = json.dumps(cache_payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()

    def _get_cached_ranking(self, cache_key: str) -> _SearchCacheEntry | None:
        now = time.time()
        with _SEARCH_CACHE_LOCK:
            item = _SEARCH_CACHE.get(cache_key)
            if item is None:
                return None
            if now - item.created_at > _SEARCH_CACHE_TTL_SECONDS:
                _SEARCH_CACHE.pop(cache_key, None)
                return None
            _SEARCH_CACHE.move_to_end(cache_key)
            return item

    def _set_cached_ranking(
        self,
        cache_key: str,
        ranked: list[dict[str, Any]],
    ) -> None:
        now = time.time()
        cache_item = _SearchCacheEntry(
            created_at=now,
            ranked=[dict(item) for item in ranked],
        )
        with _SEARCH_CACHE_LOCK:
            stale_keys = [
                key for key, value in _SEARCH_CACHE.items() if now - value.created_at > _SEARCH_CACHE_TTL_SECONDS
            ]
            for key in stale_keys:
                _SEARCH_CACHE.pop(key, None)
            _SEARCH_CACHE[cache_key] = cache_item
            _SEARCH_CACHE.move_to_end(cache_key)
            while len(_SEARCH_CACHE) > _SEARCH_CACHE_MAX_ITEMS:
                _SEARCH_CACHE.popitem(last=False)
