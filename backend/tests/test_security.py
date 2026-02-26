from __future__ import annotations

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_verify_roundtrip() -> None:
    raw = "Phase123456"
    hashed = hash_password(raw)
    assert hashed
    assert verify_password(raw, hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_roundtrip() -> None:
    token = create_access_token("user-1")
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "user-1"
    assert payload["type"] == "access"


def test_refresh_token_roundtrip() -> None:
    token = create_refresh_token("user-2")
    payload = decode_token(token, expected_type="refresh")
    assert payload["sub"] == "user-2"
    assert payload["type"] == "refresh"
