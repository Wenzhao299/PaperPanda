#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PY:-/data/home/wls_cwz/.conda/envs/env_paper/bin/python}"

echo "[1/4] Start infra containers (postgres, redis, milvus)"
cd "$ROOT_DIR"
docker compose up -d postgres redis etcd minio milvus >/dev/null

echo "[2/4] Run database migration"
"$PY" "$ROOT_DIR/scripts/init_db.py"

echo "[3/4] Init Milvus collections"
"$PY" "$ROOT_DIR/scripts/init_milvus.py"

echo "[4/4] Run Phase 2 pipeline (incremental crawl + embedding + translate-untranslated)"
"$PY" "$ROOT_DIR/scripts/run_phase2_pipeline.py"

echo "Phase 2 pipeline completed."
