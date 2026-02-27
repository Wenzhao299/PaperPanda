from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding import build_embedding_provider
from app.ai.translator import Translator
from app.config import get_settings
from app.db.milvus import ensure_milvus_collections, get_milvus
from app.models.paper import Paper

PIPELINE_LOCK_KEY = 2026022602


class CrawlerPipeline:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()
        self.embedding_provider = build_embedding_provider()
        self.translator = Translator()

    async def acquire_pipeline_lock(self) -> None:
        row = await self.db.execute(
            text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
            {"lock_key": PIPELINE_LOCK_KEY},
        )
        locked = bool(row.scalar_one())
        if not locked:
            raise RuntimeError("Crawler pipeline is already running.")

    async def ingest_metadata(self, records: list[dict[str, Any]]) -> tuple[int, list[uuid.UUID]]:
        normalized_records = self._deduplicate_records(records)
        if not normalized_records:
            return 0, []

        arxiv_ids = [str(record["arxiv_id"]) for record in normalized_records]
        existing_map: dict[str, Paper] = {}
        batch_size = 5000
        for index in range(0, len(arxiv_ids), batch_size):
            batch_ids = arxiv_ids[index : index + batch_size]
            rows = await self.db.scalars(select(Paper).where(Paper.arxiv_id.in_(batch_ids)))
            for paper in rows:
                existing_map[paper.arxiv_id] = paper

        touched_papers: list[Paper] = []
        for record in normalized_records:
            arxiv_id = str(record["arxiv_id"])
            existing = existing_map.get(arxiv_id)
            if existing:
                changed = self._apply_record(existing, record)
                if changed:
                    touched_papers.append(existing)
                continue

            paper = Paper(
                id=uuid.uuid4(),
                arxiv_id=arxiv_id,
                title=str(record.get("title", "")).strip(),
                abstract=str(record.get("abstract", "")).strip(),
                authors=list(record.get("authors", [])),
                categories=list(record.get("categories", [])),
                primary_category=str(record.get("primary_category", "unknown") or "unknown"),
                published_date=record.get("published_date"),
                updated_date=record.get("updated_date"),
                pdf_url=str(record.get("pdf_url", "") or ""),
                doi=str(record.get("doi", "") or ""),
                source=str(record.get("source", "arxiv") or "arxiv"),
                status=str(record.get("status", "active") or "active"),
            )
            self.db.add(paper)
            existing_map[arxiv_id] = paper
            touched_papers.append(paper)

        await self.db.flush()
        touched_ids = [paper.id for paper in touched_papers if paper.id is not None]
        return len(touched_ids), touched_ids

    async def get_category_since_map(self, categories: list[str]) -> dict[str, date]:
        result: dict[str, date] = {}
        for category in categories:
            stmt = select(func.max(Paper.published_date)).where(
                Paper.source == "arxiv",
                Paper.status == "active",
                Paper.categories.contains([category]),
            )
            latest = await self.db.scalar(stmt)
            if isinstance(latest, date):
                result[category] = latest
        return result

    async def translate_missing_metadata(
        self,
        paper_ids: list[uuid.UUID] | None = None,
        limit: int | None = None,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> int:
        stmt = select(Paper).where(
            Paper.status == "active",
            or_(Paper.title_zh.is_(None), Paper.title_zh == "", Paper.abstract_zh.is_(None), Paper.abstract_zh == ""),
        )
        if paper_ids is not None:
            if not paper_ids:
                return 0
            stmt = stmt.where(Paper.id.in_(paper_ids))

        stmt = stmt.order_by(Paper.updated_at.desc(), Paper.created_at.desc())
        if isinstance(limit, int) and limit > 0:
            stmt = stmt.limit(limit)
        papers = list(await self.db.scalars(stmt))
        if not papers:
            if progress_callback is not None:
                progress_callback(0, 0)
            return 0

        total = len(papers)
        if progress_callback is not None:
            progress_callback(0, total)
        paper_map = {paper.id: paper for paper in papers}

        concurrency = max(1, self.settings.pipeline_translate_concurrency)
        semaphore = asyncio.Semaphore(concurrency)
        target_lang = self.settings.pipeline_translate_target_lang

        async def translate_one(paper: Paper) -> tuple[uuid.UUID, str, str]:
            title_raw = str(paper.title or "").strip()
            abstract_raw = str(paper.abstract or "").strip()
            title_zh = str(paper.title_zh or "").strip()
            abstract_zh = str(paper.abstract_zh or "").strip()

            async with semaphore:
                if not title_zh and title_raw:
                    try:
                        title_zh = (await self.translator.translate(title_raw, target_lang=target_lang)).strip() or title_raw
                    except Exception:
                        title_zh = title_raw
                if not abstract_zh and abstract_raw:
                    try:
                        abstract_zh = (
                            await self.translator.translate(abstract_raw, target_lang=target_lang)
                        ).strip() or abstract_raw
                    except Exception:
                        abstract_zh = abstract_raw
            return paper.id, title_zh, abstract_zh

        translated_tasks = [asyncio.create_task(translate_one(paper)) for paper in papers]
        processed = 0
        updated = 0
        for task in asyncio.as_completed(translated_tasks):
            try:
                paper_id, title_zh, abstract_zh = await task
                paper = paper_map.get(paper_id)
                if paper is not None:
                    changed = False
                    old_title_zh = str(paper.title_zh or "").strip()
                    old_abstract_zh = str(paper.abstract_zh or "").strip()

                    if title_zh and title_zh != old_title_zh:
                        paper.title_zh = title_zh
                        changed = True
                    if abstract_zh and abstract_zh != old_abstract_zh:
                        paper.abstract_zh = abstract_zh
                        changed = True

                    if changed:
                        try:
                            await self.db.flush()
                            await self.db.commit()
                            updated += 1
                        except Exception:
                            await self.db.rollback()
            finally:
                processed += 1
                if progress_callback is not None:
                    progress_callback(processed, total)
        return updated

    async def generate_abstract_embeddings(
        self,
        limit: int = 200,
        paper_ids: list[uuid.UUID] | None = None,
    ) -> int:
        stmt = select(Paper)
        if paper_ids is None:
            stmt = (
                stmt.where(Paper.status == "active")
                .order_by(Paper.updated_at.desc(), Paper.created_at.desc())
                .limit(limit)
            )
        else:
            if not paper_ids:
                return 0
            stmt = stmt.where(Paper.id.in_(paper_ids))

        papers = list(await self.db.scalars(stmt))
        if not papers:
            return 0

        embedding_targets: list[tuple[Paper, str]] = []
        for paper in papers:
            text = str(paper.abstract or "").strip()
            if not text:
                text = str(paper.title or "").strip()
            if not text:
                continue
            embedding_targets.append((paper, text))

        if not embedding_targets:
            return 0

        embeddings = await self.embedding_provider.embed([text for _, text in embedding_targets])

        try:
            client = get_milvus()
            ensure_milvus_collections(client)
            data = []
            for (paper, _), embedding in zip(embedding_targets, embeddings, strict=True):
                published_ts = 0
                if paper.published_date:
                    published_ts = int(datetime.combine(paper.published_date, datetime.min.time()).timestamp())
                data.append(
                    {
                        "id": self._uuid_to_int64(paper.id),
                        "paper_id": str(paper.id),
                        "arxiv_id": paper.arxiv_id,
                        "vector": embedding,
                        "primary_category": paper.primary_category,
                        "source": paper.source,
                        "published_date": published_ts,
                    }
                )
            if data:
                client.upsert(collection_name="paper_abstracts", data=data)
        except Exception as exc:
            raise RuntimeError(f"Failed to write abstract vectors to Milvus: {exc}") from exc

        return len(embedding_targets)

    def _deduplicate_records(self, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for record in records:
            arxiv_id = str(record.get("arxiv_id", "")).strip()
            if not arxiv_id:
                continue

            categories = list(dict.fromkeys(str(c).strip() for c in record.get("categories", []) if str(c).strip()))
            authors = list(dict.fromkeys(str(a).strip() for a in record.get("authors", []) if str(a).strip()))
            normalized = {
                **record,
                "arxiv_id": arxiv_id,
                "categories": categories,
                "authors": authors,
                "primary_category": str(record.get("primary_category", categories[0] if categories else "unknown") or "unknown"),
            }

            existing = merged.get(arxiv_id)
            if existing is None:
                merged[arxiv_id] = normalized
                continue

            existing["authors"] = list(dict.fromkeys([*existing.get("authors", []), *normalized["authors"]]))
            existing["categories"] = list(dict.fromkeys([*existing.get("categories", []), *normalized["categories"]]))
            existing["primary_category"] = str(
                existing.get("primary_category")
                or normalized.get("primary_category")
                or (existing["categories"][0] if existing.get("categories") else "unknown")
            )

            for field in ("title", "abstract", "pdf_url", "doi", "source", "status"):
                incoming = normalized.get(field)
                if incoming:
                    existing[field] = incoming

            existing["published_date"] = self._max_date(existing.get("published_date"), normalized.get("published_date"))
            existing["updated_date"] = self._max_date(existing.get("updated_date"), normalized.get("updated_date"))
        return list(merged.values())

    @staticmethod
    def _apply_record(paper: Paper, record: dict[str, Any]) -> bool:
        changed = False

        title = str(record.get("title", paper.title) or paper.title)
        if title != paper.title:
            paper.title = title
            changed = True

        abstract = str(record.get("abstract", paper.abstract) or paper.abstract)
        if abstract != paper.abstract:
            paper.abstract = abstract
            changed = True

        authors = list(record.get("authors", paper.authors) or paper.authors or [])
        if authors != list(paper.authors or []):
            paper.authors = authors
            changed = True

        categories = list(record.get("categories", paper.categories) or paper.categories or [])
        if categories != list(paper.categories or []):
            paper.categories = categories
            changed = True

        primary_category = str(record.get("primary_category", paper.primary_category) or paper.primary_category)
        if primary_category != paper.primary_category:
            paper.primary_category = primary_category
            changed = True

        published_date = record.get("published_date")
        if isinstance(published_date, date) and published_date != paper.published_date:
            paper.published_date = published_date
            changed = True

        updated_date = record.get("updated_date")
        if isinstance(updated_date, date) and updated_date != paper.updated_date:
            paper.updated_date = updated_date
            changed = True

        pdf_url = str(record.get("pdf_url", paper.pdf_url) or paper.pdf_url)
        if pdf_url != paper.pdf_url:
            paper.pdf_url = pdf_url
            changed = True

        doi = str(record.get("doi", paper.doi) or paper.doi)
        if doi != paper.doi:
            paper.doi = doi
            changed = True

        source = str(record.get("source", paper.source) or paper.source)
        if source != paper.source:
            paper.source = source
            changed = True

        status = str(record.get("status", paper.status) or paper.status)
        if status != paper.status:
            paper.status = status
            changed = True

        return changed

    @staticmethod
    def _max_date(left: date | None, right: date | None) -> date | None:
        if left is None:
            return right
        if right is None:
            return left
        return left if left >= right else right

    @staticmethod
    def _uuid_to_int64(value: uuid.UUID) -> int:
        return value.int & ((1 << 63) - 1)
