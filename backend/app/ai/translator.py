from __future__ import annotations

from collections import OrderedDict
from threading import Lock

from app.ai.llm.router import LLMRouter
from app.config import get_settings


class Translator:
    def __init__(self) -> None:
        self.router = LLMRouter()
        self.settings = get_settings()
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._cache_lock = Lock()
        self._cache_max = 2048

    async def translate(self, text: str, target_lang: str = "zh") -> str:
        raw = text.strip()
        if not raw:
            return ""
        if target_lang.lower().startswith("zh") and self._contains_chinese(raw):
            return raw
        cache_key = f"{target_lang.strip().lower()}::{raw}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an academic translator. "
                    "Translate the user text accurately and concisely. "
                    "Return only translated text."
                ),
            },
            {
                "role": "user",
                "content": f"Target language: {target_lang}\n\nText:\n{raw}",
            },
        ]
        provider = self._provider_name()
        if self.settings.non_chat_local_only and not provider:
            return raw
        translated = await self.router.chat(
            messages=messages,
            provider=provider,
            model=self.settings.default_translate_model,
            stream=False,
        )
        value = translated.strip()
        if not value or value.startswith("[mock-"):
            return raw
        self._cache_set(cache_key, value)
        return value

    def _provider_name(self) -> str | None:
        preferred = self.settings.default_translate_provider.strip().lower()
        if self.settings.non_chat_local_only and not preferred.startswith("local_"):
            preferred = "local_qwen"
        if preferred in self.router.providers:
            return preferred
        if self.settings.non_chat_local_only:
            for name in self.router.providers:
                if name.startswith("local_"):
                    return name
            return None
        return self.settings.default_llm_provider

    @staticmethod
    def _contains_chinese(value: str) -> bool:
        return any("\u4e00" <= ch <= "\u9fff" for ch in value)

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
