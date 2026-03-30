#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/Users/michaelpuchowezki/Dev/rubikvault-site"
QUANT_ROOT="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"
PYTHON_BIN="$REPO_ROOT/quantlab/.venv/bin/python"
GLOBAL_LOCK_NAME="${GLOBAL_LOCK_NAME:-overnight_q1_training_sweep}"

# Conservative default profile to avoid overnight OOM/freeze.
NIGHT_MAX_HOURS="${NIGHT_MAX_HOURS:-14.2}"
NIGHT_TASK_TIMEOUT_MINUTES="${NIGHT_TASK_TIMEOUT_MINUTES:-80}"
NIGHT_THREADS_CAP="${NIGHT_THREADS_CAP:-1}"
NIGHT_MAX_RSS_GIB="${NIGHT_MAX_RSS_GIB:-8.3}"
NIGHT_PANEL_MAX_ASSETS="${NIGHT_PANEL_MAX_ASSETS:-5000}"
NIGHT_PANEL_DAYS_LIST="${NIGHT_PANEL_DAYS_LIST:-60}"
NIGHT_TOP_LIQUID_LIST="${NIGHT_TOP_LIQUID_LIST:-2500,3500,5000}"
NIGHT_ASOF_DATES_COUNT="${NIGHT_ASOF_DATES_COUNT:-6}"
NIGHT_MAX_RETRIES_PER_TASK="${NIGHT_MAX_RETRIES_PER_TASK:-1}"
NIGHT_MAX_FAILED_TASK_RESUME_RETRIES="${NIGHT_MAX_FAILED_TASK_RESUME_RETRIES:-0}"
NIGHT_RETRYABLE_EXIT_CODES="${NIGHT_RETRYABLE_EXIT_CODES:-1,124,137,142}"
NIGHT_RETRY_COOLDOWN_SEC="${NIGHT_RETRY_COOLDOWN_SEC:-20}"
NIGHT_SLEEP_BETWEEN_TASKS_SEC="${NIGHT_SLEEP_BETWEEN_TASKS_SEC:-10}"
NIGHT_STOP_AFTER_CONSEC_FAILS="${NIGHT_STOP_AFTER_CONSEC_FAILS:-6}"
MIN_FREE_DISK_GB="${MIN_FREE_DISK_GB:-12}"

TS="$(date +%Y%m%d_%H%M%S)"
JOB_NAME="${JOB_NAME:-night14_q1_${TS}}"
JOB_DIR="$QUANT_ROOT/jobs/$JOB_NAME"
STARTER_LOG="$QUANT_ROOT/jobs/${JOB_NAME}.starter.log"

mkdir -p "$QUANT_ROOT/jobs"
exec >>"$STARTER_LOG" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] start_night14_with_watchdog begin"
echo "REPO_ROOT=$REPO_ROOT"
echo "QUANT_ROOT=$QUANT_ROOT"
echo "JOB_NAME=$JOB_NAME"
echo "JOB_DIR=$JOB_DIR"
echo "STARTER_LOG=$STARTER_LOG"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL python not executable: $PYTHON_BIN"
  exit 21
fi

LOCK_PATH="$QUANT_ROOT/jobs/_locks/${GLOBAL_LOCK_NAME}.lock.json"
if [[ -f "$LOCK_PATH" ]]; then
  LOCK_PID="$("$PYTHON_BIN" - <<'PY' "$LOCK_PATH"
import json,sys
p=sys.argv[1]
try:
    obj=json.load(open(p))
    print(int(obj.get("pid") or 0))
except Exception:
    print(0)
PY
)"
  if [[ "${LOCK_PID:-0}" =~ ^[0-9]+$ ]] && [[ "${LOCK_PID:-0}" -gt 0 ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "FATAL active named lock: $LOCK_PATH pid=$LOCK_PID"
    exit 22
  fi
  echo "remove stale lock: $LOCK_PATH pid=${LOCK_PID:-0}"
  rm -f "$LOCK_PATH"
fi

cd "$REPO_ROOT"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] preflight start"
"$PYTHON_BIN" "$REPO_ROOT/scripts/quantlab/run_night_preflight_q1.py" \
  --quant-root "$QUANT_ROOT" \
  --global-lock-name "$GLOBAL_LOCK_NAME" \
  --min-free-disk-gb "$MIN_FREE_DISK_GB" \
  --max-rss-gib "$NIGHT_MAX_RSS_GIB" \
  --max-rss-mem-fraction 0.8 \
  --failure-mode hard
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] preflight ok"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] init job state (plan-only)"
"$PYTHON_BIN" "$REPO_ROOT/scripts/quantlab/run_overnight_q1_training_sweep.py" \
  --quant-root "$QUANT_ROOT" \
  --feature-store-version v4_q1panel_overnight \
  --asset-classes stock,etf \
  --panel-days-list "$NIGHT_PANEL_DAYS_LIST" \
  --top-liquid-list "$NIGHT_TOP_LIQUID_LIST" \
  --panel-max-assets "$NIGHT_PANEL_MAX_ASSETS" \
  --asof-dates-count "$NIGHT_ASOF_DATES_COUNT" \
  --task-order safe_light_first \
  --max-hours "$NIGHT_MAX_HOURS" \
  --task-timeout-minutes "$NIGHT_TASK_TIMEOUT_MINUTES" \
  --threads-cap "$NIGHT_THREADS_CAP" \
  --max-rss-gib "$NIGHT_MAX_RSS_GIB" \
  --state-heartbeat-interval-sec 45 \
  --stale-orphan-minutes 8 \
  --stale-heartbeat-minutes 35 \
  --stale-min-elapsed-minutes 15 \
  --max-retries-per-task "$NIGHT_MAX_RETRIES_PER_TASK" \
  --retryable-exit-codes "$NIGHT_RETRYABLE_EXIT_CODES" \
  --retry-cooldown-sec "$NIGHT_RETRY_COOLDOWN_SEC" \
  --sleep-between-tasks-sec "$NIGHT_SLEEP_BETWEEN_TASKS_SEC" \
  --stop-after-consecutive-failures "$NIGHT_STOP_AFTER_CONSEC_FAILS" \
  --v4-final-profile \
  --skip-run-phasea-backbone \
  --redflags-failure-mode warn \
  --portfolio-failure-mode warn \
  --stageb-survivors-b-q1-failure-mode warn \
  --job-name "$JOB_NAME" \
  --plan-only

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] watchdog exec begin"
exec "$PYTHON_BIN" -u "$REPO_ROOT/scripts/quantlab/watch_overnight_q1_job.py" \
  --repo-root "$REPO_ROOT" \
  --quant-root "$QUANT_ROOT" \
  --job-dir "$JOB_DIR" \
  --global-lock-name "$GLOBAL_LOCK_NAME" \
  --watch-hours 14.6 \
  --check-interval-sec 60 \
  --stale-driver-minutes 18 \
  --stale-state-minutes 22 \
  --stale-orphan-minutes 8 \
  --max-restarts 40 \
  --max-hours "$NIGHT_MAX_HOURS" \
  --task-timeout-minutes "$NIGHT_TASK_TIMEOUT_MINUTES" \
  --threads-cap "$NIGHT_THREADS_CAP" \
  --max-rss-gib "$NIGHT_MAX_RSS_GIB" \
  --min-free-disk-gb "$MIN_FREE_DISK_GB" \
  --task-nice 16 \
  --max-retries-per-task "$NIGHT_MAX_RETRIES_PER_TASK" \
  --max-failed-task-resume-retries "$NIGHT_MAX_FAILED_TASK_RESUME_RETRIES" \
  --retry-cooldown-sec "$NIGHT_RETRY_COOLDOWN_SEC" \
  --sleep-between-tasks-sec "$NIGHT_SLEEP_BETWEEN_TASKS_SEC" \
  --stop-after-consecutive-failures "$NIGHT_STOP_AFTER_CONSEC_FAILS" \
  --v4-final-profile \
  --task-order safe_light_first \
  --skip-run-phasea-backbone \
  --skip-retry-failed
