from __future__ import annotations

from datetime import UTC, datetime

from fastapi import status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_verification_email
from app.core.exceptions import AppError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_verification_code,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, ResetPasswordRequest, SendCodeRequest, TokenPair


class AuthService:
    CODE_TTL_SECONDS = 600
    CODE_COOLDOWN_SECONDS = 60
    ALLOWED_PURPOSES = {"register", "reset_password"}

    def __init__(self, db: AsyncSession, redis_client: Redis) -> None:
        self.db = db
        self.redis = redis_client

    async def send_code(self, payload: SendCodeRequest) -> None:
        if payload.purpose not in self.ALLOWED_PURPOSES:
            raise AppError(
                "Unsupported verification purpose.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="invalid_purpose",
            )

        email = payload.email.strip().lower()
        cooldown_key = f"email:verify:cooldown:{email}"
        if await self.redis.exists(cooldown_key):
            raise AppError(
                "Please wait before requesting another code.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                code="too_many_requests",
            )

        code = generate_verification_code()
        key = self._verification_key(email)
        value = f"{payload.purpose}:{code}"

        await self.redis.setex(key, self.CODE_TTL_SECONDS, value)
        await self.redis.setex(cooldown_key, self.CODE_COOLDOWN_SECONDS, "1")
        await send_verification_email(email, code)

    async def register(self, payload: RegisterRequest) -> AuthResponse:
        email = payload.email.strip().lower()
        await self._validate_verification_code(email=email, expected_code=payload.code, purpose="register")

        existing = await self.db.scalar(select(User).where(User.email == email))
        if existing:
            raise AppError("Email already registered.", status_code=status.HTTP_409_CONFLICT, code="email_exists")

        user = User(
            email=email,
            password_hash=hash_password(payload.password),
            nickname=payload.nickname.strip() or email.split("@")[0],
            settings={"language": "zh", "llm_provider": "deepseek"},
        )
        self.db.add(user)
        await self.db.flush()

        tokens = await self._issue_tokens(str(user.id))
        await self.redis.delete(self._verification_key(email))
        return AuthResponse(user_id=str(user.id), **tokens.model_dump())

    async def login(self, payload: LoginRequest) -> AuthResponse:
        email = payload.email.strip().lower()
        user = await self.db.scalar(select(User).where(User.email == email))
        if not user or not verify_password(payload.password, user.password_hash):
            raise AppError("Invalid email or password.", status_code=status.HTTP_401_UNAUTHORIZED, code="invalid_credentials")

        tokens = await self._issue_tokens(str(user.id))
        return AuthResponse(user_id=str(user.id), **tokens.model_dump())

    async def reset_password(self, payload: ResetPasswordRequest) -> None:
        email = payload.email.strip().lower()
        await self._validate_verification_code(email=email, expected_code=payload.code, purpose="reset_password")

        user = await self.db.scalar(select(User).where(User.email == email))
        if not user:
            raise AppError("User not found.", status_code=status.HTTP_404_NOT_FOUND, code="user_not_found")

        user.password_hash = hash_password(payload.new_password)
        await self.db.flush()

        await self.redis.delete(self._verification_key(email))
        await self.redis.delete(self._refresh_token_key(str(user.id)))

    async def refresh(self, refresh_token: str) -> TokenPair:
        try:
            payload = decode_token(refresh_token, expected_type="refresh")
        except ValueError as exc:
            raise AppError("Invalid refresh token.", status_code=status.HTTP_401_UNAUTHORIZED, code="invalid_token") from exc

        user_id = str(payload.get("sub") or "")
        if not user_id:
            raise AppError("Invalid refresh token payload.", status_code=status.HTTP_401_UNAUTHORIZED, code="invalid_token")

        stored = await self.redis.get(self._refresh_token_key(user_id))
        if not stored or stored != refresh_token:
            raise AppError("Refresh token expired or revoked.", status_code=status.HTTP_401_UNAUTHORIZED, code="token_revoked")

        return await self._issue_tokens(user_id)

    async def logout(self, user_id: str) -> None:
        await self.redis.delete(self._refresh_token_key(user_id))

    async def _issue_tokens(self, user_id: str) -> TokenPair:
        access_token = create_access_token(user_id)
        refresh_token = create_refresh_token(user_id)

        refresh_payload = decode_token(refresh_token, expected_type="refresh")
        exp_value = refresh_payload["exp"]
        if isinstance(exp_value, datetime):
            exp_ts = int(exp_value.timestamp())
        else:
            exp_ts = int(exp_value)
        now_ts = int(datetime.now(UTC).timestamp())
        ttl = max(exp_ts - now_ts, 1)

        await self.redis.setex(self._refresh_token_key(user_id), ttl, refresh_token)
        return TokenPair(access_token=access_token, refresh_token=refresh_token)

    async def _validate_verification_code(self, email: str, expected_code: str, purpose: str) -> None:
        key = self._verification_key(email)
        value = await self.redis.get(key)
        if not value:
            raise AppError("Verification code expired.", status_code=status.HTTP_400_BAD_REQUEST, code="code_expired")

        try:
            code_purpose, code = value.split(":", maxsplit=1)
        except ValueError as exc:
            raise AppError("Verification code invalid.", status_code=status.HTTP_400_BAD_REQUEST, code="invalid_code") from exc

        if code_purpose != purpose or code != expected_code:
            raise AppError("Verification code invalid.", status_code=status.HTTP_400_BAD_REQUEST, code="invalid_code")

    @staticmethod
    def _verification_key(email: str) -> str:
        return f"email:verify:{email}"

    @staticmethod
    def _refresh_token_key(user_id: str) -> str:
        return f"user:token:{user_id}"
