#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PY:-/data/home/wls_cwz/.conda/envs/env_paper/bin/python}"
BACKEND_DIR="$ROOT_DIR/backend"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8000}"
REDIS_CONTAINER="${REDIS_CONTAINER:-paperpanda-redis}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
MIGRATION_ID="${MIGRATION_ID:-20260226_0001}"
TEST_EMAIL="phase1_$(date +%s)@test.com"
TEST_PASSWORD="${TEST_PASSWORD:-Phase123456}"
UVICORN_LOG="${UVICORN_LOG:-/tmp/paperpanda_phase1_uvicorn.log}"

UVICORN_PID=""

cleanup() {
  if [[ -n "$UVICORN_PID" ]] && kill -0 "$UVICORN_PID" 2>/dev/null; then
    kill "$UVICORN_PID" || true
    wait "$UVICORN_PID" || true
  fi
}
trap cleanup EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1"; exit 1; }
}

need_cmd docker
need_cmd curl

[[ -x "$PY" ]] || { echo "Python not found: $PY"; exit 1; }

echo "[1/8] Start infra (postgres, redis)"
cd "$ROOT_DIR"
docker compose up -d postgres redis >/dev/null

echo "[2/8] Run migration"
"$PY" scripts/init_db.py
CURRENT_MIGRATION="$(cd "$BACKEND_DIR" && PYTHONPATH="$BACKEND_DIR" "$PY" -m alembic -c alembic.ini current 2>/dev/null || true)"
[[ "$CURRENT_MIGRATION" == *"$MIGRATION_ID"* ]] || {
  echo "Migration check failed. expected=$MIGRATION_ID got=$CURRENT_MIGRATION"
  exit 1
}

echo "[3/8] Start backend (if needed)"
if curl -fsS "http://$APP_HOST:$APP_PORT/health" >/dev/null 2>&1; then
  echo "Backend already running on $APP_HOST:$APP_PORT"
else
  cd "$BACKEND_DIR"
  PYTHONPATH="$BACKEND_DIR" "$PY" -m uvicorn app.main:app --host "$APP_HOST" --port "$APP_PORT" >"$UVICORN_LOG" 2>&1 &
  UVICORN_PID=$!
  for _ in $(seq 1 60); do
    curl -fsS "http://$APP_HOST:$APP_PORT/health" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS "http://$APP_HOST:$APP_PORT/health" >/dev/null 2>&1 || {
    echo "Backend start failed. log=$UVICORN_LOG"
    tail -n 100 "$UVICORN_LOG" || true
    exit 1
  }
fi

echo "[4/8] Run pytest"
cd "$BACKEND_DIR"
"$PY" -m pytest -q

echo "[5/8] Validate OpenAPI paths"
OPENAPI_JSON="$(curl -fsS "http://$APP_HOST:$APP_PORT/openapi.json")"
printf '%s' "$OPENAPI_JSON" | "$PY" -c '
import json, sys
required = {
    "/api/v1/auth/register", "/api/v1/auth/send-code", "/api/v1/auth/login",
    "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/search",
    "/api/v1/search/history", "/api/v1/papers/{paper_id}",
    "/api/v1/papers/{paper_id}/fulltext", "/api/v1/chat/sessions",
    "/api/v1/chat/sessions/{session_id}/messages", "/api/v1/favorites",
    "/api/v1/favorites/{favorite_id}/papers", "/api/v1/user/profile",
    "/api/v1/user/settings",
}
paths = set(json.load(sys.stdin).get("paths", {}).keys())
missing = sorted(required - paths)
if missing:
    print("Missing paths:", missing)
    raise SystemExit(1)
print("OpenAPI check OK")
'

echo "[6/8] Auth: send-code"
curl -fsS -X POST "http://$APP_HOST:$APP_PORT/api/v1/auth/send-code" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"purpose\":\"register\"}" >/dev/null

echo "[7/8] Auth: register/login/refresh/logout"
if command -v redis-cli >/dev/null 2>&1; then
  RAW_CODE="$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "email:verify:$TEST_EMAIL" 2>/dev/null || true)"
else
  RAW_CODE="$(docker exec "$REDIS_CONTAINER" redis-cli GET "email:verify:$TEST_EMAIL" 2>/dev/null || true)"
fi
VERIFICATION_CODE="$(printf '%s' "$RAW_CODE" | tr -d '\r"' | awk -F: '{print $2}')"
[[ -n "$VERIFICATION_CODE" ]] || { echo "Cannot read verification code from Redis"; exit 1; }

REGISTER_HTTP="$(curl -sS -o /tmp/paperpanda_register.json -w '%{http_code}' \
  -X POST "http://$APP_HOST:$APP_PORT/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"code\":\"$VERIFICATION_CODE\",\"nickname\":\"phase1\"}")"
[[ "$REGISTER_HTTP" == "200" ]] || { cat /tmp/paperpanda_register.json; exit 1; }

LOGIN_JSON="$(curl -fsS -X POST "http://$APP_HOST:$APP_PORT/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")"

ACCESS_TOKEN="$(printf '%s' "$LOGIN_JSON" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
REFRESH_TOKEN="$(printf '%s' "$LOGIN_JSON" | "$PY" -c 'import json,sys; print(json.load(sys.stdin)["refresh_token"])')"

curl -fsS -X POST "http://$APP_HOST:$APP_PORT/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}" >/dev/null

curl -fsS -X POST "http://$APP_HOST:$APP_PORT/api/v1/auth/logout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" >/dev/null

echo "[8/8] Search smoke"
curl -fsS -X POST "http://$APP_HOST:$APP_PORT/api/v1/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"transformer","source":"all","categories":[],"page":1,"page_size":10}' >/dev/null

echo "Phase 1 acceptance passed."
