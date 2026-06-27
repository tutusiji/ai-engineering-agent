#!/bin/bash
# Studio Production Launcher
# Usage: ./scripts/start-prod.sh [api|web|all]

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load project .env — all config lives here, no external dependencies
set -a
if [ -f "$PROJECT_ROOT/.env" ]; then
  source "$PROJECT_ROOT/.env"
fi
set +a

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

start_api() {
  log "🚀 Starting Studio API (port 4401)..."
  cd "$PROJECT_ROOT"
  exec pnpm --filter @ai-engineering-agent/studio-api start
}

start_web() {
  log "🌐 Starting Studio Web preview (port 4400)..."
  cd "$PROJECT_ROOT/apps/studio-web"
  exec pnpm preview --port 4400 --host 0.0.0.0
}

case "${1:-all}" in
  api)  start_api ;;
  web)  start_web ;;
  all)
    # PM2 / systemd 等外部进程管理器应分别启动两个服务。
    # 这里保持兼容旧用法：后台启动两个进程并等待。
    log "Starting both API and Web..."
    start_api &
    start_web &
    wait
    ;;
esac
