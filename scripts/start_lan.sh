#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

PY="${PY:-/data/home/wls_cwz/.conda/envs/env_paper/bin/python}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_RELOAD="${BACKEND_RELOAD:-0}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
LAN_IP="${LAN_IP:-}"
TAILSCALE_IP="${TAILSCALE_IP:-}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1"
    exit 1
  }
}

ensure_root_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    return 0
  fi
  if [[ -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "Created $ROOT_DIR/.env from .env.example"
  fi
}

check_backend_python_deps() {
  "$PY" - <<'PY'
import importlib
mods = ["fastapi", "uvicorn", "sqlalchemy", "redis"]
missing = []
for m in mods:
    try:
        importlib.import_module(m)
    except ModuleNotFoundError:
        missing.append(m)
if missing:
    raise SystemExit(f"Missing Python packages in env_paper: {', '.join(missing)}")
PY
}

ensure_frontend_deps() {
  if [[ -d "$FRONTEND_DIR/node_modules" ]]; then
    return 0
  fi
  echo "Installing frontend deps (npm install)..."
  (
    cd "$FRONTEND_DIR"
    npm install
  )
}

find_pid_by_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
    return 0
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1 || true
    return 0
  fi
  echo ""
}

detect_lan_ip() {
  if [[ -n "$LAN_IP" ]]; then
    printf "%s\n" "$LAN_IP"
    return 0
  fi

  if command -v ip >/dev/null 2>&1; then
    local detected
    detected="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
    if [[ -n "$detected" ]]; then
      printf "%s\n" "$detected"
      return 0
    fi
  fi

  local fallback
  fallback="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$fallback" ]]; then
    printf "%s\n" "$fallback"
    return 0
  fi

  local py_detected
  py_detected="$("$PY" - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80))
    print(s.getsockname()[0])
except Exception:
    print("")
finally:
    s.close()
PY
)"
  if [[ -n "$py_detected" ]]; then
    printf "%s\n" "$py_detected"
    return 0
  fi

  printf "%s\n" ""
}

detect_tailscale_ip() {
  if [[ -n "$TAILSCALE_IP" ]]; then
    printf "%s\n" "$TAILSCALE_IP"
    return 0
  fi

  if command -v tailscale >/dev/null 2>&1; then
    local ts_ip
    ts_ip="$(tailscale ip -4 2>/dev/null | head -n 1)"
    printf "%s\n" "$ts_ip"
    return 0
  fi

  printf "%s\n" ""
}

build_cors_origins() {
  local lan_ip="$1"
  local tailscale_ip="$2"
  local origins=("http://localhost:${FRONTEND_PORT}" "http://127.0.0.1:${FRONTEND_PORT}")

  if [[ -n "$lan_ip" ]]; then
    origins+=("http://${lan_ip}:${FRONTEND_PORT}")
  fi
  if [[ -n "$tailscale_ip" && "$tailscale_ip" != "$lan_ip" ]]; then
    origins+=("http://${tailscale_ip}:${FRONTEND_PORT}")
  fi

  (
    IFS=","
    echo "${origins[*]}"
  )
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

is_http_ready() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

start_backend() {
  local cors_origins="$1"

  if is_http_ready "http://127.0.0.1:${BACKEND_PORT}/health"; then
    echo "Backend already running at 127.0.0.1:${BACKEND_PORT}"
    if [[ ! -f "$BACKEND_PID_FILE" ]]; then
      local existing_pid
      existing_pid="$(find_pid_by_port "$BACKEND_PORT")"
      if [[ -n "$existing_pid" ]]; then
        echo "$existing_pid" >"$BACKEND_PID_FILE"
      fi
    fi
    return 0
  fi

  local backend_cmd=("$PY" -m uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT")
  if [[ "$BACKEND_RELOAD" == "1" ]]; then
    backend_cmd+=(--reload)
  fi

  (
    cd "$BACKEND_DIR"
    : >"$BACKEND_LOG"
    PYTHONPATH="$BACKEND_DIR" \
      CORS_ORIGINS="$cors_origins" \
      nohup "${backend_cmd[@]}" >"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )

  for _ in $(seq 1 60); do
    if is_http_ready "http://127.0.0.1:${BACKEND_PORT}/health"; then
      echo "Backend started."
      return 0
    fi
    sleep 1
  done

  echo "Backend failed to start. Check log: $BACKEND_LOG" >&2
  tail -n 100 "$BACKEND_LOG" || true
  exit 1
}

write_frontend_env() {
  local env_file="$FRONTEND_DIR/.env.local"
  cat >"$env_file" <<EOF
NEXT_PUBLIC_API_BASE_URL=/api/v1
BACKEND_PROXY_TARGET=http://127.0.0.1:${BACKEND_PORT}
EOF
  echo "Wrote frontend env: $env_file"
}

start_frontend() {
  if is_http_ready "http://127.0.0.1:${FRONTEND_PORT}"; then
    echo "Frontend already running at 127.0.0.1:${FRONTEND_PORT}"
    if [[ ! -f "$FRONTEND_PID_FILE" ]]; then
      local existing_pid
      existing_pid="$(find_pid_by_port "$FRONTEND_PORT")"
      if [[ -n "$existing_pid" ]]; then
        echo "$existing_pid" >"$FRONTEND_PID_FILE"
      fi
    fi
    return 0
  fi

  local next_bin="$FRONTEND_DIR/node_modules/.bin/next"
  if [[ ! -x "$next_bin" ]]; then
    echo "Next binary not found: $next_bin" >&2
    exit 1
  fi

  (
    cd "$FRONTEND_DIR"
    : >"$FRONTEND_LOG"
    nohup "$next_bin" dev --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )

  for _ in $(seq 1 90); do
    if is_http_ready "http://127.0.0.1:${FRONTEND_PORT}"; then
      echo "Frontend started."
      return 0
    fi
    sleep 1
  done

  echo "Frontend failed to start. Check log: $FRONTEND_LOG" >&2
  tail -n 100 "$FRONTEND_LOG" || true
  exit 1
}

main() {
  need_cmd docker
  need_cmd curl
  need_cmd npm
  [[ -x "$PY" ]] || {
    echo "Python not found or not executable: $PY" >&2
    exit 1
  }

  mkdir -p "$RUN_DIR"
  ensure_root_env

  local lan_ip
  lan_ip="$(detect_lan_ip)"
  local tailscale_ip
  tailscale_ip="$(detect_tailscale_ip)"
  local cors_origins
  cors_origins="$(build_cors_origins "$lan_ip" "$tailscale_ip")"

  echo "[1/6] Verifying backend Python dependencies"
  check_backend_python_deps

  echo "[2/6] Starting infra containers (postgres, redis)"
  cd "$ROOT_DIR"
  docker compose up -d postgres redis >/dev/null

  echo "[3/6] Running database migration"
  "$PY" "$ROOT_DIR/scripts/init_db.py"

  echo "[4/6] Writing frontend API env (.env.local)"
  write_frontend_env

  echo "[5/6] Starting backend"
  start_backend "$cors_origins"

  echo "[6/6] Starting frontend"
  ensure_frontend_deps
  start_frontend

  echo ""
  echo "Startup completed."
  echo "Frontend (local):     http://127.0.0.1:${FRONTEND_PORT}"
  echo "Backend  (local):     http://127.0.0.1:${BACKEND_PORT}"
  if [[ -n "$lan_ip" ]]; then
    echo "Frontend (LAN):       http://${lan_ip}:${FRONTEND_PORT}"
    echo "Backend  (LAN):       http://${lan_ip}:${BACKEND_PORT}"
    echo "Docs     (LAN):       http://${lan_ip}:${BACKEND_PORT}/api/docs"
  fi
  if [[ -n "$tailscale_ip" ]]; then
    echo "Frontend (Tailscale): http://${tailscale_ip}:${FRONTEND_PORT}"
    echo "Backend  (Tailscale): http://${tailscale_ip}:${BACKEND_PORT}"
    echo "Docs     (Tailscale): http://${tailscale_ip}:${BACKEND_PORT}/api/docs"
  fi
  echo "Logs:     $BACKEND_LOG , $FRONTEND_LOG"
  echo "Stop:     $ROOT_DIR/scripts/stop_lan.sh"
}

main "$@"
