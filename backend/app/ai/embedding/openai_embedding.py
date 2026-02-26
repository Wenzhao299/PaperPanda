from __future__ import annotations

from app.ai.embedding.base import deterministic_embedding
from app.config import get_settings


class OpenAIEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.openai_api_key
        self.api_base = settings.openai_api_base
        self.model = settings.openai_embedding_model
        self.dimension = settings.embedding_dimension

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.api_key:
            return [deterministic_embedding(text, self.dimension) for text in texts]

        try:
            from openai import AsyncOpenAI
        except ImportError:
            return [deterministic_embedding(text, self.dimension) for text in texts]

        client = AsyncOpenAI(api_key=self.api_key, base_url=self.api_base)
        response = await client.embeddings.create(model=self.model, input=texts)
        vectors = [item.embedding for item in response.data]
        return [list(vector) for vector in vectors]
