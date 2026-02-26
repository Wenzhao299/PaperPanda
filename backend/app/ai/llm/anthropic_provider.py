from __future__ import annotations

from typing import Any


class AnthropicProvider:
    def __init__(self, api_key: str, default_model: str) -> None:
        self.api_key = api_key
        self.default_model = default_model

    async def chat(self, messages: list[dict[str, Any]], model: str | None = None, stream: bool = False) -> str:
        _ = model
        _ = stream
        return self._fallback_response(messages)

    def _fallback_response(self, messages: list[dict[str, Any]]) -> str:
        last_user = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                last_user = str(message.get("content", "")).strip()
                break
        if not last_user:
            return "[mock-anthropic] Ready for your question."
        return f"[mock-anthropic] {last_user[:500]}"
