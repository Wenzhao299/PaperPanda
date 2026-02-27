from __future__ import annotations

import asyncio
from typing import Any

from app.ai.embedding.base import deterministic_embedding
from app.config import get_settings


class LocalEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        self.dimension = settings.embedding_dimension
        self.model_name = settings.embedding_local_model_path.strip() or settings.embedding_model_name
        self.device = self._resolve_device(settings.embedding_device)
        self._model: Any | None = None
        self._load_error: str | None = None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        self._ensure_model_loaded()
        if self._model is None:
            return [deterministic_embedding(text, self.dimension) for text in texts]

        try:
            raw_vectors = await asyncio.to_thread(self._encode_sync, texts)
            return [self._align_dimension(vector) for vector in raw_vectors]
        except Exception:
            return [deterministic_embedding(text, self.dimension) for text in texts]

    def _ensure_model_loaded(self) -> None:
        if self._model is not None or self._load_error is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            self._load_error = str(exc)
            return

        try:
            self._model = SentenceTransformer(self.model_name, device=self.device)
        except Exception as exc:
            self._load_error = str(exc)
            self._model = None

    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:
            return [deterministic_embedding(text, self.dimension) for text in texts]
        vectors = self._model.encode(
            texts,
            batch_size=16,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        if hasattr(vectors, "tolist"):
            return [list(map(float, row)) for row in vectors.tolist()]
        return [list(map(float, row)) for row in vectors]

    def _align_dimension(self, vector: list[float]) -> list[float]:
        if len(vector) == self.dimension:
            return vector
        if len(vector) > self.dimension:
            return vector[: self.dimension]
        return vector + [0.0] * (self.dimension - len(vector))

    @staticmethod
    def _resolve_device(raw: str) -> str:
        value = str(raw or "").strip().lower()
        if value == "cpu":
            return "cpu"
        try:
            import torch
        except Exception:
            return "cpu"

        if value in {"", "auto", "cuda"}:
            return "cuda" if torch.cuda.is_available() else "cpu"
        if value.startswith("cuda:"):
            if not torch.cuda.is_available():
                return "cpu"
            try:
                index = int(value.split(":", 1)[1])
            except (TypeError, ValueError):
                return "cuda"
            if index < 0 or index >= torch.cuda.device_count():
                return "cuda"
            return f"cuda:{index}"
        return value
