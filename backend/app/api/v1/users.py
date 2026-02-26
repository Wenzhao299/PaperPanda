from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.dependencies import get_user_service
from app.schemas.user import UserProfile, UserProfileUpdate, UserSettingsUpdate
from app.services.user_service import UserService

router = APIRouter()


@router.get("/profile", response_model=UserProfile)
async def profile(
    user_id: str = Depends(get_current_user_id),
    service: UserService = Depends(get_user_service),
) -> UserProfile:
    return await service.get_profile(user_id)


@router.put("/profile", response_model=UserProfile)
async def update_profile(
    payload: UserProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    service: UserService = Depends(get_user_service),
) -> UserProfile:
    return await service.update_profile(user_id, payload)


@router.put("/settings", response_model=UserProfile)
async def update_settings(
    payload: UserSettingsUpdate,
    user_id: str = Depends(get_current_user_id),
    service: UserService = Depends(get_user_service),
) -> UserProfile:
    return await service.update_settings(user_id, payload)
