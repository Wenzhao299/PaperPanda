from __future__ import annotations

import uuid

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm.router import LLMRouter
from app.config import get_settings
from app.core.exceptions import AppError
from app.models.chat import ChatMessage, ChatSession
from app.schemas.chat import (
    ChatMessageCreateRequest,
    ChatMessageOut,
    ChatSendResponse,
    ChatSessionCreateRequest,
    ChatSessionOut,
)


class ChatService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.router = LLMRouter()

    async def create_session(self, user_id: str, payload: ChatSessionCreateRequest) -> ChatSessionOut:
        uid = self._parse_uuid(user_id, "user")
        settings = get_settings()

        session = ChatSession(
            user_id=uid,
            title=payload.title.strip() or "新对话",
            context_type=payload.context_type,
            context_refs=payload.context_refs,
            llm_provider=payload.llm_provider or settings.default_llm_provider,
            llm_model=payload.llm_model or settings.default_chat_model,
        )
        self.db.add(session)
        await self.db.flush()
        return self._session_to_schema(session)

    async def list_sessions(self, user_id: str) -> list[ChatSessionOut]:
        uid = self._parse_uuid(user_id, "user")
        rows = await self.db.scalars(
            select(ChatSession)
            .where(ChatSession.user_id == uid)
            .order_by(ChatSession.updated_at.desc(), ChatSession.created_at.desc())
        )
        return [self._session_to_schema(session) for session in rows]

    async def delete_session(self, user_id: str, session_id: str) -> None:
        session = await self._get_owned_session(user_id, session_id)
        await self.db.delete(session)
        await self.db.flush()

    async def send_message(
        self,
        user_id: str,
        session_id: str,
        payload: ChatMessageCreateRequest,
    ) -> ChatSendResponse:
        session = await self._get_owned_session(user_id, session_id)

        user_message = ChatMessage(
            session_id=session.id,
            role="user",
            content=payload.content.strip(),
            message_metadata=payload.metadata,
        )
        self.db.add(user_message)
        await self.db.flush()

        prompt_messages = [
            {
                "role": "system",
                "content": "You are PaperPanda assistant. Answer based on provided context and be concise.",
            },
            {"role": "user", "content": payload.content.strip()},
        ]
        assistant_content = await self.router.chat(
            messages=prompt_messages,
            provider=session.llm_provider,
            model=session.llm_model,
            stream=False,
        )

        assistant_message = ChatMessage(
            session_id=session.id,
            role="assistant",
            content=assistant_content,
            message_metadata={"provider": session.llm_provider, "model": session.llm_model},
        )
        self.db.add(assistant_message)
        await self.db.flush()

        return ChatSendResponse(
            user_message=self._message_to_schema(user_message),
            assistant_message=self._message_to_schema(assistant_message),
        )

    async def list_messages(self, user_id: str, session_id: str) -> list[ChatMessageOut]:
        session = await self._get_owned_session(user_id, session_id)
        rows = await self.db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
        )
        return [self._message_to_schema(message) for message in rows]

    async def _get_owned_session(self, user_id: str, session_id: str) -> ChatSession:
        uid = self._parse_uuid(user_id, "user")
        sid = self._parse_uuid(session_id, "session")
        session = await self.db.scalar(select(ChatSession).where(ChatSession.id == sid, ChatSession.user_id == uid))
        if not session:
            raise AppError("Chat session not found.", status_code=status.HTTP_404_NOT_FOUND, code="session_not_found")
        return session

    @staticmethod
    def _session_to_schema(session: ChatSession) -> ChatSessionOut:
        return ChatSessionOut(
            id=str(session.id),
            title=session.title,
            context_type=session.context_type,
            context_refs=session.context_refs or {},
            llm_provider=session.llm_provider,
            llm_model=session.llm_model,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

    @staticmethod
    def _message_to_schema(message: ChatMessage) -> ChatMessageOut:
        return ChatMessageOut(
            id=str(message.id),
            session_id=str(message.session_id),
            role=message.role,
            content=message.content,
            metadata=message.message_metadata or {},
            created_at=message.created_at,
        )

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
