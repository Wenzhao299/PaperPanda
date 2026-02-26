from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.security import hash_password
from app.db.session import close_db, get_session_factory, init_db
from app.models.paper import Paper
from app.models.user import User


async def main() -> None:
    await init_db()
    try:
        session_factory = get_session_factory()
        async with session_factory() as db:
            demo_user = await db.scalar(select(User).where(User.email == "demo@paperpanda.ai"))
            if demo_user is None:
                db.add(
                    User(
                        email="demo@paperpanda.ai",
                        password_hash=hash_password("Demo123456"),
                        nickname="Demo User",
                        settings={"language": "zh", "llm_provider": "deepseek"},
                    )
                )

            existing = await db.scalar(select(Paper.id).limit(1))
            if existing is None:
                db.add_all(
                    [
                        Paper(
                            arxiv_id="2401.00001",
                            title="PaperPanda: A Framework for Semantic Paper Discovery",
                            abstract="We propose a semantic retrieval framework tailored for scientific literature exploration.",
                            authors=["Alice", "Bob"],
                            categories=["cs.IR", "cs.AI"],
                            primary_category="cs.IR",
                            published_date=date(2024, 1, 2),
                            source="arxiv",
                        ),
                        Paper(
                            arxiv_id="2402.00002",
                            title="LLM-assisted Reranking for Scientific Search",
                            abstract="This paper studies reranking strategies powered by large language models.",
                            authors=["Carol", "Dave"],
                            categories=["cs.CL", "cs.AI"],
                            primary_category="cs.CL",
                            published_date=date(2024, 2, 5),
                            source="arxiv",
                        ),
                    ]
                )

            await db.commit()
        print("Seed data ready.")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
