#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODE_BIN="$("$REPO_ROOT/scripts/ops/resolve-node20-bin.sh")"


if [[ -f "$REPO_ROOT/mirrors/ops/pipeline-master/SUPERVISOR_STOP" ]]; then
  echo "SUPERVISOR_STOP file detected. Sleeping indefinitely to satisfy systemd..."
  exec sleep 2147483647
fi

ulimit -n 65536 2>/dev/null || true
exec "$NODE_BIN" "$REPO_ROOT/scripts/ops/run-pipeline-master-supervisor.mjs" "$@"
