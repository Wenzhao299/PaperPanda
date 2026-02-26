from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_paper_service
from app.schemas.paper import PaperDetailResponse, PaperFulltextResponse
from app.services.paper_service import PaperService

router = APIRouter()


@router.get("/{paper_id}", response_model=PaperDetailResponse)
async def get_paper(
    paper_id: str,
    service: PaperService = Depends(get_paper_service),
) -> PaperDetailResponse:
    return await service.get_paper(paper_id)


@router.get("/{paper_id}/fulltext", response_model=PaperFulltextResponse)
async def get_fulltext(
    paper_id: str,
    service: PaperService = Depends(get_paper_service),
) -> PaperFulltextResponse:
    return await service.get_fulltext(paper_id)
