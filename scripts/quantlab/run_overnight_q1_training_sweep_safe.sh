#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

QUANT_ROOT="${QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
MAX_HOURS="${MAX_HOURS:-9.5}"
THREADS_CAP="${THREADS_CAP:-4}"
MAX_RSS_GIB="${MAX_RSS_GIB:-11.5}"
TASK_TIMEOUT_MINUTES="${TASK_TIMEOUT_MINUTES:-210}"
JOB_NAME="${JOB_NAME:-overnight_q1_training_sweep_safe_$(date +%Y%m%d_%H%M)}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL: python not executable: $PYTHON_BIN" >&2
  exit 2
fi

if [[ -z "${SNAPSHOT_ID:-}" ]]; then
  latest_snapshot="$(ls -1dt "$QUANT_ROOT"/data/snapshots/snapshot_id=* 2>/dev/null | head -n 1 || true)"
  if [[ -z "$latest_snapshot" ]]; then
    echo "FATAL: no snapshot found under $QUANT_ROOT/data/snapshots" >&2
    exit 2
  fi
  SNAPSHOT_ID="${latest_snapshot##*=}"
fi

exec "$PYTHON_BIN" scripts/quantlab/run_overnight_q1_training_sweep.py \
  --quant-root "$QUANT_ROOT" \
  --snapshot-id "$SNAPSHOT_ID" \
  --task-order safe_light_first \
  --task-nice 15 \
  --threads-cap "$THREADS_CAP" \
  --max-rss-gib "$MAX_RSS_GIB" \
  --monitor-interval-sec 5 \
  --metrics-log-interval-sec 30 \
  --stale-heartbeat-minutes 45 \
  --stale-min-elapsed-minutes 20 \
  --stale-cpu-pct-max 1.0 \
  --task-timeout-minutes "$TASK_TIMEOUT_MINUTES" \
  --retryable-exit-codes 124,137,142 \
  --max-retries-per-task 1 \
  --retry-cooldown-sec 45 \
  --sleep-between-tasks-sec 25 \
  --stop-after-consecutive-failures 2 \
  --max-hours "$MAX_HOURS" \
  --job-name "$JOB_NAME"
