from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding import build_embedding_provider
from app.db.milvus import get_milvus
from app.models.paper import Paper


class CrawlerPipeline:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.embedding_provider = build_embedding_provider()

    async def ingest_metadata(self, records: list[dict[str, Any]]) -> int:
        upserted = 0
        for record in records:
            arxiv_id = str(record.get("arxiv_id", "")).strip()
            if not arxiv_id:
                continue

            existing = await self.db.scalar(select(Paper).where(Paper.arxiv_id == arxiv_id))
            if existing:
                existing.title = record.get("title", existing.title)
                existing.abstract = record.get("abstract", existing.abstract)
                existing.authors = record.get("authors", existing.authors)
                existing.categories = record.get("categories", existing.categories)
                existing.primary_category = record.get("primary_category", existing.primary_category)
                existing.published_date = record.get("published_date", existing.published_date)
                existing.updated_date = record.get("updated_date", existing.updated_date)
                existing.pdf_url = record.get("pdf_url", existing.pdf_url)
                existing.doi = record.get("doi", existing.doi)
                existing.source = record.get("source", existing.source)
                existing.status = record.get("status", existing.status)
            else:
                self.db.add(
                    Paper(
                        arxiv_id=arxiv_id,
                        title=record.get("title", ""),
                        abstract=record.get("abstract", ""),
                        authors=list(record.get("authors", [])),
                        categories=list(record.get("categories", [])),
                        primary_category=record.get("primary_category", "unknown"),
                        published_date=record.get("published_date"),
                        updated_date=record.get("updated_date"),
                        pdf_url=record.get("pdf_url", ""),
                        doi=record.get("doi", ""),
                        source=record.get("source", "arxiv"),
                        status=record.get("status", "active"),
                    )
                )
            upserted += 1

        await self.db.flush()
        return upserted

    async def generate_abstract_embeddings(self, limit: int = 200) -> int:
        papers = list(
            await self.db.scalars(
                select(Paper)
                .where(Paper.status == "active")
                .order_by(Paper.updated_at.desc(), Paper.created_at.desc())
                .limit(limit)
            )
        )
        if not papers:
            return 0

        embeddings = await self.embedding_provider.embed([paper.abstract for paper in papers])

        try:
            client = get_milvus()
            data = []
            for paper, embedding in zip(papers, embeddings, strict=True):
                published_ts = 0
                if paper.published_date:
                    published_ts = int(datetime.combine(paper.published_date, datetime.min.time()).timestamp())
                data.append(
                    {
                        "id": str(paper.id),
                        "arxiv_id": paper.arxiv_id,
                        "embedding": embedding,
                        "primary_category": paper.primary_category,
                        "published_date": published_ts,
                    }
                )
            if data:
                client.insert(collection_name="paper_abstracts", data=data)
        except Exception:
            # 开发阶段允许在 Milvus 不可用时跳过写入
            return len(papers)

        return len(papers)
