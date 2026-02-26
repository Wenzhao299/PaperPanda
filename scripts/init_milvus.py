from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
from app.db.milvus import ensure_milvus_collections, get_milvus


def wait_for_milvus(timeout_seconds: int = 180, interval_seconds: float = 2.0) -> None:
    deadline = time.time() + timeout_seconds
    last_error = ""
    while time.time() < deadline:
        try:
            client = get_milvus()
            client.list_collections()
            return
        except Exception as exc:
            last_error = str(exc)
            time.sleep(interval_seconds)
    raise RuntimeError(f"Milvus is not ready after {timeout_seconds}s: {last_error}")


def main() -> None:
    _ = get_settings()
    wait_for_milvus()
    client = get_milvus()
    created = ensure_milvus_collections(client)
    if created:
        print(f"Milvus initialized, created collections: {', '.join(created)}")
    else:
        print("Milvus initialized, collections already exist.")


if __name__ == "__main__":
    main()
