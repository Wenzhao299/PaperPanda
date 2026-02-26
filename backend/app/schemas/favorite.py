from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FavoriteCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class FavoriteUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class FavoriteAddPaperRequest(BaseModel):
    paper_id: str


class FavoriteSortItem(BaseModel):
    paper_id: str
    sort_order: int = Field(ge=0)


class FavoriteSortRequest(BaseModel):
    items: list[FavoriteSortItem]


class FavoriteExportQuery(BaseModel):
    format: Literal["json", "csv", "bibtex"] = "json"


class FavoriteOut(BaseModel):
    id: str
    name: str
    sort_order: int
    item_count: int
    created_at: datetime
    updated_at: datetime


class FavoriteItemOut(BaseModel):
    paper_id: str
    arxiv_id: str
    title: str
    sort_order: int


class FavoriteDetailOut(BaseModel):
    id: str
    name: str
    items: list[FavoriteItemOut]
