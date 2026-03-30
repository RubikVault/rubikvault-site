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

REPORT_CMD=("$NODE_BIN" "scripts/quantlab/build_quantlab_v4_daily_report.mjs")
STATUS_CMD=("$NODE_BIN" "scripts/ops/build-system-status-report.mjs")
DASHBOARD_CMD=("$NODE_BIN" "scripts/generate_meta_dashboard_data.mjs")

if [[ "$PRINT_ONLY" -eq 1 ]]; then
  printf 'report_page=%s\n' "$REPORT_PAGE"
  printf 'log_file=%s\n' "$LOG_FILE"
  printf 'report_cmd='
  printf '%q ' "${REPORT_CMD[@]}"
  printf '\n'
  printf 'status_cmd='
  printf '%q ' "${STATUS_CMD[@]}"
  printf '\n'
  printf 'dashboard_cmd='
  printf '%q ' "${DASHBOARD_CMD[@]}"
  printf '\n'
  exit 0
fi

{
  echo "[quantlab-v4-daily] started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[quantlab-v4-daily] repo_root=$REPO_ROOT"
  echo "[quantlab-v4-daily] report_page=$REPORT_PAGE"
  printf '[quantlab-v4-daily] report_cmd='
  printf '%q ' "${REPORT_CMD[@]}"
  printf '\n'
  printf '[quantlab-v4-daily] status_cmd='
  printf '%q ' "${STATUS_CMD[@]}"
  printf '\n'
  printf '[quantlab-v4-daily] dashboard_cmd='
  printf '%q ' "${DASHBOARD_CMD[@]}"
  printf '\n'
} | tee "$LOG_FILE"

set +e
"${REPORT_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
REPORT_RC=${PIPESTATUS[0]}
"${STATUS_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
STATUS_RC=${PIPESTATUS[0]}
"${DASHBOARD_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
DASHBOARD_RC=${PIPESTATUS[0]}
set -e

RC="$REPORT_RC"
if [[ "$STATUS_RC" -ne 0 ]]; then
  RC="$STATUS_RC"
fi
if [[ "$DASHBOARD_RC" -ne 0 ]]; then
  RC="$DASHBOARD_RC"
fi

{
  echo "[quantlab-v4-daily] report_exit_code=$REPORT_RC"
  echo "[quantlab-v4-daily] system_status_exit_code=$STATUS_RC"
  echo "[quantlab-v4-daily] dashboard_exit_code=$DASHBOARD_RC"
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
