from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    id: str
    email: str
    nickname: str
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class UserProfileUpdate(BaseModel):
    nickname: str = Field(min_length=0, max_length=100)


class UserSettingsUpdate(BaseModel):
    settings: dict[str, Any]
