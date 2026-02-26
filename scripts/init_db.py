from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"


def main() -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)

    cmd = [
        sys.executable,
        "-m",
        "alembic",
        "-c",
        str(BACKEND_DIR / "alembic.ini"),
        "upgrade",
        "head",
    ]
    subprocess.run(cmd, check=True, cwd=str(BACKEND_DIR), env=env)
    print("Database migration completed.")


if __name__ == "__main__":
    main()
