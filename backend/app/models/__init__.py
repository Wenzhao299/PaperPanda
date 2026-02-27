"""
数据库模型包 - 导出所有模型
"""

from app.models.user import User, EmailVerification
from app.models.paper import Paper, PaperChunk
from app.models.favorite import Favorite, FavoriteItem
from app.models.chat import ChatSession, ChatMessage
from app.models.search_history import PaperViewHistory, SearchHistory
from app.models.knowledge_base import KnowledgeBase, KnowledgeChunk, KnowledgeDocument

__all__ = [
    "User",
    "EmailVerification",
    "Paper",
    "PaperChunk",
    "Favorite",
    "FavoriteItem",
    "ChatSession",
    "ChatMessage",
    "SearchHistory",
    "PaperViewHistory",
    "KnowledgeBase",
    "KnowledgeDocument",
    "KnowledgeChunk",
]
