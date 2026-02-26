"""
Redis 客户端管理
"""

from __future__ import annotations

import redis.asyncio as aioredis

from app.config import get_settings

_redis_client: aioredis.Redis | None = None


async def init_redis() -> None:
    """初始化 Redis 连接"""
    global _redis_client
    settings = get_settings()
    _redis_client = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )


async def close_redis() -> None:
    """关闭 Redis 连接"""
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()


def get_redis() -> aioredis.Redis:
    """获取 Redis 客户端"""
    if _redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis_client
