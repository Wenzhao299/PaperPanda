from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding import build_embedding_provider
from app.db.milvus import ensure_milvus_collections, get_milvus
from app.models.paper import Paper

PIPELINE_LOCK_KEY = 2026022602


class CrawlerPipeline:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.embedding_provider = build_embedding_provider()

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
        existing_map = {
            paper.arxiv_id: paper
            for paper in await self.db.scalars(select(Paper).where(Paper.arxiv_id.in_(arxiv_ids)))
        }

        touched_papers: list[Paper] = []
        for record in normalized_records:
            arxiv_id = str(record["arxiv_id"])
            existing = existing_map.get(arxiv_id)
            if existing:
                self._apply_record(existing, record)
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

        embeddings = await self.embedding_provider.embed([paper.abstract for paper in papers])

        try:
            client = get_milvus()
            ensure_milvus_collections(client)
            data = []
            for paper, embedding in zip(papers, embeddings, strict=True):
                published_ts = 0
                if paper.published_date:
                    published_ts = int(datetime.combine(paper.published_date, datetime.min.time()).timestamp())
                data.append(
                    {
                        "id": self._uuid_to_int64(paper.id),
                        "arxiv_id": paper.arxiv_id,
                        "vector": embedding,
                        "primary_category": paper.primary_category,
                        "published_date": published_ts,
                    }
                )
            if data:
                client.upsert(collection_name="paper_abstracts", data=data)
        except Exception as exc:
            raise RuntimeError(f"Failed to write abstract vectors to Milvus: {exc}") from exc

        return len(papers)

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
    def _apply_record(paper: Paper, record: dict[str, Any]) -> None:
        paper.title = str(record.get("title", paper.title) or paper.title)
        paper.abstract = str(record.get("abstract", paper.abstract) or paper.abstract)
        paper.authors = list(record.get("authors", paper.authors) or paper.authors or [])
        paper.categories = list(record.get("categories", paper.categories) or paper.categories or [])
        paper.primary_category = str(record.get("primary_category", paper.primary_category) or paper.primary_category)
        paper.published_date = record.get("published_date", paper.published_date)
        paper.updated_date = record.get("updated_date", paper.updated_date)
        paper.pdf_url = str(record.get("pdf_url", paper.pdf_url) or paper.pdf_url)
        paper.doi = str(record.get("doi", paper.doi) or paper.doi)
        paper.source = str(record.get("source", paper.source) or paper.source)
        paper.status = str(record.get("status", paper.status) or paper.status)

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
