#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LABEL="com.rubikvault.stock-analyzer.overnight-autopilot"
LOG_DIR="$REPO_ROOT/mirrors/ops/logs"
STATE_DIR="$REPO_ROOT/mirrors/ops/nightly-stock-analyzer"
PUBLIC_STATUS="$REPO_ROOT/public/data/reports/nightly-stock-analyzer-status.json"
MIRROR_STATUS="$STATE_DIR/nightly-stock-analyzer-status.json"
LOCK_FILE="$STATE_DIR/nightly-stock-analyzer.lock.json"
mkdir -p "$LOG_DIR" "$STATE_DIR" "$(dirname "$PUBLIC_STATUS")"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FINISHED_AT=""
LOG_FILE="$LOG_DIR/nightly_stock_analyzer_${TS}.log"
LATEST_LINK="$LOG_DIR/nightly_stock_analyzer.latest.log"
ln -sfn "$LOG_FILE" "$LATEST_LINK"
touch "$LOG_FILE"

PYTHON_BIN="${PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
CAFFEINATE_BIN="${CAFFEINATE_BIN:-/usr/bin/caffeinate}"

TARGET_V7_WORKERS="${TARGET_V7_WORKERS:-4}"
MAX_STEP_RETRIES="${MAX_STEP_RETRIES:-2}"
LOOP_SLEEP_SEC="${LOOP_SLEEP_SEC:-45}"
RUN_HEARTBEAT_SEC="${RUN_HEARTBEAT_SEC:-60}"
OVERNIGHT_CUTOFF_HOUR="${OVERNIGHT_CUTOFF_HOUR:-7}"
OVERNIGHT_CUTOFF_MINUTE="${OVERNIGHT_CUTOFF_MINUTE:-30}"
FULL_REBUILD_MAX_CYCLES="${FULL_REBUILD_MAX_CYCLES:-1}"
POST_FULL_REBUILD_CADENCE="${POST_FULL_REBUILD_CADENCE:-maintenance}"

CURRENT_STEP="boot"
CURRENT_PHASE="starting"
CURRENT_CYCLE=0
CURRENT_ATTEMPT=0
LAST_SUCCESSFUL_STEP=""
LAST_ERROR=""
FAILED_STEPS_JSON="[]"
STEP_RESULTS_JSON="[]"
HEARTBEAT_AT="$STARTED_AT"
FULL_REBUILD_DONE=0
CAFFEINATE_PID=""
FINAL_RC=""

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
  return 1
}

NODE_BIN="$(find_bin "${NODE_BIN:-}" node || true)"
NPM_BIN="$(find_bin "${NPM_BIN:-}" npm || true)"
if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL: python not executable: $PYTHON_BIN" >&2
  exit 2
fi
if [[ -z "$NODE_BIN" || -z "$NPM_BIN" ]]; then
  echo "FATAL: node/npm missing" >&2
  exit 2
fi

run_with_timeout() {
  local timeout_sec="$1"
  shift
  python3 - <<'PY' "$timeout_sec" "$@"
import subprocess
import sys

timeout_sec = int(sys.argv[1])
cmd = sys.argv[2:]
try:
    completed = subprocess.run(cmd, check=False, timeout=timeout_sec)
except subprocess.TimeoutExpired:
    print(f"TIMEOUT_EXPIRED: {timeout_sec}s", file=sys.stderr, flush=True)
    raise SystemExit(124)
except Exception as exc:
    print(f"FAILED_TO_START: {exc}", file=sys.stderr, flush=True)
    raise SystemExit(125)
raise SystemExit(completed.returncode)
PY
}

pid_alive() {
  local pid="${1:-0}"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

write_status() {
  HEARTBEAT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export LABEL STARTED_AT FINISHED_AT LOG_FILE LOCK_FILE CURRENT_STEP CURRENT_PHASE CURRENT_CYCLE CURRENT_ATTEMPT
  export LAST_SUCCESSFUL_STEP LAST_ERROR FAILED_STEPS_JSON STEP_RESULTS_JSON HEARTBEAT_AT FULL_REBUILD_DONE FINAL_RC
  export PUBLIC_STATUS MIRROR_STATUS
  python3 - <<'PY'
import json
import os
import socket
import tempfile
from pathlib import Path

def write_atomic(path_str, payload):
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    Path(tmp_name).replace(path)

def parse_json(value, fallback):
    try:
        return json.loads(value)
    except Exception:
        return fallback

def parse_int(value):
    try:
        return int(str(value).strip())
    except Exception:
        return None

payload = {
    "schema": "rv_stock_analyzer_nightly_status_v1",
    "label": os.environ.get("LABEL"),
    "phase": os.environ.get("CURRENT_PHASE"),
    "step": os.environ.get("CURRENT_STEP"),
    "cycle": parse_int(os.environ.get("CURRENT_CYCLE")),
    "attempt": parse_int(os.environ.get("CURRENT_ATTEMPT")),
    "startedAt": os.environ.get("STARTED_AT") or None,
    "finishedAt": os.environ.get("FINISHED_AT") or None,
    "heartbeatAt": os.environ.get("HEARTBEAT_AT") or None,
    "host": socket.gethostname(),
    "logFile": os.environ.get("LOG_FILE") or None,
    "lockFile": os.environ.get("LOCK_FILE") or None,
    "fullRebuildDone": str(os.environ.get("FULL_REBUILD_DONE") or "0").strip() == "1",
    "lastSuccessfulStep": os.environ.get("LAST_SUCCESSFUL_STEP") or None,
    "lastError": os.environ.get("LAST_ERROR") or None,
    "failedSteps": parse_json(os.environ.get("FAILED_STEPS_JSON") or "[]", []),
    "stepResults": parse_json(os.environ.get("STEP_RESULTS_JSON") or "[]", []),
    "exitCode": parse_int(os.environ.get("FINAL_RC")),
    "ok": parse_int(os.environ.get("FINAL_RC")) == 0 if os.environ.get("FINAL_RC") else None,
}
for target in [os.environ.get("PUBLIC_STATUS"), os.environ.get("MIRROR_STATUS")]:
    if target:
        write_atomic(target, payload)
PY
}

append_json_item() {
  local target_name="$1"
  local item_json="$2"
  export APPEND_TARGET_NAME="$target_name" APPEND_ITEM_JSON="$item_json"
  export FAILED_STEPS_JSON STEP_RESULTS_JSON
  eval "$target_name=\"$(python3 - <<'PY'
import json
import os

target_name = os.environ["APPEND_TARGET_NAME"]
item_json = os.environ["APPEND_ITEM_JSON"]
current = os.environ.get(target_name, "[]")
try:
    data = json.loads(current)
    if not isinstance(data, list):
        data = []
except Exception:
    data = []
try:
    item = json.loads(item_json)
except Exception:
    item = {"raw": item_json}
data.append(item)
print(json.dumps(data, ensure_ascii=False))
PY
)\""
}

cutoff_epoch() {
  python3 - <<'PY' "$OVERNIGHT_CUTOFF_HOUR" "$OVERNIGHT_CUTOFF_MINUTE"
from datetime import datetime, timedelta
import sys

hour = int(sys.argv[1])
minute = int(sys.argv[2])
now = datetime.now().astimezone()
cutoff = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
if now >= cutoff:
    cutoff = cutoff + timedelta(days=1)
print(int(cutoff.timestamp()))
PY
}

ensure_caffeinate() {
  if [[ "${RV_OVERNIGHT_DISABLE_CAFFEINATE:-0}" == "1" ]]; then
    return 0
  fi
  if [[ -x "$CAFFEINATE_BIN" ]]; then
    "$CAFFEINATE_BIN" -dimsu -w "$$" >/dev/null 2>&1 &
    CAFFEINATE_PID="$!"
  fi
}

finish_run() {
  FINAL_RC="${1:-0}"
  CURRENT_PHASE="${2:-completed}"
  FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_status
  exit "$FINAL_RC"
}

cleanup() {
  local rc=$?
  rm -f "$LOCK_FILE"
  if [[ -n "${CAFFEINATE_PID:-}" ]]; then
    kill "$CAFFEINATE_PID" >/dev/null 2>&1 || true
  fi
  if [[ -z "${FINISHED_AT:-}" ]]; then
    FINAL_RC="${FINAL_RC:-$rc}"
    FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    CURRENT_PHASE="unexpected_exit"
    write_status
  fi
}
trap cleanup EXIT

on_signal() {
  LAST_ERROR="Interrupted by signal"
  finish_run 130 "interrupted"
}
trap on_signal INT TERM HUP

if [[ -f "$LOCK_FILE" ]]; then
  EXISTING_PID="$(
    python3 - <<'PY' "$LOCK_FILE"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    obj = json.loads(path.read_text())
    print(int(obj.get("pid") or 0))
except Exception:
    print(0)
PY
  )"
  if pid_alive "$EXISTING_PID"; then
    FINAL_RC=0
    LAST_ERROR=""
    CURRENT_PHASE="noop_active_lock"
    write_status
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

export SHELL_LOCK_PID="$$"
python3 - <<'PY' "$LOCK_FILE"
import json, os, socket, sys
from pathlib import Path
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({
    "pid": int(os.environ.get("SHELL_LOCK_PID") or 0),
    "host": socket.gethostname(),
}))
PY

ensure_caffeinate
write_status

FULL_CYCLE_STEPS=(
  targeted_refresh
  daily_stack
  market_stats
  market_score
  scientific
  forecast_daily
  forecast_calibrate
  quantlab_self_heal
  quantlab_publish
  quantlab_report
  v3_daily
  features_v2
  features_v4
  best_setups_v4
  learning_cycle
  stock_ui_artifacts
  system_status
  dashboard_meta
  non_regression
)

MAINTENANCE_STEPS=(
  targeted_refresh
  daily_stack
  scientific
  forecast_daily
  quantlab_self_heal
  quantlab_publish
  quantlab_report
  features_v2
  features_v4
  best_setups_v4
  learning_cycle
  stock_ui_artifacts
  system_status
  dashboard_meta
  non_regression
)

CMD_ARGS=()

build_command_array() {
  local step="$1"
  CMD_ARGS=()
  case "$step" in
    targeted_refresh)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$PYTHON_BIN" "$REPO_ROOT/scripts/quantlab/run_parallel_targeted_v7_refresh.py" --repo-root "$REPO_ROOT" --python "$PYTHON_BIN" --workers "$TARGET_V7_WORKERS" --stock-top-n 90000 --etf-top-n 30000 --stale-grace-calendar-days 1 --recent-lookback-calendar-days 28 --max-retries 2 --timeout-sec 12 --job-name overnight_targeted_v7_refresh)
      ;;
    daily_stack)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/universe-v7/run-daily-stack.mjs" --skip-backfill --skip-archeology)
      ;;
    market_stats)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/providers/market-stats-v3.mjs")
      ;;
    market_score)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/providers/market-score-v3.mjs")
      ;;
    scientific)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run build:scientific-analysis)
      ;;
    forecast_daily)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/forecast/run_daily.mjs")
      ;;
    forecast_calibrate)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run forecast:calibrate)
      ;;
    quantlab_self_heal)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 /bin/bash "$REPO_ROOT/scripts/quantlab/run_quantlab_self_heal_local.sh")
      ;;
    quantlab_publish)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run quantlab:publish:stock)
      ;;
    quantlab_report)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run quantlab:report:v4)
      ;;
    v3_daily)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run build:v3:daily)
      ;;
    features_v2)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run build:features:v2)
      ;;
    features_v4)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run build:features:v4)
      ;;
    best_setups_v4)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 NODE_OPTIONS=--max-old-space-size=8192 "$NPM_BIN" run build:best-setups-v4)
      ;;
    learning_cycle)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/learning/run-daily-learning-cycle.mjs")
      ;;
    stock_ui_artifacts)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run build:stock-ui-artifacts)
      ;;
    system_status)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/ops/build-system-status-report.mjs")
      ;;
    dashboard_meta)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NODE_BIN" "$REPO_ROOT/scripts/generate_meta_dashboard_data.mjs")
      ;;
    non_regression)
      CMD_ARGS=(env PYTHONUNBUFFERED=1 "$NPM_BIN" run verify:stock-analyzer:non-regression)
      ;;
    *)
      return 1
      ;;
  esac
}

step_timeout() {
  local step="$1"
  case "$step" in
    targeted_refresh) echo 14400 ;;
    daily_stack) echo 21600 ;;
    market_stats) echo 5400 ;;
    market_score) echo 3600 ;;
    scientific) echo 21600 ;;
    forecast_daily) echo 21600 ;;
    forecast_calibrate) echo 28800 ;;
    quantlab_self_heal) echo 21600 ;;
    quantlab_publish) echo 10800 ;;
    quantlab_report) echo 7200 ;;
    v3_daily) echo 21600 ;;
    features_v2) echo 21600 ;;
    features_v4) echo 21600 ;;
    best_setups_v4) echo 21600 ;;
    learning_cycle) echo 14400 ;;
    stock_ui_artifacts) echo 10800 ;;
    system_status) echo 3600 ;;
    dashboard_meta) echo 3600 ;;
    non_regression) echo 7200 ;;
    *) echo 7200 ;;
  esac
}

run_step() {
  local step="$1"
  local timeout_sec
  timeout_sec="$(step_timeout "$step")"
  local attempt=1
  while (( attempt <= MAX_STEP_RETRIES )); do
    CURRENT_STEP="$step"
    CURRENT_ATTEMPT="$attempt"
    CURRENT_PHASE="running"
    write_status
    build_command_array "$step"
    set +e
    {
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] cycle=$CURRENT_CYCLE step=$step attempt=$attempt timeout_sec=$timeout_sec"
      printf 'cmd='
      printf '%q ' "${CMD_ARGS[@]}"
      printf '\n'
    } >>"$LOG_FILE"
    run_with_timeout "$timeout_sec" "${CMD_ARGS[@]}" >>"$LOG_FILE" 2>&1 &
    local cmd_pid=$!
    while kill -0 "$cmd_pid" >/dev/null 2>&1; do
      CURRENT_PHASE="running"
      write_status
      sleep "$RUN_HEARTBEAT_SEC"
    done
    wait "$cmd_pid"
    local rc=$?
    set -e
    local event_json
    event_json="$(python3 - <<'PY' "$step" "$attempt" "$rc"
import json, sys
from datetime import datetime, timezone
step = sys.argv[1]
attempt = int(sys.argv[2])
rc = int(sys.argv[3])
print(json.dumps({
    "step": step,
    "attempt": attempt,
    "exitCode": rc,
    "finishedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}))
PY
)"
    append_json_item STEP_RESULTS_JSON "$event_json"
    if [[ "$rc" -eq 0 ]]; then
      LAST_SUCCESSFUL_STEP="$step"
      LAST_ERROR=""
      CURRENT_PHASE="step_ok"
      write_status
      return 0
    fi
    LAST_ERROR="step=${step} attempt=${attempt} exit=${rc}"
    if (( attempt >= MAX_STEP_RETRIES )); then
      append_json_item FAILED_STEPS_JSON "$event_json"
      CURRENT_PHASE="step_failed"
      write_status
      return "$rc"
    fi
    attempt=$((attempt + 1))
    sleep "$LOOP_SLEEP_SEC"
  done
}

run_cycle() {
  local cycle_type="$1"
  CURRENT_PHASE="cycle_${cycle_type}"
  write_status
  local step
  local failure_count=0
  local cycle_steps=()
  if [[ "$cycle_type" == "full" ]]; then
    cycle_steps=("${FULL_CYCLE_STEPS[@]}")
  else
    cycle_steps=("${MAINTENANCE_STEPS[@]}")
  fi
  for step in "${cycle_steps[@]}"; do
    if ! run_step "$step"; then
      failure_count=$((failure_count + 1))
    fi
  done
  return "$failure_count"
}

CUTOFF_EPOCH="$(cutoff_epoch)"
CURRENT_PHASE="overnight_active"
write_status

while (( "$(date +%s)" < CUTOFF_EPOCH )); do
  CURRENT_CYCLE=$((CURRENT_CYCLE + 1))
  if (( FULL_REBUILD_DONE == 0 && CURRENT_CYCLE <= FULL_REBUILD_MAX_CYCLES )); then
    run_cycle "full" || true
    FULL_REBUILD_DONE=1
  else
    run_cycle "$POST_FULL_REBUILD_CADENCE" || true
  fi
  CURRENT_STEP="sleep_until_next_cycle"
  CURRENT_ATTEMPT=0
  CURRENT_PHASE="waiting"
  write_status
  sleep "$LOOP_SLEEP_SEC"
done

finish_run 0 "completed"
