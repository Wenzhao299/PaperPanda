from __future__ import annotations

from typing import Protocol


class LLMProvider(Protocol):
    async def chat(self, messages: list[dict], model: str | None = None, stream: bool = False) -> str: ...
