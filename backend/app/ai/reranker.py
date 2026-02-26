from __future__ import annotations

from collections.abc import Sequence
from typing import Any


class Reranker:
    async def rerank(self, query: str, candidates: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        query_terms = {term.strip().lower() for term in query.split() if term.strip()}

        def score(candidate: dict[str, Any]) -> tuple[int, int]:
            text = f"{candidate.get('title', '')} {candidate.get('abstract', '')}".lower()
            overlap = sum(1 for term in query_terms if term in text)
            return overlap, len(text)

        return sorted(candidates, key=score, reverse=True)
