from __future__ import annotations

from fastapi import Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.db.redis import get_redis
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.favorite_service import FavoriteService
from app.services.paper_service import PaperService
from app.services.search_service import SearchService
from app.services.user_service import UserService


def get_redis_client() -> Redis:
    return get_redis()


def get_auth_service(
    db: AsyncSession = Depends(get_db_session),
    redis_client: Redis = Depends(get_redis_client),
) -> AuthService:
    return AuthService(db=db, redis_client=redis_client)


def get_user_service(db: AsyncSession = Depends(get_db_session)) -> UserService:
    return UserService(db=db)


def get_search_service(db: AsyncSession = Depends(get_db_session)) -> SearchService:
    return SearchService(db=db)


def get_paper_service(db: AsyncSession = Depends(get_db_session)) -> PaperService:
    return PaperService(db=db)


def get_chat_service(db: AsyncSession = Depends(get_db_session)) -> ChatService:
    return ChatService(db=db)


def get_favorite_service(db: AsyncSession = Depends(get_db_session)) -> FavoriteService:
    return FavoriteService(db=db)
