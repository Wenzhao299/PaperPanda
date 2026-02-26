from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.dependencies import get_chat_service
from app.schemas.auth import MessageResponse
from app.schemas.chat import (
    ChatMessageCreateRequest,
    ChatMessageOut,
    ChatSendResponse,
    ChatSessionCreateRequest,
    ChatSessionOut,
)
from app.services.chat_service import ChatService

router = APIRouter()


@router.post("/sessions", response_model=ChatSessionOut)
async def create_session(
    payload: ChatSessionCreateRequest,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
) -> ChatSessionOut:
    return await service.create_session(user_id=user_id, payload=payload)


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
) -> list[ChatSessionOut]:
    return await service.list_sessions(user_id=user_id)


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
) -> MessageResponse:
    await service.delete_session(user_id=user_id, session_id=session_id)
    return MessageResponse(message="Session deleted.")


@router.post("/sessions/{session_id}/messages", response_model=ChatSendResponse)
async def send_message(
    session_id: str,
    payload: ChatMessageCreateRequest,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
) -> ChatSendResponse:
    return await service.send_message(user_id=user_id, session_id=session_id, payload=payload)


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
async def list_messages(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    service: ChatService = Depends(get_chat_service),
) -> list[ChatMessageOut]:
    return await service.list_messages(user_id=user_id, session_id=session_id)
