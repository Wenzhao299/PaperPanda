from __future__ import annotations

from collections import OrderedDict
from threading import Lock

from app.ai.llm.router import LLMRouter
from app.config import get_settings


class Summarizer:
    def __init__(self) -> None:
        self.router = LLMRouter()
        self.settings = get_settings()
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._cache_lock = Lock()
        self._cache_max = 2048

    async def summarize(self, abstract: str, max_chars: int = 220) -> str:
        raw = abstract.strip()
        if not raw:
            return ""
        if len(raw) <= max_chars:
            return raw
        cache_key = f"{max_chars}::{raw}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        messages = [
            {
                "role": "system",
                "content": (
                    "You summarize scientific paper abstracts. "
                    "Keep key methods/findings and stay factual. "
                    "Return plain text only."
                ),
            },
            {
                "role": "user",
                "content": f"Summarize this abstract in <= {max_chars} characters:\n\n{raw}",
            },
        ]
        provider = self._provider_name()
        if self.settings.non_chat_local_only and not provider:
            return self._truncate(raw, max_chars=max_chars)
        response = await self.router.chat(
            messages=messages,
            provider=provider,
            model=self.settings.default_summarize_model,
            stream=False,
        )
        value = response.strip()
        if not value or value.startswith("[mock-"):
            return self._truncate(raw, max_chars=max_chars)
        if len(value) <= max_chars:
            self._cache_set(cache_key, value)
            return value
        truncated = self._truncate(value, max_chars=max_chars)
        self._cache_set(cache_key, truncated)
        return truncated

    def _provider_name(self) -> str | None:
        preferred = self.settings.default_summarize_provider.strip().lower()
        if self.settings.non_chat_local_only and not preferred.startswith("local_"):
            preferred = "local_llama"
        if preferred in self.router.providers:
            return preferred
        if self.settings.non_chat_local_only:
            for name in self.router.providers:
                if name.startswith("local_"):
                    return name
            return None
        return self.settings.default_llm_provider

    @staticmethod
    def _truncate(value: str, max_chars: int) -> str:
        if len(value) <= max_chars:
            return value
        return f"{value[:max_chars].rstrip()}..."

    def _cache_get(self, key: str) -> str | None:
        with self._cache_lock:
            value = self._cache.get(key)
            if value is None:
                return None
            self._cache.move_to_end(key)
            return value

    def _cache_set(self, key: str, value: str) -> None:
        with self._cache_lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_max:
                self._cache.popitem(last=False)
