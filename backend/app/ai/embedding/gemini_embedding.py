from __future__ import annotations

from app.ai.embedding.base import deterministic_embedding
from app.config import get_settings


class GeminiEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        self.dimension = settings.embedding_dimension
        self.model = settings.gemini_embedding_model
        self.api_key = settings.gemini_api_key

    async def embed(self, texts: list[str]) -> list[list[float]]:
        _ = self.model
        _ = self.api_key
        return [deterministic_embedding(text, self.dimension) for text in texts]
