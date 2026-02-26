from __future__ import annotations

from app.ai.embedding.base import deterministic_embedding
from app.config import get_settings


class LocalEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        self.dimension = settings.embedding_dimension

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [deterministic_embedding(text, self.dimension) for text in texts]
