from __future__ import annotations

import csv
import io
import json
import uuid

from fastapi import status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.favorite import Favorite, FavoriteItem
from app.models.paper import Paper
from app.schemas.favorite import (
    FavoriteAddPaperRequest,
    FavoriteCreateRequest,
    FavoriteDetailOut,
    FavoriteItemOut,
    FavoriteOut,
    FavoriteSortRequest,
    FavoriteUpdateRequest,
)


class FavoriteService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_favorites(self, user_id: str) -> list[FavoriteOut]:
        uid = self._parse_uuid(user_id, "user")
        favorites = await self.db.scalars(
            select(Favorite).where(Favorite.user_id == uid).order_by(Favorite.sort_order.asc(), Favorite.created_at.asc())
        )
        result: list[FavoriteOut] = []
        for favorite in favorites:
            item_count = int(
                (
                    await self.db.execute(
                        select(func.count()).select_from(FavoriteItem).where(FavoriteItem.favorite_id == favorite.id)
                    )
                ).scalar_one()
            )
            result.append(
                FavoriteOut(
                    id=str(favorite.id),
                    name=favorite.name,
                    sort_order=favorite.sort_order,
                    item_count=item_count,
                    created_at=favorite.created_at,
                    updated_at=favorite.updated_at,
                )
            )
        return result

    async def create_favorite(self, user_id: str, payload: FavoriteCreateRequest) -> FavoriteOut:
        uid = self._parse_uuid(user_id, "user")
        max_sort = await self.db.scalar(
            select(func.coalesce(func.max(Favorite.sort_order), 0)).where(Favorite.user_id == uid)
        )
        favorite = Favorite(user_id=uid, name=payload.name.strip(), sort_order=int(max_sort) + 1)
        self.db.add(favorite)
        await self.db.flush()
        return FavoriteOut(
            id=str(favorite.id),
            name=favorite.name,
            sort_order=favorite.sort_order,
            item_count=0,
            created_at=favorite.created_at,
            updated_at=favorite.updated_at,
        )

    async def update_favorite(self, user_id: str, favorite_id: str, payload: FavoriteUpdateRequest) -> FavoriteOut:
        favorite = await self._get_owned_favorite(user_id, favorite_id)
        favorite.name = payload.name.strip()
        await self.db.flush()
        item_count = int(
            (
                await self.db.execute(
                    select(func.count()).select_from(FavoriteItem).where(FavoriteItem.favorite_id == favorite.id)
                )
            ).scalar_one()
        )
        return FavoriteOut(
            id=str(favorite.id),
            name=favorite.name,
            sort_order=favorite.sort_order,
            item_count=item_count,
            created_at=favorite.created_at,
            updated_at=favorite.updated_at,
        )

    async def delete_favorite(self, user_id: str, favorite_id: str) -> None:
        favorite = await self._get_owned_favorite(user_id, favorite_id)
        await self.db.delete(favorite)
        await self.db.flush()

    async def add_paper(self, user_id: str, favorite_id: str, payload: FavoriteAddPaperRequest) -> FavoriteDetailOut:
        favorite = await self._get_owned_favorite(user_id, favorite_id)
        paper_uuid = self._parse_uuid(payload.paper_id, "paper")

        paper = await self.db.scalar(select(Paper).where(Paper.id == paper_uuid))
        if not paper:
            raise AppError("Paper not found.", status_code=status.HTTP_404_NOT_FOUND, code="paper_not_found")

        existing = await self.db.scalar(
            select(FavoriteItem).where(FavoriteItem.favorite_id == favorite.id, FavoriteItem.paper_id == paper_uuid)
        )
        if existing:
            return await self.get_favorite_detail(user_id, favorite_id)

        max_sort = await self.db.scalar(
            select(func.coalesce(func.max(FavoriteItem.sort_order), 0)).where(FavoriteItem.favorite_id == favorite.id)
        )
        self.db.add(FavoriteItem(favorite_id=favorite.id, paper_id=paper_uuid, sort_order=int(max_sort) + 1))
        await self.db.flush()
        return await self.get_favorite_detail(user_id, favorite_id)

    async def remove_paper(self, user_id: str, favorite_id: str, paper_id: str) -> None:
        favorite = await self._get_owned_favorite(user_id, favorite_id)
        paper_uuid = self._parse_uuid(paper_id, "paper")
        item = await self.db.scalar(
            select(FavoriteItem).where(FavoriteItem.favorite_id == favorite.id, FavoriteItem.paper_id == paper_uuid)
        )
        if not item:
            raise AppError("Favorite item not found.", status_code=status.HTTP_404_NOT_FOUND, code="favorite_item_not_found")
        await self.db.delete(item)
        await self.db.flush()

    async def sort_items(self, user_id: str, favorite_id: str, payload: FavoriteSortRequest) -> FavoriteDetailOut:
        favorite = await self._get_owned_favorite(user_id, favorite_id)

        item_map: dict[uuid.UUID, FavoriteItem] = {
            item.paper_id: item
            for item in await self.db.scalars(select(FavoriteItem).where(FavoriteItem.favorite_id == favorite.id))
        }

        for row in payload.items:
            paper_uuid = self._parse_uuid(row.paper_id, "paper")
            item = item_map.get(paper_uuid)
            if item is None:
                raise AppError(
                    f"Paper {row.paper_id} is not in this favorite.",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="invalid_sort_payload",
                )
            item.sort_order = row.sort_order

        await self.db.flush()
        return await self.get_favorite_detail(user_id, favorite_id)

    async def get_favorite_detail(self, user_id: str, favorite_id: str) -> FavoriteDetailOut:
        favorite = await self._get_owned_favorite(user_id, favorite_id)
        stmt: Select = (
            select(FavoriteItem, Paper)
            .join(Paper, Paper.id == FavoriteItem.paper_id)
            .where(FavoriteItem.favorite_id == favorite.id)
            .order_by(FavoriteItem.sort_order.asc(), FavoriteItem.created_at.asc())
        )
        rows = await self.db.execute(stmt)

        items = [
            FavoriteItemOut(
                paper_id=str(favorite_item.paper_id),
                arxiv_id=paper.arxiv_id,
                title=paper.title,
                sort_order=favorite_item.sort_order,
            )
            for favorite_item, paper in rows.all()
        ]
        return FavoriteDetailOut(id=str(favorite.id), name=favorite.name, items=items)

    async def export_favorite(self, user_id: str, favorite_id: str, fmt: str) -> tuple[str, str, str]:
        detail = await self.get_favorite_detail(user_id, favorite_id)
        if fmt == "csv":
            filename = f"favorite-{detail.id}.csv"
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(["paper_id", "arxiv_id", "title", "sort_order"])
            for item in detail.items:
                writer.writerow([item.paper_id, item.arxiv_id, item.title, item.sort_order])
            return filename, "text/csv", buffer.getvalue()

        if fmt == "bibtex":
            filename = f"favorite-{detail.id}.bib"
            blocks = [
                f"@misc{{{item.arxiv_id},\n  title={{ {item.title} }},\n  howpublished={{arXiv:{item.arxiv_id}}}\n}}"
                for item in detail.items
            ]
            return filename, "text/plain", "\n\n".join(blocks)

        filename = f"favorite-{detail.id}.json"
        return filename, "application/json", json.dumps(detail.model_dump(), ensure_ascii=False, indent=2)

    async def _get_owned_favorite(self, user_id: str, favorite_id: str) -> Favorite:
        uid = self._parse_uuid(user_id, "user")
        fid = self._parse_uuid(favorite_id, "favorite")
        favorite = await self.db.scalar(select(Favorite).where(Favorite.id == fid, Favorite.user_id == uid))
        if not favorite:
            raise AppError("Favorite not found.", status_code=status.HTTP_404_NOT_FOUND, code="favorite_not_found")
        return favorite

    @staticmethod
    def _parse_uuid(value: str, field: str) -> uuid.UUID:
        try:
            return uuid.UUID(value)
        except ValueError as exc:
            raise AppError(
                f"Invalid {field} id.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code=f"invalid_{field}_id",
            ) from exc
