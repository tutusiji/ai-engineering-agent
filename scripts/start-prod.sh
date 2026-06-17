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

start_api() {
  echo "🚀 Starting Studio API (port 4401)..."
  cd "$PROJECT_ROOT"
  exec pnpm --filter @ai-frontend-engineering-agent/studio-api start
}

start_web() {
  echo "🌐 Starting Studio Web preview (port 4400)..."
  cd "$PROJECT_ROOT/apps/studio-web"
  exec pnpm preview --port 4400 --host 0.0.0.0
}

case "${1:-all}" in
  api)  start_api ;;
  web)  start_web ;;
  all)
    echo "Starting both API and Web..."
    start_api &
    start_web &
    wait
    ;;
esac
