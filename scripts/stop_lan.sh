#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

kill_pid() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 0
  fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  kill "$pid" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  kill -9 "$pid" >/dev/null 2>&1 || true
}

find_pids_by_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    return 0
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' || true
    return 0
  fi
}

port_has_listener() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -q .
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

find_pids_by_pattern() {
  local pattern="$1"
  pgrep -f "$pattern" 2>/dev/null || true
}

stop_by_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name pid file not found, skip."
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "$name pid file is empty, removed."
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill_pid "$pid"
    echo "$name stopped (pid=$pid)."
  else
    echo "$name process not running (stale pid=$pid)."
  fi

  rm -f "$pid_file"
}

stop_by_port() {
  local name="$1"
  local port="$2"
  local pids
  pids="$(find_pids_by_port "$port" | sort -u | tr '\n' ' ')"
  if [[ -z "$pids" ]]; then
    if port_has_listener "$port"; then
      echo "$name port $port is listening, but PID is not visible in current permission context."
    else
      echo "$name port $port has no listener, skip."
    fi
    return 0
  fi
  for pid in $pids; do
    kill_pid "$pid"
  done
  echo "$name port $port cleaned."
}

stop_by_pattern() {
  local name="$1"
  local pattern="$2"
  local pids
  pids="$(find_pids_by_pattern "$pattern" | sort -u | tr '\n' ' ')"
  if [[ -z "$pids" ]]; then
    echo "$name pattern '$pattern' not found, skip."
    return 0
  fi
  for pid in $pids; do
    kill_pid "$pid"
  done
  echo "$name pattern '$pattern' cleaned."
}

main() {
  stop_by_pid_file "Frontend" "$FRONTEND_PID_FILE"
  stop_by_pid_file "Backend" "$BACKEND_PID_FILE"
  stop_by_pattern "Frontend" "$ROOT_DIR/frontend/node_modules/.bin/next dev --hostname"
  stop_by_pattern "Frontend" "next-server"
  stop_by_pattern "Backend" "uvicorn app.main:app --host .* --port $BACKEND_PORT"
  stop_by_pattern "Backend" "python -m uvicorn app.main:app --host .* --port $BACKEND_PORT"
  stop_by_port "Frontend" "$FRONTEND_PORT"
  stop_by_port "Backend" "$BACKEND_PORT"
}

main "$@"
