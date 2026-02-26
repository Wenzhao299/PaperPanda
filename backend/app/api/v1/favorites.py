from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_current_user_id
from app.dependencies import get_favorite_service
from app.schemas.auth import MessageResponse
from app.schemas.favorite import (
    FavoriteAddPaperRequest,
    FavoriteCreateRequest,
    FavoriteDetailOut,
    FavoriteOut,
    FavoriteSortRequest,
    FavoriteUpdateRequest,
)
from app.services.favorite_service import FavoriteService

router = APIRouter()


@router.get("", response_model=list[FavoriteOut])
async def list_favorites(
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> list[FavoriteOut]:
    return await service.list_favorites(user_id)


@router.post("", response_model=FavoriteOut)
async def create_favorite(
    payload: FavoriteCreateRequest,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> FavoriteOut:
    return await service.create_favorite(user_id, payload)


@router.put("/{favorite_id}", response_model=FavoriteOut)
async def update_favorite(
    favorite_id: str,
    payload: FavoriteUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> FavoriteOut:
    return await service.update_favorite(user_id, favorite_id, payload)


@router.delete("/{favorite_id}", response_model=MessageResponse)
async def delete_favorite(
    favorite_id: str,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> MessageResponse:
    await service.delete_favorite(user_id, favorite_id)
    return MessageResponse(message="Favorite deleted.")


@router.get("/{favorite_id}/detail", response_model=FavoriteDetailOut)
async def get_favorite_detail(
    favorite_id: str,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> FavoriteDetailOut:
    return await service.get_favorite_detail(user_id, favorite_id)


@router.post("/{favorite_id}/papers", response_model=FavoriteDetailOut)
async def add_paper(
    favorite_id: str,
    payload: FavoriteAddPaperRequest,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> FavoriteDetailOut:
    return await service.add_paper(user_id, favorite_id, payload)


@router.delete("/{favorite_id}/papers/{paper_id}", response_model=MessageResponse)
async def remove_paper(
    favorite_id: str,
    paper_id: str,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> MessageResponse:
    await service.remove_paper(user_id, favorite_id, paper_id)
    return MessageResponse(message="Paper removed from favorite.")


@router.put("/{favorite_id}/sort", response_model=FavoriteDetailOut)
async def sort_papers(
    favorite_id: str,
    payload: FavoriteSortRequest,
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> FavoriteDetailOut:
    return await service.sort_items(user_id, favorite_id, payload)


@router.get("/{favorite_id}/export")
async def export_favorite(
    favorite_id: str,
    format: Literal["json", "csv", "bibtex"] = Query(default="json"),
    user_id: str = Depends(get_current_user_id),
    service: FavoriteService = Depends(get_favorite_service),
) -> Response:
    filename, media_type, content = await service.export_favorite(user_id, favorite_id, format)
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return Response(content=content, media_type=media_type, headers=headers)
