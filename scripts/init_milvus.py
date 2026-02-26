from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
from app.db.milvus import get_milvus


def main() -> None:
    settings = get_settings()
    client = get_milvus()
    if not client.has_collection("paper_abstracts"):
        client.create_collection(
            collection_name="paper_abstracts",
            dimension=settings.embedding_dimension,
            metric_type="COSINE",
            consistency_level="Strong",
        )
    print("Milvus initialized")


if __name__ == "__main__":
    main()
