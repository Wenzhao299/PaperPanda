from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.dependencies import get_auth_service
from app.schemas.auth import (
    AuthResponse,
    MessageResponse,
    RefreshTokenRequest,
    ResetPasswordRequest,
    RegisterRequest,
    SendCodeRequest,
    LoginRequest,
    TokenPair,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/send-code", response_model=MessageResponse)
async def send_code(
    payload: SendCodeRequest,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    await service.send_code(payload)
    return MessageResponse(message="Verification code sent.")


@router.post("/register", response_model=AuthResponse)
async def register(
    payload: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    return await service.register(payload)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> AuthResponse:
    return await service.login(payload)


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    payload: RefreshTokenRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenPair:
    return await service.refresh(payload.refresh_token)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    await service.reset_password(payload)
    return MessageResponse(message="Password has been reset.")


@router.post("/logout", response_model=MessageResponse)
async def logout(
    user_id: str = Depends(get_current_user_id),
    service: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    await service.logout(user_id)
    return MessageResponse(message="Logged out.")
