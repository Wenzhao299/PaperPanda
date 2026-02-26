from __future__ import annotations

import uuid

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.user import User
from app.schemas.user import UserProfile, UserProfileUpdate, UserSettingsUpdate


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_profile(self, user_id: str) -> UserProfile:
        user = await self._get_user(user_id)
        return self._to_schema(user)

    async def update_profile(self, user_id: str, payload: UserProfileUpdate) -> UserProfile:
        user = await self._get_user(user_id)
        user.nickname = payload.nickname.strip()
        await self.db.flush()
        return self._to_schema(user)

    async def update_settings(self, user_id: str, payload: UserSettingsUpdate) -> UserProfile:
        user = await self._get_user(user_id)
        current = dict(user.settings or {})
        current.update(payload.settings)
        user.settings = current
        await self.db.flush()
        return self._to_schema(user)

    async def _get_user(self, user_id: str) -> User:
        try:
            uid = uuid.UUID(user_id)
        except ValueError as exc:
            raise AppError("Invalid user id.", status_code=status.HTTP_400_BAD_REQUEST, code="invalid_user_id") from exc

        user = await self.db.scalar(select(User).where(User.id == uid))
        if not user:
            raise AppError("User not found.", status_code=status.HTTP_404_NOT_FOUND, code="user_not_found")
        return user

    @staticmethod
    def _to_schema(user: User) -> UserProfile:
        return UserProfile(
            id=str(user.id),
            email=user.email,
            nickname=user.nickname,
            settings=user.settings or {},
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
