from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

from app.ai.llm.router import LLMRouter
from app.config import get_settings

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)
_logger = logging.getLogger(__name__)


class Reranker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.router = LLMRouter()
        self.last_applied = False
        self.last_used_providers: list[str] = []
        self.last_reason: str | None = None
        self.last_provider_errors: dict[str, str] = {}

    async def rerank(
        self,
        query: str,
        candidates: Sequence[dict[str, Any]],
        top_n: int | None = None,
    ) -> list[dict[str, Any]]:
        self.last_applied = False
        self.last_used_providers = []
        self.last_reason = None
        self.last_provider_errors = {}

        if not candidates:
            self.last_reason = "no_candidates"
            return []

        query_terms = {term.strip().lower() for term in query.split() if term.strip()}
        prepared = [dict(item) for item in candidates]

        for item in prepared:
            baseline = self._baseline_score(query=query, query_terms=query_terms, candidate=item)
            item["baseline_score"] = baseline
            item["rerank_score"] = baseline
            item["llm_score"] = None

        baseline_sorted = sorted(prepared, key=lambda item: float(item.get("baseline_score", 0.0)), reverse=True)
        providers = self._provider_list()
        if not self.settings.rerank_enable_llm or not providers:
            self.last_reason = "llm_rerank_disabled_or_no_provider"
            return baseline_sorted[:top_n] if top_n else baseline_sorted

        llm_scope = max(1, min(self.settings.rerank_llm_top_k, len(baseline_sorted)))
        shortlist = baseline_sorted[:llm_scope]
        llm_scores, used_providers, provider_errors = await self._multi_llm_scores(
            query=query,
            candidates=shortlist,
            providers=providers,
        )
        if not llm_scores and self.settings.non_chat_local_only:
            fallback_providers = [
                name for name in self.router.providers if name.startswith("local_") and name not in providers
            ]
            if fallback_providers:
                fallback_scores, fallback_used, fallback_errors = await self._multi_llm_scores(
                    query=query,
                    candidates=shortlist,
                    providers=fallback_providers,
                )
                llm_scores.extend(fallback_scores)
                used_providers.extend(fallback_used)
                provider_errors.update(fallback_errors)
        self.last_provider_errors = provider_errors
        if not llm_scores:
            self.last_reason = "all_provider_scoring_failed"
            return baseline_sorted[:top_n] if top_n else baseline_sorted
        self.last_applied = bool(used_providers)
        self.last_used_providers = used_providers
        self.last_reason = None if self.last_applied else "no_provider_returned_scores"

        for item in shortlist:
            candidate_id = str(item.get("id", ""))
            score_values = [score_map[candidate_id] for score_map in llm_scores if candidate_id in score_map]
            llm_score = sum(score_values) / len(score_values) if score_values else None
            base_score = float(item.get("baseline_score", 0.0))
            if llm_score is None:
                item["rerank_score"] = base_score
                item["llm_score"] = None
                continue
            item["llm_score"] = llm_score
            item["rerank_score"] = 0.65 * base_score + 0.35 * llm_score

        shortlist_sorted = sorted(shortlist, key=lambda item: float(item.get("rerank_score", 0.0)), reverse=True)
        merged = [*shortlist_sorted, *baseline_sorted[llm_scope:]]
        return merged[:top_n] if top_n else merged

    async def _multi_llm_scores(
        self,
        query: str,
        candidates: Sequence[dict[str, Any]],
        providers: list[str],
    ) -> tuple[list[dict[str, float]], list[str], dict[str, str]]:
        tasks = [self._score_with_provider(query=query, candidates=candidates, provider=provider) for provider in providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        scores: list[dict[str, float]] = []
        used_providers: list[str] = []
        provider_errors: dict[str, str] = {}
        for provider, result in zip(providers, results, strict=False):
            if isinstance(result, Exception):
                provider_errors[provider] = f"{type(result).__name__}: {str(result)[:240]}"
                continue
            score_map, reason = result
            if score_map:
                scores.append(score_map)
                used_providers.append(provider)
            elif reason:
                provider_errors[provider] = reason
        return scores, used_providers, provider_errors

    async def _score_with_provider(
        self,
        query: str,
        candidates: Sequence[dict[str, Any]],
        provider: str,
    ) -> tuple[dict[str, float], str | None]:
        candidate_items = [
            {
                "id": str(item.get("id", "")),
                "title": str(item.get("title", ""))[:300],
                "abstract": str(item.get("abstract", ""))[:420],
                "semantic_score": float(item.get("semantic_score", 0.0)),
                "keyword_score": float(item.get("keyword_score", 0.0)),
            }
            for item in candidates
        ]
        prompt_payload = {
            "query": query,
            "task": "Score each candidate relevance from 0 to 1 for scientific paper search.",
            "candidates": candidate_items,
            "output_format": {"scores": [{"id": "<candidate id>", "score": 0.0}]},
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a scientific-paper reranker. "
                    "Return strict JSON only, no markdown, no prose."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(prompt_payload, ensure_ascii=False),
            },
        ]
        response = await self.router.chat(
            messages=messages,
            provider=provider,
            model=self.settings.default_rerank_model,
            stream=False,
        )
        if not response.strip():
            return {}, "empty_response"
        data = self._parse_json(response)
        if not data:
            return {}, "invalid_json_output"

        rows = data.get("scores", [])
        if not isinstance(rows, list):
            return {}, "missing_scores_array"

        score_map: dict[str, float] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            candidate_id = str(row.get("id", "")).strip()
            if not candidate_id:
                continue
            raw_score = row.get("score")
            if not isinstance(raw_score, (int, float)):
                continue
            score_map[candidate_id] = max(0.0, min(1.0, float(raw_score)))
        if not score_map:
            return {}, "scores_array_empty"
        return score_map, None

    def _baseline_score(self, query: str, query_terms: set[str], candidate: dict[str, Any]) -> float:
        title = str(candidate.get("title", ""))
        abstract = str(candidate.get("abstract", ""))
        merged_text = f"{title} {abstract}".lower()
        lexical_overlap = self._keyword_overlap(query_terms=query_terms, text=merged_text)

        semantic_score = max(0.0, min(1.0, float(candidate.get("semantic_score", 0.0))))
        keyword_score = max(0.0, min(1.0, float(candidate.get("keyword_score", 0.0))))
        fusion_score = max(0.0, min(1.0, float(candidate.get("fusion_score", 0.0))))
        freshness = self._freshness_score(candidate.get("published_date"))

        query_boost = 0.1 if query and title.lower().startswith(query.lower()[:20]) else 0.0
        return (
            semantic_score * 0.40
            + keyword_score * 0.20
            + fusion_score * 0.25
            + lexical_overlap * 0.10
            + freshness * 0.05
            + query_boost
        )

    @staticmethod
    def _keyword_overlap(query_terms: set[str], text: str) -> float:
        if not query_terms:
            return 0.0
        hit = sum(1 for term in query_terms if term in text)
        return hit / max(len(query_terms), 1)

    @staticmethod
    def _freshness_score(value: Any) -> float:
        published: date | None
        if isinstance(value, date):
            published = value
        elif isinstance(value, str):
            try:
                published = date.fromisoformat(value[:10])
            except ValueError:
                published = None
        else:
            published = None
        if published is None:
            return 0.0
        days = max((datetime.utcnow().date() - published).days, 0)
        if days <= 30:
            return 1.0
        if days <= 365:
            return 0.7
        if days <= 3 * 365:
            return 0.4
        return 0.1

    def _provider_list(self) -> list[str]:
        providers: list[str] = []
        for raw in self.settings.rerank_llm_providers.split(","):
            name = raw.strip().lower()
            if not name:
                continue
            if self.settings.non_chat_local_only and not name.startswith("local_"):
                continue
            if name in self.router.providers:
                providers.append(name)
        if providers:
            return providers
        if self.settings.non_chat_local_only:
            return [name for name in self.router.providers if name.startswith("local_")]
        return providers

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any] | None:
        raw = text.strip()
        if not raw or raw.startswith("[mock-"):
            return None
        try:
            loaded = json.loads(raw)
            return loaded if isinstance(loaded, dict) else None
        except json.JSONDecodeError:
            pass

        match = _JSON_BLOCK.search(raw)
        if not match:
            _logger.debug("rerank output has no json block: %s", raw[:240])
            return None
        try:
            loaded = json.loads(match.group(0))
        except json.JSONDecodeError:
            _logger.debug("rerank json decode failed: %s", raw[:240])
            return None
        return loaded if isinstance(loaded, dict) else None
