from fastapi import APIRouter

from app.api.v1 import auth, chat, favorites, knowledge_bases, papers, search, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(papers.router, prefix="/papers", tags=["papers"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(favorites.router, prefix="/favorites", tags=["favorites"])
api_router.include_router(users.router, prefix="/user", tags=["user"])
api_router.include_router(knowledge_bases.router, prefix="/knowledge-bases", tags=["knowledge-bases"])
