from __future__ import annotations

from typing import Any


class OpenAIProvider:
    def __init__(self, api_key: str, api_base: str, default_model: str) -> None:
        self.api_key = api_key
        self.api_base = api_base
        self.default_model = default_model

    async def chat(self, messages: list[dict[str, Any]], model: str | None = None, stream: bool = False) -> str:
        _ = stream  # 流式输出在后续版本接入
        if not self.api_key:
            return self._fallback_response(messages)

        try:
            from openai import AsyncOpenAI
        except ImportError:
            return self._fallback_response(messages)

        client = AsyncOpenAI(api_key=self.api_key, base_url=self.api_base)
        response = await client.chat.completions.create(
            model=model or self.default_model,
            messages=messages,
            temperature=0.2,
        )
        return (response.choices[0].message.content or "").strip() or self._fallback_response(messages)

    def _fallback_response(self, messages: list[dict[str, Any]]) -> str:
        last_user = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                last_user = str(message.get("content", "")).strip()
                break
        if not last_user:
            return "I need more context to answer."
        return f"[mock-openai] {last_user[:500]}"
