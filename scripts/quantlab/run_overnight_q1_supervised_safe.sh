#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
EXTRA_ARGS=("$@")

QUANT_ROOT="${QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
MAX_HOURS="${MAX_HOURS:-9.5}"
THREADS_CAP="${THREADS_CAP:-3}"
MAX_RSS_GIB="${MAX_RSS_GIB:-11.5}"
TASK_TIMEOUT_MINUTES="${TASK_TIMEOUT_MINUTES:-210}"
WATCH_HOURS="${WATCH_HOURS:-12}"
CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-60}"
STALE_DRIVER_MINUTES="${STALE_DRIVER_MINUTES:-20}"
GLOBAL_LOCK_NAME="${GLOBAL_LOCK_NAME:-overnight_q1_training_sweep_safe}"
TASK_NICE="${TASK_NICE:-17}"
MONITOR_INTERVAL_SEC="${MONITOR_INTERVAL_SEC:-5}"
METRICS_LOG_INTERVAL_SEC="${METRICS_LOG_INTERVAL_SEC:-60}"
STALE_HEARTBEAT_MINUTES="${STALE_HEARTBEAT_MINUTES:-30}"
STALE_MIN_ELAPSED_MINUTES="${STALE_MIN_ELAPSED_MINUTES:-15}"
STALE_CPU_PCT_MAX="${STALE_CPU_PCT_MAX:-1.0}"
MAX_RETRIES_PER_TASK="${MAX_RETRIES_PER_TASK:-1}"
MAX_FAILED_TASK_RESUME_RETRIES="${MAX_FAILED_TASK_RESUME_RETRIES:-0}"
RETRYABLE_EXIT_CODES="${RETRYABLE_EXIT_CODES:-124,137,142}"
RETRY_COOLDOWN_SEC="${RETRY_COOLDOWN_SEC:-45}"
SLEEP_BETWEEN_TASKS_SEC="${SLEEP_BETWEEN_TASKS_SEC:-35}"
STOP_AFTER_CONSECUTIVE_FAILURES="${STOP_AFTER_CONSECUTIVE_FAILURES:-3}"
MIN_FREE_DISK_GB="${MIN_FREE_DISK_GB:-12}"
MAX_LOAD_PER_CORE="${MAX_LOAD_PER_CORE:-8.0}"

if [[ -z "${JOB_NAME:-}" ]]; then
  JOB_NAME="overnight_q1_training_sweep_safe_$(date +%Y%m%d)"
fi
JOB_DIR="$QUANT_ROOT/jobs/$JOB_NAME"
STABILITY_LOOKBACK_JOBS="${STABILITY_LOOKBACK_JOBS:-7}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL: python not executable: $PYTHON_BIN" >&2
  exit 2
fi

set +e
"$PYTHON_BIN" scripts/quantlab/watch_overnight_q1_job.py \
  --repo-root "$REPO_ROOT" \
  --quant-root "$QUANT_ROOT" \
  --job-dir "$JOB_DIR" \
  --python "$PYTHON_BIN" \
  --global-lock-name "$GLOBAL_LOCK_NAME" \
  --watch-hours "$WATCH_HOURS" \
  --check-interval-sec "$CHECK_INTERVAL_SEC" \
  --stale-driver-minutes "$STALE_DRIVER_MINUTES" \
  --max-hours "$MAX_HOURS" \
  --task-timeout-minutes "$TASK_TIMEOUT_MINUTES" \
  --threads-cap "$THREADS_CAP" \
  --max-rss-gib "$MAX_RSS_GIB" \
  --task-nice "$TASK_NICE" \
  --monitor-interval-sec "$MONITOR_INTERVAL_SEC" \
  --metrics-log-interval-sec "$METRICS_LOG_INTERVAL_SEC" \
  --stale-heartbeat-minutes "$STALE_HEARTBEAT_MINUTES" \
  --stale-min-elapsed-minutes "$STALE_MIN_ELAPSED_MINUTES" \
  --stale-cpu-pct-max "$STALE_CPU_PCT_MAX" \
  --max-load-per-core "$MAX_LOAD_PER_CORE" \
  --min-free-disk-gb "$MIN_FREE_DISK_GB" \
  --max-retries-per-task "$MAX_RETRIES_PER_TASK" \
  --max-failed-task-resume-retries "$MAX_FAILED_TASK_RESUME_RETRIES" \
  --retryable-exit-codes "$RETRYABLE_EXIT_CODES" \
  --retry-cooldown-sec "$RETRY_COOLDOWN_SEC" \
  --sleep-between-tasks-sec "$SLEEP_BETWEEN_TASKS_SEC" \
  --stop-after-consecutive-failures "$STOP_AFTER_CONSECUTIVE_FAILURES" \
  --task-order safe_light_first \
  --skip-retry-failed \
  "${EXTRA_ARGS[@]}"
WATCH_RC=$?
set -e

"$PYTHON_BIN" scripts/quantlab/report_overnight_stability_q1.py \
  --quant-root "$QUANT_ROOT" \
  --job-name-prefix overnight_q1_training_sweep_safe_ \
  --lookback-jobs "$STABILITY_LOOKBACK_JOBS" \
  --print-summary || true

exit "$WATCH_RC"
