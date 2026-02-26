from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding import build_embedding_provider
from app.ai.llm.router import LLMRouter
from app.config import get_settings
from app.core.exceptions import AppError
from app.db.milvus import ensure_milvus_collections, get_milvus
from app.models.knowledge_base import KnowledgeBase, KnowledgeChunk, KnowledgeDocument
from app.schemas.knowledge_base import (
    KnowledgeBaseChatRequest,
    KnowledgeBaseChatResponse,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseOut,
    KnowledgeContextChunk,
    KnowledgeDocumentOut,
)


@dataclass(slots=True)
class _ChunkHit:
    chunk: KnowledgeChunk
    document_name: str
    score: float | None


class KnowledgeBaseService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()
        self.embedding_provider = build_embedding_provider()
        self.llm_router = LLMRouter()
        self.upload_root = Path(self.settings.upload_storage_dir).expanduser()
        self.upload_root.mkdir(parents=True, exist_ok=True)

    async def list_bases(self, user_id: str) -> list[KnowledgeBaseOut]:
        uid = self._parse_uuid(user_id, "user")
        bases = list(
            await self.db.scalars(
                select(KnowledgeBase)
                .where(KnowledgeBase.user_id == uid)
                .order_by(KnowledgeBase.updated_at.desc(), KnowledgeBase.created_at.desc())
            )
        )
        if not bases:
            return []

        counts_rows = await self.db.execute(
            select(KnowledgeDocument.knowledge_base_id, func.count(KnowledgeDocument.id))
            .where(KnowledgeDocument.user_id == uid)
            .group_by(KnowledgeDocument.knowledge_base_id)
        )
        counts = {row[0]: int(row[1]) for row in counts_rows}
        return [
            KnowledgeBaseOut(
                id=str(item.id),
                name=item.name,
                description=item.description or "",
                document_count=counts.get(item.id, 0),
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in bases
        ]

    async def create_base(self, user_id: str, payload: KnowledgeBaseCreateRequest) -> KnowledgeBaseOut:
        uid = self._parse_uuid(user_id, "user")
        name = payload.name.strip()
        if not name:
            raise AppError("Knowledge base name is required.", code="invalid_kb_name")

        existing = await self.db.scalar(
            select(KnowledgeBase).where(KnowledgeBase.user_id == uid, KnowledgeBase.name == name)
        )
        if existing:
            raise AppError(
                "Knowledge base name already exists.",
                status_code=status.HTTP_409_CONFLICT,
                code="kb_name_exists",
            )

        kb = KnowledgeBase(user_id=uid, name=name, description=payload.description.strip())
        self.db.add(kb)
        await self.db.flush()
        return KnowledgeBaseOut(
            id=str(kb.id),
            name=kb.name,
            description=kb.description or "",
            document_count=0,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
        )

    async def delete_base(self, user_id: str, knowledge_base_id: str) -> None:
        kb = await self._get_owned_base(user_id=user_id, knowledge_base_id=knowledge_base_id)
        documents = list(
            await self.db.scalars(select(KnowledgeDocument).where(KnowledgeDocument.knowledge_base_id == kb.id))
        )
        milvus_ids = list(
            await self.db.scalars(
                select(KnowledgeChunk.milvus_id)
                .where(KnowledgeChunk.knowledge_base_id == kb.id, KnowledgeChunk.milvus_id != "")
                .order_by(KnowledgeChunk.created_at.asc())
            )
        )

        self._delete_vectors(milvus_ids)
        for doc in documents:
            self._remove_file(Path(doc.file_path))

        await self.db.delete(kb)
        await self.db.flush()

    async def list_documents(self, user_id: str, knowledge_base_id: str) -> list[KnowledgeDocumentOut]:
        kb = await self._get_owned_base(user_id=user_id, knowledge_base_id=knowledge_base_id)
        rows = list(
            await self.db.scalars(
                select(KnowledgeDocument)
                .where(KnowledgeDocument.knowledge_base_id == kb.id)
                .order_by(KnowledgeDocument.created_at.desc())
            )
        )
        return [self._doc_to_schema(row) for row in rows]

    async def upload_document(self, user_id: str, knowledge_base_id: str, file: UploadFile) -> KnowledgeDocumentOut:
        kb = await self._get_owned_base(user_id=user_id, knowledge_base_id=knowledge_base_id)
        if not file.filename:
            raise AppError("Filename is required.", code="missing_filename")
        if not file.filename.lower().endswith(".pdf"):
            raise AppError("Only PDF files are supported.", code="invalid_file_type")

        raw = await file.read()
        if not raw:
            raise AppError("Uploaded file is empty.", code="empty_file")
        if len(raw) > self.settings.upload_max_file_size_mb * 1024 * 1024:
            raise AppError(
                f"File too large. Max {self.settings.upload_max_file_size_mb}MB.",
                code="file_too_large",
            )

        target_dir = self.upload_root / str(kb.user_id) / str(kb.id)
        target_dir.mkdir(parents=True, exist_ok=True)
        safe_name = self._sanitize_filename(file.filename)
        saved_file = target_dir / f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}_{safe_name}"
        saved_file.write_bytes(raw)

        doc = KnowledgeDocument(
            knowledge_base_id=kb.id,
            user_id=kb.user_id,
            file_name=file.filename,
            file_path=str(saved_file),
            file_size=len(raw),
            parse_status="processing",
        )
        self.db.add(doc)
        await self.db.flush()

        try:
            page_chunks, page_count = self._extract_pdf_chunks(saved_file)
            if not page_chunks:
                raise AppError(
                    "No extractable text from PDF. Please upload a text-based PDF.",
                    code="pdf_no_text",
                )
            await self._save_chunks_with_embeddings(kb_id=kb.id, document_id=doc.id, chunk_items=page_chunks)
            doc.page_count = page_count
            doc.chunk_count = len(page_chunks)
            doc.parse_status = "ready"
            doc.parse_error = ""
        except Exception as exc:
            await self.db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id))
            doc.page_count = 0
            doc.chunk_count = 0
            doc.parse_status = "failed"
            doc.parse_error = str(exc)[:2000]

        await self.db.flush()
        await self.db.refresh(doc)
        return self._doc_to_schema(doc)

    async def delete_document(self, user_id: str, knowledge_base_id: str, document_id: str) -> None:
        kb = await self._get_owned_base(user_id=user_id, knowledge_base_id=knowledge_base_id)
        did = self._parse_uuid(document_id, "document")
        doc = await self.db.scalar(
            select(KnowledgeDocument).where(KnowledgeDocument.id == did, KnowledgeDocument.knowledge_base_id == kb.id)
        )
        if not doc:
            raise AppError("Document not found.", status_code=status.HTTP_404_NOT_FOUND, code="document_not_found")

        milvus_ids = list(
            await self.db.scalars(
                select(KnowledgeChunk.milvus_id)
                .where(KnowledgeChunk.document_id == doc.id, KnowledgeChunk.milvus_id != "")
                .order_by(KnowledgeChunk.created_at.asc())
            )
        )
        self._delete_vectors(milvus_ids)
        self._remove_file(Path(doc.file_path))
        await self.db.delete(doc)
        await self.db.flush()

    async def chat(self, user_id: str, knowledge_base_id: str, payload: KnowledgeBaseChatRequest) -> KnowledgeBaseChatResponse:
        kb = await self._get_owned_base(user_id=user_id, knowledge_base_id=knowledge_base_id)
        hits = await self._retrieve_chunks(kb_id=kb.id, query=payload.message.strip(), top_k=payload.top_k)
        if not hits:
            raise AppError(
                "Knowledge base has no parsed chunks yet. Upload a text-based PDF first.",
                status_code=status.HTTP_400_BAD_REQUEST,
                code="kb_no_chunks",
            )

        context_blocks = []
        for idx, hit in enumerate(hits, start=1):
            clipped = self._clip_text(hit.chunk.content, self.settings.knowledge_chat_context_chars)
            context_blocks.append(
                f"[{idx}] document={hit.document_name} chunk={hit.chunk.chunk_index}\n{clipped}"
            )

        messages: list[dict[str, str]] = [
            {
                "role": "system",
                "content": (
                    "You are PaperPanda knowledge-base assistant. "
                    "Answer using only the provided context snippets when possible. "
                    "If context is insufficient, say what is missing."
                ),
            }
        ]
        for item in payload.history[-8:]:
            messages.append({"role": item.role, "content": item.content})

        context_text = "\n\n".join(context_blocks)
        messages.append(
            {
                "role": "user",
                "content": (
                    "Knowledge base context:\n"
                    f"{context_text}\n\n"
                    f"User question:\n{payload.message.strip()}"
                ),
            }
        )

        answer = await self.llm_router.chat(
            messages=messages,
            provider=payload.llm_provider,
            model=payload.llm_model,
            stream=False,
        )
        return KnowledgeBaseChatResponse(
            answer=answer,
            context_chunks=[
                KnowledgeContextChunk(
                    chunk_id=str(hit.chunk.id),
                    document_id=str(hit.chunk.document_id),
                    document_name=hit.document_name,
                    chunk_index=hit.chunk.chunk_index,
                    content=self._clip_text(hit.chunk.content, 400),
                    score=hit.score,
                )
                for hit in hits
            ],
        )

    async def _retrieve_chunks(self, kb_id: uuid.UUID, query: str, top_k: int) -> list[_ChunkHit]:
        semantic_hits = await self._semantic_hits(kb_id=kb_id, query=query, top_k=top_k)
        if semantic_hits:
            return semantic_hits
        return await self._keyword_hits(kb_id=kb_id, query=query, top_k=top_k)

    async def _semantic_hits(self, kb_id: uuid.UUID, query: str, top_k: int) -> list[_ChunkHit]:
        try:
            vector = (await self.embedding_provider.embed([query]))[0]
            client = get_milvus()
            ensure_milvus_collections(client)
            raw_hits = client.search(
                collection_name="knowledge_chunks",
                data=[vector],
                limit=max(top_k * 4, 20),
            )
        except Exception:
            return []

        if not raw_hits:
            return []
        rows = raw_hits[0] if isinstance(raw_hits, list) else []
        if not rows:
            return []

        ordered_ids: list[str] = []
        score_map: dict[str, float | None] = {}
        for item in rows:
            if not isinstance(item, dict):
                continue
            mid = str(item.get("id") or item.get("pk") or "").strip()
            if not mid:
                continue
            ordered_ids.append(mid)
            distance = item.get("distance")
            score_map[mid] = float(distance) if isinstance(distance, (int, float)) else None

        if not ordered_ids:
            return []

        db_rows = await self.db.execute(
            select(KnowledgeChunk, KnowledgeDocument.file_name)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeChunk.knowledge_base_id == kb_id, KnowledgeChunk.milvus_id.in_(ordered_ids))
        )
        by_milvus_id: dict[str, _ChunkHit] = {}
        for chunk, file_name in db_rows.all():
            by_milvus_id[chunk.milvus_id] = _ChunkHit(
                chunk=chunk,
                document_name=file_name,
                score=score_map.get(chunk.milvus_id),
            )

        result: list[_ChunkHit] = []
        for mid in ordered_ids:
            hit = by_milvus_id.get(mid)
            if hit:
                result.append(hit)
            if len(result) >= top_k:
                break
        return result

    async def _keyword_hits(self, kb_id: uuid.UUID, query: str, top_k: int) -> list[_ChunkHit]:
        terms = [t for t in re.split(r"\s+", query.strip()) if len(t) >= 2][:8]
        stmt = (
            select(KnowledgeChunk, KnowledgeDocument.file_name)
            .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
            .where(KnowledgeChunk.knowledge_base_id == kb_id)
            .order_by(KnowledgeChunk.created_at.desc())
            .limit(top_k)
        )
        if terms:
            stmt = stmt.where(or_(*[KnowledgeChunk.content.ilike(f"%{term}%") for term in terms]))

        rows = await self.db.execute(stmt)
        return [
            _ChunkHit(
                chunk=chunk,
                document_name=file_name,
                score=None,
            )
            for chunk, file_name in rows.all()
        ]

    async def _save_chunks_with_embeddings(
        self,
        kb_id: uuid.UUID,
        document_id: uuid.UUID,
        chunk_items: list[dict[str, str | int]],
    ) -> None:
        texts = [str(item["content"]) for item in chunk_items]
        embeddings = await self.embedding_provider.embed(texts)
        if len(embeddings) != len(chunk_items):
            raise RuntimeError("Embedding size mismatch.")

        chunk_rows: list[KnowledgeChunk] = []
        milvus_rows: list[dict[str, object]] = []
        for item, vector in zip(chunk_items, embeddings, strict=True):
            milvus_id_int = self._uuid_to_int64(uuid.uuid4())
            milvus_id = str(milvus_id_int)
            chunk_rows.append(
                KnowledgeChunk(
                    knowledge_base_id=kb_id,
                    document_id=document_id,
                    chunk_index=int(item["chunk_index"]),
                    content=str(item["content"]),
                    section=str(item["section"]),
                    milvus_id=milvus_id,
                )
            )
            milvus_rows.append(
                {
                    "id": milvus_id_int,
                    "knowledge_base_id": str(kb_id),
                    "document_id": str(document_id),
                    "chunk_index": int(item["chunk_index"]),
                    "vector": vector,
                }
            )

        self.db.add_all(chunk_rows)
        await self.db.flush()

        try:
            client = get_milvus()
            ensure_milvus_collections(client)
            client.upsert(collection_name="knowledge_chunks", data=milvus_rows)
        except Exception as exc:
            raise RuntimeError(f"Failed to write vectors to Milvus: {exc}") from exc

    def _extract_pdf_chunks(self, path: Path) -> tuple[list[dict[str, str | int]], int]:
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("Missing dependency: pypdf. Please install it in backend environment.") from exc

        reader = PdfReader(str(path))
        chunk_size = max(32, self.settings.knowledge_chunk_size)
        overlap = max(0, min(self.settings.knowledge_chunk_overlap, chunk_size - 1))

        chunks: list[dict[str, str | int]] = []
        next_index = 0
        page_count = 0
        for page_idx, page in enumerate(reader.pages, start=1):
            page_count += 1
            text = self._normalize_text(page.extract_text() or "")
            if not text:
                continue
            for content in self._chunk_text(text=text, chunk_size=chunk_size, overlap=overlap):
                chunks.append(
                    {
                        "chunk_index": next_index,
                        "section": f"page_{page_idx}",
                        "content": content,
                    }
                )
                next_index += 1
        return chunks, page_count

    @staticmethod
    def _chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
        words = text.split()
        if not words:
            return []
        if len(words) <= chunk_size:
            return [" ".join(words)]

        step = max(1, chunk_size - overlap)
        chunks: list[str] = []
        for start in range(0, len(words), step):
            part = words[start : start + chunk_size]
            if not part:
                break
            chunk = " ".join(part).strip()
            if len(chunk) >= 40:
                chunks.append(chunk)
            if start + chunk_size >= len(words):
                break
        return chunks

    @staticmethod
    def _normalize_text(value: str) -> str:
        text = value.replace("\x00", " ")
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    @staticmethod
    def _clip_text(value: str, max_chars: int) -> str:
        text = value.strip()
        if len(text) <= max_chars:
            return text
        return f"{text[:max_chars].rstrip()}..."

    async def _get_owned_base(self, user_id: str, knowledge_base_id: str) -> KnowledgeBase:
        uid = self._parse_uuid(user_id, "user")
        kid = self._parse_uuid(knowledge_base_id, "knowledge_base")
        kb = await self.db.scalar(select(KnowledgeBase).where(KnowledgeBase.id == kid, KnowledgeBase.user_id == uid))
        if not kb:
            raise AppError(
                "Knowledge base not found.",
                status_code=status.HTTP_404_NOT_FOUND,
                code="knowledge_base_not_found",
            )
        return kb

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
        if not safe.lower().endswith(".pdf"):
            safe = f"{safe}.pdf" if safe else "document.pdf"
        return safe[:180]

    @staticmethod
    def _remove_file(path: Path) -> None:
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            pass

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

    @staticmethod
    def _delete_vectors(milvus_ids: list[str]) -> None:
        if not milvus_ids:
            return
        try:
            client = get_milvus()
            if not client.has_collection("knowledge_chunks"):
                return
            parsed_ids: list[int | str] = []
            for value in milvus_ids:
                stripped = value.strip()
                if stripped.isdigit():
                    parsed_ids.append(int(stripped))
                else:
                    parsed_ids.append(stripped)
            client.delete(collection_name="knowledge_chunks", ids=parsed_ids)
        except Exception:
            # 删除向量失败不影响主流程，DB 会继续删除，后续可离线清理孤立向量
            return

    @staticmethod
    def _uuid_to_int64(value: uuid.UUID) -> int:
        return value.int & ((1 << 63) - 1)

    @staticmethod
    def _doc_to_schema(doc: KnowledgeDocument) -> KnowledgeDocumentOut:
        return KnowledgeDocumentOut(
            id=str(doc.id),
            knowledge_base_id=str(doc.knowledge_base_id),
            file_name=doc.file_name,
            file_size=doc.file_size,
            page_count=doc.page_count,
            chunk_count=doc.chunk_count,
            parse_status=doc.parse_status,
            parse_error=doc.parse_error or "",
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )
