#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
export HOME="/tmp/rv_home"
mkdir -p "$HOME"
export NODE_OPTIONS=""
PORT="${PORT:-8788}"
npx wrangler pages dev public --ip 127.0.0.1 --port "$PORT" --kv RV_KV --persist-to .wrangler/state --compatibility-date=2025-12-29 --inspector-port 0
