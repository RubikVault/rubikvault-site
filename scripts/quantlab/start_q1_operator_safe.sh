#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
if [[ -z "$MODE" || ( "$MODE" != "day" && "$MODE" != "night" ) ]]; then
  echo "Usage: $0 day|night" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

QUANT_ROOT="${QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
LOCK_PATH="$QUANT_ROOT/jobs/_locks/overnight_q1_training_sweep_safe.lock.json"

if [[ -f "$LOCK_PATH" ]]; then
  python3 - <<'PY'
from pathlib import Path
import json, os, sys
lock = Path(os.environ["LOCK_PATH"])
try:
    data = json.loads(lock.read_text())
    pid = int(data.get("pid") or 0)
except Exception:
    pid = 0
if pid > 0:
    try:
        os.kill(pid, 0)
        print(f"ABORT: active overnight/day run already holds lock pid={pid}")
        sys.exit(3)
    except OSError:
        pass
lock.unlink(missing_ok=True)
print("Removed stale lock.")
PY
fi

TOP_LIQUID_LIST="${Q1_SAFE_TOP_LIQUID_LIST:-2500,3500}"
PANEL_DAYS_LIST="${Q1_SAFE_PANEL_DAYS_LIST:-90}"
PANEL_MAX_ASSETS="${Q1_SAFE_PANEL_MAX_ASSETS:-5000}"
FEATURE_STORE_VERSION="${Q1_SAFE_FEATURE_STORE_VERSION:-v4_q1panel_overnight}"
ASSET_CLASSES="${Q1_SAFE_ASSET_CLASSES:-stock,etf}"
PHASEA_INCLUDE_TYPES="${Q1_SAFE_PHASEA_INCLUDE_TYPES:-STOCK,ETF,INDEX}"
FIXED_UNIVERSE_PATH="${Q1_SAFE_FIXED_UNIVERSE_PATH:-}"
OOM_DOWNSHIFT_MIN_TOP_LIQUID="${Q1_SAFE_OOM_DOWNSHIFT_MIN_TOP_LIQUID:-2500}"
PREFLIGHT_FAILURE_MODE="${Q1_SAFE_PREFLIGHT_FAILURE_MODE:-hard}"

COMMON_FLAGS=(
  --feature-store-version "$FEATURE_STORE_VERSION"
  --asset-classes "$ASSET_CLASSES"
  --phasea-include-types "$PHASEA_INCLUDE_TYPES"
  --top-liquid-list "$TOP_LIQUID_LIST"
  --panel-days-list "$PANEL_DAYS_LIST"
  --panel-max-assets "$PANEL_MAX_ASSETS"
  --task-order safe_light_first
  --v4-final-profile
  --phasea-production-mode
  --redflags-failure-mode warn
  --stageb-pass-mode strict
  --stageb-strict-gate-profile hard
  --stageb-survivors-b-q1-failure-mode warn
  --preflight-failure-mode "$PREFLIGHT_FAILURE_MODE"
  --oom-downshift-factor 0.50
  --oom-downshift-min-top-liquid "$OOM_DOWNSHIFT_MIN_TOP_LIQUID"
  --skip-run-portfolio-q1
)

if [[ -n "$FIXED_UNIVERSE_PATH" ]]; then
  COMMON_FLAGS+=(--fixed-universe-path "$FIXED_UNIVERSE_PATH")
fi

export THREADS_CAP="${THREADS_CAP:-1}"
export MAX_RSS_GIB="${MAX_RSS_GIB:-8.3}"
export MAX_RETRIES_PER_TASK="${MAX_RETRIES_PER_TASK:-1}"
export CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-60}"
export STALE_DRIVER_MINUTES="${STALE_DRIVER_MINUTES:-20}"
export STALE_HEARTBEAT_MINUTES="${STALE_HEARTBEAT_MINUTES:-30}"
export STALE_MIN_ELAPSED_MINUTES="${STALE_MIN_ELAPSED_MINUTES:-15}"
export STALE_CPU_PCT_MAX="${STALE_CPU_PCT_MAX:-1.0}"

if [[ "$MODE" == "day" ]]; then
  export JOB_NAME="${JOB_NAME:-day_q1_safe_$(date +%Y%m%d_%H%M%S)}"
  export MAX_HOURS="${MAX_HOURS:-3.5}"
  export WATCH_HOURS="${WATCH_HOURS:-4.0}"
  export TASK_TIMEOUT_MINUTES="${TASK_TIMEOUT_MINUTES:-150}"
  export SLEEP_BETWEEN_TASKS_SEC="${SLEEP_BETWEEN_TASKS_SEC:-30}"
  export STOP_AFTER_CONSECUTIVE_FAILURES="${STOP_AFTER_CONSECUTIVE_FAILURES:-4}"
  EXTRA_FLAGS=(--asof-dates-count "${DAY_ASOF_DATES_COUNT:-2}")
else
  export JOB_NAME="${JOB_NAME:-overnight_q1_safe10h_$(date +%Y%m%d_%H%M%S)}"
  export MAX_HOURS="${MAX_HOURS:-8.25}"
  export WATCH_HOURS="${WATCH_HOURS:-8.6}"
  export TASK_TIMEOUT_MINUTES="${TASK_TIMEOUT_MINUTES:-80}"
  export SLEEP_BETWEEN_TASKS_SEC="${SLEEP_BETWEEN_TASKS_SEC:-10}"
  export STOP_AFTER_CONSECUTIVE_FAILURES="${STOP_AFTER_CONSECUTIVE_FAILURES:-6}"
  EXTRA_FLAGS=(--asof-dates-count "${NIGHT_ASOF_DATES_COUNT:-4}")
fi

echo "Starting $MODE run: $JOB_NAME"
exec "$REPO_ROOT/scripts/quantlab/run_overnight_q1_supervised_safe.sh" \
  "${COMMON_FLAGS[@]}" \
  "${EXTRA_FLAGS[@]}"
