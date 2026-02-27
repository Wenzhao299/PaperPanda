from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_user_id
from app.dependencies import get_knowledge_base_service
from app.schemas.auth import MessageResponse
from app.schemas.knowledge_base import (
    KnowledgeBaseAddPaperRequest,
    KnowledgeBaseChatRequest,
    KnowledgeBaseChatResponse,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseOut,
    KnowledgeDocumentOut,
    KnowledgeDocumentUpdateRequest,
    KnowledgeBaseUpdateRequest,
)
from app.services.knowledge_base_service import KnowledgeBaseService

router = APIRouter()


@router.get("", response_model=list[KnowledgeBaseOut])
async def list_knowledge_bases(
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> list[KnowledgeBaseOut]:
    return await service.list_bases(user_id=user_id)


@router.post("", response_model=KnowledgeBaseOut)
async def create_knowledge_base(
    payload: KnowledgeBaseCreateRequest,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeBaseOut:
    return await service.create_base(user_id=user_id, payload=payload)


@router.patch("/{knowledge_base_id}", response_model=KnowledgeBaseOut)
async def update_knowledge_base(
    knowledge_base_id: str,
    payload: KnowledgeBaseUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeBaseOut:
    return await service.update_base(user_id=user_id, knowledge_base_id=knowledge_base_id, payload=payload)


@router.delete("/{knowledge_base_id}", response_model=MessageResponse)
async def delete_knowledge_base(
    knowledge_base_id: str,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> MessageResponse:
    await service.delete_base(user_id=user_id, knowledge_base_id=knowledge_base_id)
    return MessageResponse(message="Knowledge base deleted.")


@router.get("/{knowledge_base_id}/documents", response_model=list[KnowledgeDocumentOut])
async def list_knowledge_documents(
    knowledge_base_id: str,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> list[KnowledgeDocumentOut]:
    return await service.list_documents(user_id=user_id, knowledge_base_id=knowledge_base_id)


@router.post("/{knowledge_base_id}/documents", response_model=KnowledgeDocumentOut)
async def upload_knowledge_document(
    knowledge_base_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeDocumentOut:
    return await service.upload_document(user_id=user_id, knowledge_base_id=knowledge_base_id, file=file)


@router.post("/{knowledge_base_id}/papers", response_model=KnowledgeDocumentOut)
async def add_paper_document(
    knowledge_base_id: str,
    payload: KnowledgeBaseAddPaperRequest,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeDocumentOut:
    return await service.add_paper_document(user_id=user_id, knowledge_base_id=knowledge_base_id, payload=payload)


@router.delete("/{knowledge_base_id}/documents/{document_id}", response_model=MessageResponse)
async def delete_knowledge_document(
    knowledge_base_id: str,
    document_id: str,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> MessageResponse:
    await service.delete_document(user_id=user_id, knowledge_base_id=knowledge_base_id, document_id=document_id)
    return MessageResponse(message="Document deleted.")


@router.patch("/{knowledge_base_id}/documents/{document_id}", response_model=KnowledgeDocumentOut)
async def update_knowledge_document(
    knowledge_base_id: str,
    document_id: str,
    payload: KnowledgeDocumentUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeDocumentOut:
    return await service.update_document(
        user_id=user_id,
        knowledge_base_id=knowledge_base_id,
        document_id=document_id,
        payload=payload,
    )


@router.post("/{knowledge_base_id}/chat", response_model=KnowledgeBaseChatResponse)
async def chat_knowledge_base(
    knowledge_base_id: str,
    payload: KnowledgeBaseChatRequest,
    user_id: str = Depends(get_current_user_id),
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
) -> KnowledgeBaseChatResponse:
    return await service.chat(user_id=user_id, knowledge_base_id=knowledge_base_id, payload=payload)
