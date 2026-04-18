#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODE_BIN="$("$REPO_ROOT/scripts/ops/resolve-node20-bin.sh")"

exec "$NODE_BIN" "$REPO_ROOT/scripts/ops/run-pipeline-master-supervisor.mjs" "$@"
