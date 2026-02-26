from __future__ import annotations

from typing import Protocol


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


def deterministic_embedding(text: str, dimension: int) -> list[float]:
    # 轻量占位向量，用于本地开发与测试，后续可无缝替换为真实模型
    seed = sum(ord(c) for c in text)
    return [((seed + i * 31) % 2000) / 1000.0 - 1.0 for i in range(dimension)]
