"""
PaperPanda 配置管理
使用 pydantic-settings 从环境变量和 .env 文件加载配置
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    """应用配置"""

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- 应用基础配置 ----
    app_name: str = "PaperPanda"
    app_env: Literal["development", "staging", "production"] = "development"
    debug: bool = True
    secret_key: str = "change-this-in-production"
    backend_port: int = 8000

    # ---- PostgreSQL ----
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "paperpanda"
    postgres_password: str = "paperpanda_secret"
    postgres_db: str = "paperpanda"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ---- Redis ----
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""

    @property
    def redis_url(self) -> str:
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/0"
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    # ---- Milvus ----
    milvus_host: str = "localhost"
    milvus_port: int = 19530
    milvus_user: str = ""
    milvus_password: str = ""

    # ---- Meilisearch ----
    meilisearch_host: str = "http://localhost"
    meilisearch_port: int = 7700
    meilisearch_api_key: str = "paperpanda_meili_key"

    @property
    def meilisearch_url(self) -> str:
        return f"{self.meilisearch_host}:{self.meilisearch_port}"

    # ---- JWT 认证 ----
    jwt_secret_key: str = "change-this-jwt-secret-key-min-32-chars"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # ---- 邮件 SMTP ----
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = "PaperPanda"
    smtp_from_email: str = ""
    smtp_use_tls: bool = True

    # ---- LLM 服务 ----
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    qwen_api_key: str = ""
    qwen_api_base: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-plus"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    # ---- 默认 LLM Provider ----
    default_llm_provider: str = "deepseek"
    default_chat_model: str = "deepseek-chat"
    default_translate_model: str = "deepseek-chat"
    default_summarize_model: str = "deepseek-chat"
    default_rerank_model: str = "deepseek-chat"

    # ---- Embedding 配置 ----
    embedding_provider: Literal["local_bge", "local_qwen", "openai", "gemini"] = "local_bge"
    embedding_model_name: str = "BAAI/bge-m3"
    embedding_dimension: int = 1024
    embedding_device: str = "cuda:0"
    openai_embedding_model: str = "text-embedding-3-small"
    gemini_embedding_model: str = "text-embedding-004"
    embedding_local_model_path: str = ""

    # ---- 知识库 PDF 管道（Phase 2）----
    upload_storage_dir: str = "data/uploads"
    upload_max_file_size_mb: int = 30
    knowledge_chunk_size: int = 512
    knowledge_chunk_overlap: int = 64
    knowledge_chat_context_chars: int = 1200

    # ---- arXiv 爬虫配置 ----
    arxiv_categories: str = "cs.AI,cs.CL,cs.CV,cs.LG,cs.IR"
    arxiv_crawl_interval_hours: int = 24
    arxiv_batch_size: int = 100
    arxiv_max_results_per_category: int = 1000

    @property
    def arxiv_category_list(self) -> list[str]:
        return [c.strip() for c in self.arxiv_categories.split(",")]

    # ---- Celery ----
    celery_broker_url: str = ""
    celery_result_backend: str = ""

    @property
    def celery_broker(self) -> str:
        if self.celery_broker_url:
            return self.celery_broker_url
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/1"
        return f"redis://{self.redis_host}:{self.redis_port}/1"

    @property
    def celery_backend(self) -> str:
        if self.celery_result_backend:
            return self.celery_result_backend
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/2"
        return f"redis://{self.redis_host}:{self.redis_port}/2"

    # ---- CORS ----
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # ---- 日志 ----
    log_level: str = "INFO"
    log_format: Literal["json", "console"] = "json"


@lru_cache
def get_settings() -> Settings:
    """获取全局配置单例"""
    return Settings()
