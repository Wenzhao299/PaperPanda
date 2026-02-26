"""
Milvus 向量数据库客户端管理
"""

from __future__ import annotations

from pymilvus import MilvusClient

from app.config import get_settings

_milvus_client: MilvusClient | None = None
ABSTRACT_COLLECTION = "paper_abstracts"
KNOWLEDGE_COLLECTION = "knowledge_chunks"


def init_milvus() -> MilvusClient:
    """初始化 Milvus 连接"""
    global _milvus_client
    settings = get_settings()
    _milvus_client = MilvusClient(
        uri=f"http://{settings.milvus_host}:{settings.milvus_port}",
        timeout=3,
    )
    return _milvus_client


def get_milvus() -> MilvusClient:
    """获取 Milvus 客户端"""
    if _milvus_client is None:
        return init_milvus()
    return _milvus_client


def close_milvus() -> None:
    """关闭 Milvus 连接"""
    global _milvus_client
    _milvus_client = None


def ensure_milvus_collections(client: MilvusClient | None = None) -> list[str]:
    target = client or get_milvus()
    settings = get_settings()
    created: list[str] = []

    for name in (ABSTRACT_COLLECTION, KNOWLEDGE_COLLECTION):
        if target.has_collection(name):
            continue
        target.create_collection(
            collection_name=name,
            dimension=settings.embedding_dimension,
            metric_type="COSINE",
            consistency_level="Strong",
        )
        created.append(name)
    return created
