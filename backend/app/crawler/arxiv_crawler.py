from __future__ import annotations

from datetime import date
from typing import Any
from urllib.parse import urlencode

import feedparser
import httpx

from app.config import get_settings


class ArxivCrawler:
    BASE_URL = "http://export.arxiv.org/api/query"

    async def fetch_metadata(self, categories: list[str] | None = None, max_results: int | None = None) -> list[dict[str, Any]]:
        settings = get_settings()
        categories = categories or settings.arxiv_category_list
        limit = max_results or settings.arxiv_batch_size

        all_records: list[dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=30) as client:
            for category in categories:
                params = {
                    "search_query": f"cat:{category}",
                    "start": 0,
                    "max_results": min(limit, settings.arxiv_max_results_per_category),
                    "sortBy": "submittedDate",
                    "sortOrder": "descending",
                }
                url = f"{self.BASE_URL}?{urlencode(params)}"
                response = await client.get(url)
                response.raise_for_status()
                parsed = feedparser.parse(response.text)
                all_records.extend(self._normalize_entries(parsed.entries, default_category=category))
        return all_records

    def _normalize_entries(self, entries: list[Any], default_category: str) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for entry in entries:
            arxiv_id = str(entry.get("id", "")).split("/")[-1]
            authors = [author.get("name", "") for author in entry.get("authors", []) if author.get("name")]
            categories = [tag.get("term", "") for tag in entry.get("tags", []) if tag.get("term")]
            if not categories:
                categories = [default_category]

            records.append(
                {
                    "arxiv_id": arxiv_id,
                    "title": str(entry.get("title", "")).strip().replace("\n", " "),
                    "abstract": str(entry.get("summary", "")).strip().replace("\n", " "),
                    "authors": authors,
                    "categories": categories,
                    "primary_category": categories[0],
                    "published_date": self._to_date(entry.get("published")),
                    "updated_date": self._to_date(entry.get("updated")),
                    "pdf_url": self._find_pdf_url(entry),
                    "doi": str(entry.get("arxiv_doi", "") or ""),
                    "source": "arxiv",
                    "status": "active",
                }
            )
        return records

    @staticmethod
    def _find_pdf_url(entry: Any) -> str:
        for link in entry.get("links", []):
            if link.get("type") == "application/pdf":
                return str(link.get("href", ""))
        return ""

    @staticmethod
    def _to_date(value: str | None) -> date | None:
        if not value:
            return None
        # arXiv 时间格式示例: 2024-11-01T18:00:02Z
        return date.fromisoformat(value[:10])
