#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
EXTRA_ARGS=("$@")

QUANT_ROOT="${QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
MAX_HOURS="${MAX_HOURS:-9.5}"
THREADS_CAP="${THREADS_CAP:-4}"
MAX_RSS_GIB="${MAX_RSS_GIB:-11.5}"
TASK_TIMEOUT_MINUTES="${TASK_TIMEOUT_MINUTES:-210}"
JOB_NAME="${JOB_NAME:-overnight_q1_training_sweep_safe_$(date +%Y%m%d_%H%M)}"
TASK_NICE="${TASK_NICE:-15}"
MONITOR_INTERVAL_SEC="${MONITOR_INTERVAL_SEC:-5}"
METRICS_LOG_INTERVAL_SEC="${METRICS_LOG_INTERVAL_SEC:-30}"
STALE_HEARTBEAT_MINUTES="${STALE_HEARTBEAT_MINUTES:-45}"
STALE_MIN_ELAPSED_MINUTES="${STALE_MIN_ELAPSED_MINUTES:-20}"
STALE_CPU_PCT_MAX="${STALE_CPU_PCT_MAX:-1.0}"
RETRYABLE_EXIT_CODES="${RETRYABLE_EXIT_CODES:-124,137,142}"
MAX_RETRIES_PER_TASK="${MAX_RETRIES_PER_TASK:-1}"
RETRY_COOLDOWN_SEC="${RETRY_COOLDOWN_SEC:-45}"
SLEEP_BETWEEN_TASKS_SEC="${SLEEP_BETWEEN_TASKS_SEC:-25}"
STOP_AFTER_CONSECUTIVE_FAILURES="${STOP_AFTER_CONSECUTIVE_FAILURES:-2}"
GLOBAL_LOCK_NAME="${GLOBAL_LOCK_NAME:-overnight_q1_training_sweep_safe}"

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
  --task-nice "$TASK_NICE" \
  --threads-cap "$THREADS_CAP" \
  --max-rss-gib "$MAX_RSS_GIB" \
  --monitor-interval-sec "$MONITOR_INTERVAL_SEC" \
  --metrics-log-interval-sec "$METRICS_LOG_INTERVAL_SEC" \
  --stale-heartbeat-minutes "$STALE_HEARTBEAT_MINUTES" \
  --stale-min-elapsed-minutes "$STALE_MIN_ELAPSED_MINUTES" \
  --stale-cpu-pct-max "$STALE_CPU_PCT_MAX" \
  --task-timeout-minutes "$TASK_TIMEOUT_MINUTES" \
  --retryable-exit-codes "$RETRYABLE_EXIT_CODES" \
  --max-retries-per-task "$MAX_RETRIES_PER_TASK" \
  --retry-cooldown-sec "$RETRY_COOLDOWN_SEC" \
  --sleep-between-tasks-sec "$SLEEP_BETWEEN_TASKS_SEC" \
  --stop-after-consecutive-failures "$STOP_AFTER_CONSECUTIVE_FAILURES" \
  --max-hours "$MAX_HOURS" \
  --job-name "$JOB_NAME" \
  --global-lock-name "$GLOBAL_LOCK_NAME" \
  "${EXTRA_ARGS[@]}"
