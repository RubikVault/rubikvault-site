#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

QUANT_ROOT="${QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
JOB_NAME="${JOB_NAME:-night_q1_block_$(date +%Y%m%d_%H%M)}"
GLOBAL_LOCK_NAME="${GLOBAL_LOCK_NAME:-night_q1_block_lock}"

FEATURE_STORE_VERSION="${FEATURE_STORE_VERSION:-v4_q1panel_night}"
ASSET_CLASSES="${ASSET_CLASSES:-stock,etf}"
PANEL_DAYS_LIST="${PANEL_DAYS_LIST:-60,90}"
TOP_LIQUID_LIST="${TOP_LIQUID_LIST:-2500,3500,5000}"
ASOF_DATES_COUNT="${ASOF_DATES_COUNT:-4}"
PANEL_MAX_ASSETS="${PANEL_MAX_ASSETS:-5000}"
MIN_BARS="${MIN_BARS:-200}"
REDFLAGS_FAILURE_MODE="${REDFLAGS_FAILURE_MODE:-warn}"

MAX_HOURS="${MAX_HOURS:-9.5}"
TASK_TIMEOUT_MINUTES="${TASK_TIMEOUT_MINUTES:-180}"
THREADS_CAP="${THREADS_CAP:-1}"
MAX_RSS_GIB="${MAX_RSS_GIB:-8.0}"
RUN_PREFLIGHT="${RUN_PREFLIGHT:-1}"
PREFLIGHT_RUN_MICRO_PROBE="${PREFLIGHT_RUN_MICRO_PROBE:-1}"
PREFLIGHT_MIN_FREE_DISK_GB="${PREFLIGHT_MIN_FREE_DISK_GB:-30}"
PREFLIGHT_PROBE_TIMEOUT_MINUTES="${PREFLIGHT_PROBE_TIMEOUT_MINUTES:-35}"
STAGEB_MIN_SURVIVORS_B_Q1="${STAGEB_MIN_SURVIVORS_B_Q1:-1}"
STAGEB_SURVIVORS_B_Q1_FAILURE_MODE="${STAGEB_SURVIVORS_B_Q1_FAILURE_MODE:-warn}"
STAGEB_CPCV_LIGHT_MIN_PATHS_TOTAL="${STAGEB_CPCV_LIGHT_MIN_PATHS_TOTAL:-3}"
STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATHS="${STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATHS:-3}"
STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATH_RATIO="${STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATH_RATIO:-0.50}"

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

if [[ "$RUN_PREFLIGHT" == "1" ]]; then
  preflight_cmd=(
    "$PYTHON_BIN" scripts/quantlab/run_q1_night_preflight.py
    --quant-root "$QUANT_ROOT"
    --python "$PYTHON_BIN"
    --snapshot-id "$SNAPSHOT_ID"
    --global-lock-name "$GLOBAL_LOCK_NAME"
    --min-free-disk-gb "$PREFLIGHT_MIN_FREE_DISK_GB"
    --probe-timeout-minutes "$PREFLIGHT_PROBE_TIMEOUT_MINUTES"
    --probe-panel-max-assets "$PREFLIGHT_PROBE_PANEL_MAX_ASSETS"
    --probe-top-liquid-n "$PREFLIGHT_PROBE_TOP_LIQUID_N"
    --probe-min-bars "$PREFLIGHT_PROBE_MIN_BARS"
    --probe-survivors-max "$PREFLIGHT_PROBE_SURVIVORS_MAX"
    --probe-v4-final-profile
    --job-name "night_preflight_$(date +%Y%m%d_%H%M%S)"
  )
  if [[ "$PREFLIGHT_RUN_MICRO_PROBE" == "1" ]]; then
    preflight_cmd+=(--run-micro-probe)
  else
    preflight_cmd+=(--skip-micro-probe)
  fi
  "${preflight_cmd[@]}"
fi

exec "$PYTHON_BIN" scripts/quantlab/run_overnight_q1_training_sweep.py \
  --quant-root "$QUANT_ROOT" \
  --snapshot-id "$SNAPSHOT_ID" \
  --feature-store-version "$FEATURE_STORE_VERSION" \
  --asset-classes "$ASSET_CLASSES" \
  --panel-days-list "$PANEL_DAYS_LIST" \
  --top-liquid-list "$TOP_LIQUID_LIST" \
  --asof-dates-count "$ASOF_DATES_COUNT" \
  --panel-max-assets "$PANEL_MAX_ASSETS" \
  --min-bars "$MIN_BARS" \
  --redflags-failure-mode "$REDFLAGS_FAILURE_MODE" \
  --stageb-min-survivors-b-q1 "$STAGEB_MIN_SURVIVORS_B_Q1" \
  --stageb-survivors-b-q1-failure-mode "$STAGEB_SURVIVORS_B_Q1_FAILURE_MODE" \
  --stageb-cpcv-light-min-effective-paths "$STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATHS" \
  --stageb-cpcv-light-min-effective-path-ratio "$STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATH_RATIO" \
  --stageb-cpcv-light-min-paths-total "$STAGEB_CPCV_LIGHT_MIN_PATHS_TOTAL" \
  --v4-final-profile \
  --task-order safe_light_first \
  --threads-cap "$THREADS_CAP" \
  --max-rss-gib "$MAX_RSS_GIB" \
  --task-nice 17 \
  --monitor-interval-sec 5 \
  --metrics-log-interval-sec 30 \
  --stale-heartbeat-minutes 30 \
  --stale-min-elapsed-minutes 15 \
  --stale-cpu-pct-max 1.0 \
  --enforce-system-guardrails \
  --max-load-per-core 1.10 \
  --min-free-disk-gb 30 \
  --system-guard-check-interval-sec 20 \
  --max-system-guard-wait-minutes 45 \
  --task-timeout-minutes "$TASK_TIMEOUT_MINUTES" \
  --retryable-exit-codes 124,137,142 \
  --max-retries-per-task 1 \
  --retry-cooldown-sec 60 \
  --sleep-between-tasks-sec 30 \
  --stop-after-consecutive-failures 5 \
  --max-hours "$MAX_HOURS" \
  --job-name "$JOB_NAME" \
  --global-lock-name "$GLOBAL_LOCK_NAME" \
  --skip-run-phasea-backbone
PREFLIGHT_PROBE_PANEL_MAX_ASSETS="${PREFLIGHT_PROBE_PANEL_MAX_ASSETS:-3000}"
PREFLIGHT_PROBE_TOP_LIQUID_N="${PREFLIGHT_PROBE_TOP_LIQUID_N:-2500}"
PREFLIGHT_PROBE_MIN_BARS="${PREFLIGHT_PROBE_MIN_BARS:-200}"
PREFLIGHT_PROBE_SURVIVORS_MAX="${PREFLIGHT_PROBE_SURVIVORS_MAX:-24}"
