#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

find_bin() {
  local preferred="$1"
  local name="$2"
  if [[ -n "$preferred" && -x "$preferred" ]]; then
    printf '%s\n' "$preferred"
    return 0
  fi
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  local candidates=(
    "/opt/homebrew/bin/$name"
    "/usr/local/bin/$name"
    "/usr/bin/$name"
    "/bin/$name"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

NODE_BIN="$(find_bin "${NODE_BIN:-}" node || true)"
if [[ -x "$REPO_ROOT/scripts/ops/resolve-node20-bin.sh" ]]; then
  NODE_BIN="$("$REPO_ROOT/scripts/ops/resolve-node20-bin.sh")"
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "FATAL: node not found" >&2
  exit 2
fi

# 1. Fail fast if the shared runtime is not healthy enough for publish/UI truth
"$NODE_BIN" scripts/ops/runtime-preflight.mjs --ensure-runtime --mode=hard

# 2. Run the canonical stock-analyzer publish chain
"$NODE_BIN" scripts/ops/run-stock-analyzer-publish-chain.mjs

# 3. Start the manual refresh API
exec "$NODE_BIN" scripts/quantlab/serve_quantlab_v4_report_refresh.mjs
