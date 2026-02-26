from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import warnings
from datetime import UTC, datetime, timedelta
from secrets import choice
from string import digits
from typing import Any

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.config import get_settings

logger = logging.getLogger(__name__)

PBKDF2_SCHEME = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 390000
PBKDF2_SALT_BYTES = 16


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _hash_pbkdf2(password: str) -> str:
    salt = os.urandom(PBKDF2_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{PBKDF2_SCHEME}${PBKDF2_ITERATIONS}${_b64_encode(salt)}${_b64_encode(digest)}"


def _verify_pbkdf2(password: str, hashed: str) -> bool:
    try:
        scheme, rounds, salt_b64, digest_b64 = hashed.split("$", maxsplit=3)
    except ValueError:
        return False

    if scheme != PBKDF2_SCHEME:
        return False

    try:
        iterations = int(rounds)
        salt = _b64_decode(salt_b64)
        expected = _b64_decode(digest_b64)
    except Exception:
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)


def _verify_legacy_passlib_pbkdf2(password: str, hashed: str) -> bool:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            from passlib.context import CryptContext

        context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
        return context.verify(password, hashed)
    except Exception:
        return False


def hash_password(password: str) -> str:
    try:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except Exception as exc:
        logger.warning("bcrypt backend unavailable, fallback to pbkdf2_sha256: %s", exc)
        return _hash_pbkdf2(password)


def verify_password(password: str, hashed: str) -> bool:
    if hashed.startswith("$2"):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

    if hashed.startswith(f"{PBKDF2_SCHEME}$"):
        return _verify_pbkdf2(password, hashed)

    if hashed.startswith("$pbkdf2-sha256$"):
        return _verify_legacy_passlib_pbkdf2(password, hashed)

    return False


def _create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + expires_delta
    payload: dict[str, Any] = {"sub": subject, "exp": expire, "type": token_type}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    return _create_token(subject, "access", timedelta(minutes=settings.jwt_access_token_expire_minutes))


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    return _create_token(subject, "refresh", timedelta(days=settings.jwt_refresh_token_expire_days))


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except InvalidTokenError as exc:
        raise ValueError("invalid token") from exc

    token_type = payload.get("type")
    if expected_type and token_type != expected_type:
        raise ValueError(f"invalid token type: expected {expected_type}")
    return payload


def generate_verification_code(length: int = 6) -> str:
    return "".join(choice(digits) for _ in range(length))
