from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import PaginationParams, get_current_user_id, get_optional_user_id, pagination_params
from app.dependencies import get_search_service
from app.schemas.search import (
    PaperViewHistoryCreateRequest,
    PaperViewHistoryItem,
    SearchHistoryItem,
    SearchRequest,
    SearchResponse,
)
from app.services.search_service import SearchService

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def semantic_search(
    payload: SearchRequest,
    user_id: str | None = Depends(get_optional_user_id),
    service: SearchService = Depends(get_search_service),
) -> SearchResponse:
    return await service.semantic_search(payload=payload, user_id=user_id)


@router.get("/history", response_model=list[SearchHistoryItem])
async def search_history(
    page: PaginationParams = Depends(pagination_params),
    user_id: str = Depends(get_current_user_id),
    service: SearchService = Depends(get_search_service),
) -> list[SearchHistoryItem]:
    return await service.list_history(user_id=user_id, page=page.page, page_size=page.page_size)


@router.get("/history/views", response_model=list[PaperViewHistoryItem])
async def paper_view_history(
    page: PaginationParams = Depends(pagination_params),
    user_id: str = Depends(get_current_user_id),
    service: SearchService = Depends(get_search_service),
) -> list[PaperViewHistoryItem]:
    return await service.list_paper_views(user_id=user_id, page=page.page, page_size=page.page_size)


@router.post("/history/views", response_model=PaperViewHistoryItem)
async def save_paper_view(
    payload: PaperViewHistoryCreateRequest,
    user_id: str = Depends(get_current_user_id),
    service: SearchService = Depends(get_search_service),
) -> PaperViewHistoryItem:
    return await service.save_paper_view(user_id=user_id, paper_id=payload.paper_id)
