from app.ai.embedding.gemini_embedding import GeminiEmbeddingProvider
from app.ai.embedding.local_embedding import LocalEmbeddingProvider
from app.ai.embedding.openai_embedding import OpenAIEmbeddingProvider
from app.config import get_settings


def build_embedding_provider():
    settings = get_settings()
    if settings.embedding_provider == "openai":
        return OpenAIEmbeddingProvider()
    if settings.embedding_provider == "gemini":
        return GeminiEmbeddingProvider()
    return LocalEmbeddingProvider()


__all__ = [
    "GeminiEmbeddingProvider",
    "LocalEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "build_embedding_provider",
]
