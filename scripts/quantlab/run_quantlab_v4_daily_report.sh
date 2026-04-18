#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

OPEN_AFTER=0
PRINT_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --open)
      OPEN_AFTER=1
      shift
      ;;
    --print-only)
      PRINT_ONLY=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

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
OPEN_BIN="$(find_bin "${OPEN_BIN:-}" open || true)"
if [[ -x "$REPO_ROOT/scripts/ops/resolve-node20-bin.sh" ]]; then
  NODE_BIN="$("$REPO_ROOT/scripts/ops/resolve-node20-bin.sh")"
fi
REPORT_PAGE="$REPO_ROOT/public/quantlab-v4-daily.html"
LOG_DIR="${QUANTLAB_V4_REPORT_LOG_DIR:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs}"
mkdir -p "$LOG_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/quantlab_v4_daily_report_${TS}.log"
LATEST_LINK="$LOG_DIR/quantlab_v4_daily_report.latest.log"

if [[ -z "$NODE_BIN" ]]; then
  echo "FATAL: node not found" >&2
  exit 2
fi

RUNTIME_PREFLIGHT_CMD=("$NODE_BIN" "scripts/ops/runtime-preflight.mjs" "--ensure-runtime" "--mode=hard")
PUBLISH_CHAIN_CMD=("$NODE_BIN" "scripts/ops/run-stock-analyzer-publish-chain.mjs")

if [[ "$PRINT_ONLY" -eq 1 ]]; then
  printf 'report_page=%s\n' "$REPORT_PAGE"
  printf 'log_file=%s\n' "$LOG_FILE"
  printf 'runtime_preflight_cmd='
  printf '%q ' "${RUNTIME_PREFLIGHT_CMD[@]}"
  printf '\n'
  printf 'publish_chain_cmd='
  printf '%q ' "${PUBLISH_CHAIN_CMD[@]}"
  printf '\n'
  exit 0
fi

{
  echo "[quantlab-v4-daily] started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[quantlab-v4-daily] repo_root=$REPO_ROOT"
  echo "[quantlab-v4-daily] report_page=$REPORT_PAGE"
  printf '[quantlab-v4-daily] runtime_preflight_cmd='
  printf '%q ' "${RUNTIME_PREFLIGHT_CMD[@]}"
  printf '\n'
  printf '[quantlab-v4-daily] publish_chain_cmd='
  printf '%q ' "${PUBLISH_CHAIN_CMD[@]}"
  printf '\n'
} | tee "$LOG_FILE"

set +e
"${RUNTIME_PREFLIGHT_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
PREFLIGHT_RC=${PIPESTATUS[0]}
CHAIN_RC=
if [[ "$PREFLIGHT_RC" -ne 0 ]]; then
  set -e
  RC="$PREFLIGHT_RC"
else
  "${PUBLISH_CHAIN_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
  CHAIN_RC=${PIPESTATUS[0]}
  set -e
  RC="$CHAIN_RC"
fi

{
  echo "[quantlab-v4-daily] runtime_preflight_exit_code=$PREFLIGHT_RC"
  echo "[quantlab-v4-daily] publish_chain_exit_code=$CHAIN_RC"
  echo "[quantlab-v4-daily] exit_code=$RC"
  echo "[quantlab-v4-daily] finished_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee -a "$LOG_FILE"

ln -sfn "$LOG_FILE" "$LATEST_LINK"

if [[ "$OPEN_AFTER" -eq 1 ]]; then
  if [[ -n "$OPEN_BIN" ]]; then
    "$OPEN_BIN" "$REPORT_PAGE"
  else
    echo "WARN: open command not found; report page not opened automatically" | tee -a "$LOG_FILE"
  fi
fi

exit "$RC"
