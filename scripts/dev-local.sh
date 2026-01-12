#!/usr/bin/env bash
set -euo pipefail

# Reality check outputs (2026-01-01)
# pwd: (captured at runtime; do not hardcode absolute paths)
# show-toplevel: (captured at runtime; do not hardcode absolute paths)
# git status --porcelain: M .gitignore | M functions/api/health.js | M scripts/test-api.sh | ?? .wranglerignore | ?? scripts/dev-local.sh | ?? scripts/move-repo-out-of-icloud.sh
# node -v: v25.2.1
# wrangler --version: 4.54.0
# wrangler pages dev --help (watch flags): --live-reload (default false), --persist-to, --inspector-port, --no-bundle
# wrangler dev --help (watch flags): --live-reload, --persist-to, --no-bundle

ROOT=$(git rev-parse --show-toplevel)

# If repo is under Documents (iCloud sync risk), use /tmp for slim workspace
if [[ "$ROOT" == *"/Documents/"* ]]; then
  SLIM_DIR="/tmp/rv-dev-slim"
else
  SLIM_DIR="$ROOT/.tmp/dev-slim"
fi

rm -rf "$SLIM_DIR"
mkdir -p "$SLIM_DIR"

export HOME="/tmp/rv_home"
mkdir -p "$HOME"
export NODE_OPTIONS=""
export CHOKIDAR_USEPOLLING=1
export CHOKIDAR_INTERVAL=500

ulimit -n 65536 >/dev/null 2>&1 || true

if [[ -f "$ROOT/.dev.vars" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.dev.vars"
  set +a
fi

# Copy only what Pages dev needs to minimize file watching
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --prune-empty-dirs \
    --include "/functions/***" \
    --include "/public/***" \
    --include "/features/***" \
    --include "/assets/***" \
    --include "/mirrors/***" \
    --include "/*.html" \
    --include "/*.css" \
    --include "/*.js" \
    --include "/_redirects" \
    --include "/_headers" \
    --include "/wrangler.toml" \
    --include "/package.json" \
    --include "/package-lock.json" \
    --exclude "node_modules" \
    --exclude ".git" \
    --exclude ".wrangler" \
    --exclude ".tmp" \
    --exclude "logs" \
    --exclude "coverage" \
    --exclude ".cache" \
    --exclude "dist" \
    --exclude "build" \
    --exclude ".next" \
    --exclude ".DS_Store" \
    --exclude "*" \
    "$ROOT/" "$SLIM_DIR/"
else
  mkdir -p "$SLIM_DIR/functions" "$SLIM_DIR/public" "$SLIM_DIR/features" "$SLIM_DIR/assets" "$SLIM_DIR/mirrors"
  cp -R "$ROOT/functions/." "$SLIM_DIR/functions/" 2>/dev/null || true
  cp -R "$ROOT/public/." "$SLIM_DIR/public/" 2>/dev/null || true
  cp -R "$ROOT/features/." "$SLIM_DIR/features/" 2>/dev/null || true
  cp -R "$ROOT/assets/." "$SLIM_DIR/assets/" 2>/dev/null || true
  cp -R "$ROOT/mirrors/." "$SLIM_DIR/mirrors/" 2>/dev/null || true
  cp "$ROOT/"*.html "$SLIM_DIR/" 2>/dev/null || true
  cp "$ROOT/"*.css "$SLIM_DIR/" 2>/dev/null || true
  cp "$ROOT/"*.js "$SLIM_DIR/" 2>/dev/null || true
  cp "$ROOT/wrangler.toml" "$SLIM_DIR/" 2>/dev/null || true
  cp "$ROOT/package.json" "$SLIM_DIR/" 2>/dev/null || true
  cp "$ROOT/package-lock.json" "$SLIM_DIR/" 2>/dev/null || true
fi

# Copy only required runtime dependency to reduce watch load
mkdir -p "$SLIM_DIR/node_modules"
if [[ -d "$ROOT/node_modules/fast-xml-parser" ]]; then
  rsync -a "$ROOT/node_modules/fast-xml-parser" "$SLIM_DIR/node_modules/"
fi
if [[ -d "$ROOT/node_modules/strnum" ]]; then
  rsync -a "$ROOT/node_modules/strnum" "$SLIM_DIR/node_modules/"
fi

cd "$SLIM_DIR"

PORT="${PORT:-8799}"
IP="${IP:-127.0.0.1}"

NODE_MAJOR=$(node -v | sed 's/^v//; s/\..*$//')
if [[ "$NODE_MAJOR" -ge 25 ]]; then
  echo "Warning: Node ${NODE_MAJOR} detected. Wrangler is most stable on Node 20/22 LTS."
fi

WRANGLER_BIN="$ROOT/node_modules/.bin/wrangler"
if [[ ! -x "$WRANGLER_BIN" ]]; then
  echo "Error: wrangler not found at $WRANGLER_BIN. Run: npm install"
  exit 1
fi

echo "Ready on http://${IP}:${PORT}"

exec "$WRANGLER_BIN" pages dev . \
  --ip "$IP" \
  --port "$PORT" \
  --kv RV_KV \
  --persist-to "$ROOT/.wrangler/state" \
  --compatibility-date=2025-12-29 \
  --inspector-port 0
