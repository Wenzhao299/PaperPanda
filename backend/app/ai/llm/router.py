from __future__ import annotations

from app.ai.llm.anthropic_provider import AnthropicProvider
from app.ai.llm.base import LLMProvider
from app.ai.llm.gemini_provider import GeminiProvider
from app.ai.llm.openai_provider import OpenAIProvider
from app.config import get_settings


class LLMRouter:
    def __init__(self) -> None:
        settings = get_settings()
        self.default_provider = settings.default_llm_provider
        self.providers: dict[str, LLMProvider] = {
            "openai": OpenAIProvider(
                api_key=settings.openai_api_key,
                api_base=settings.openai_api_base,
                default_model=settings.openai_model,
            ),
            "deepseek": OpenAIProvider(
                api_key=settings.deepseek_api_key,
                api_base=settings.deepseek_api_base,
                default_model=settings.deepseek_model,
            ),
            "qwen": OpenAIProvider(
                api_key=settings.qwen_api_key,
                api_base=settings.qwen_api_base,
                default_model=settings.qwen_model,
            ),
            "gemini": GeminiProvider(
                api_key=settings.gemini_api_key,
                default_model=settings.gemini_model,
            ),
            "anthropic": AnthropicProvider(
                api_key=settings.anthropic_api_key,
                default_model=settings.anthropic_model,
            ),
        }

    async def chat(
        self,
        messages: list[dict],
        provider: str | None = None,
        model: str | None = None,
        stream: bool = False,
    ) -> str:
        provider_name = (provider or self.default_provider).lower()
        target_provider = self.providers.get(provider_name)
        if target_provider is None:
            target_provider = self.providers[self.default_provider]
        return await target_provider.chat(messages=messages, model=model, stream=stream)
