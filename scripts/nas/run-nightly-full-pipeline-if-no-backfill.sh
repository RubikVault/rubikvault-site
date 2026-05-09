#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

usage() {
  cat <<'EOF'
Usage: run-nightly-full-pipeline-if-no-backfill.sh [--dry-run]

Starts the NAS nightly full pipeline only when schedule, backfill, pipeline,
and rogue-process guards pass.

Options:
  --dry-run   Run guards, write dry-run state, do not start pipeline.
  -h, --help  Show this help.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"

DRY_RUN="${RV_NIGHTLY_DRY_RUN:-0}"
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      ;;
    *)
      echo "unknown_arg=$arg"
      usage
      exit 64
      ;;
  esac
done

nas_ensure_runtime_roots

STATE_JSON="$NAS_NIGHT_PIPELINE_ROOT/scheduled/nightly-full-latest.json"
BACKFILL_STATE_JSON="${BACKFILL_STATE_JSON:-$NAS_RUNTIME_ROOT/history-backfill/max-history-latest.json}"
PIPELINE_LATEST_JSON="${PIPELINE_LATEST_JSON:-$NAS_NIGHT_PIPELINE_ROOT/latest.json}"

nightly_schedule_allowed() {
  if [[ "${RV_FORCE_NIGHTLY_RUN:-0}" == "1" ]]; then
    return 0
  fi
  local dow
  dow="${RV_NIGHTLY_DOW_OVERRIDE:-$(date +%u)}"
  [[ "$dow" -ge 2 && "$dow" -le 6 ]]
}

nightly_schedule_dow() {
  echo "${RV_NIGHTLY_DOW_OVERRIDE:-$(date +%u)}"
}

nightly_target_market_date() {
  TZ=America/New_York python3 - <<'PY'
from datetime import datetime, timedelta

now = datetime.now()
candidate = now.date()
if now.weekday() >= 5 or now.hour < 18:
    candidate -= timedelta(days=1)
while candidate.weekday() >= 5:
    candidate -= timedelta(days=1)
print(candidate.isoformat())
PY
}

backfill_is_active() {
  python3 - "$BACKFILL_STATE_JSON" <<'PY'
import json
import os
import sys

needles = (
    "run-max-history-priority-backfill.sh",
    "full_history_priority_backfill",
    "max_history_priority",
)
if os.path.isdir("/proc"):
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            cmdline = open(f"/proc/{name}/cmdline", "rb").read().decode("utf-8", "replace")
        except Exception:
            continue
        if any(needle in cmdline for needle in needles):
            sys.exit(0)

state_path = sys.argv[1]
try:
    with open(state_path, "r", encoding="utf-8") as fh:
        doc = json.load(fh)
    pid = int(doc.get("pid") or 0)
except Exception:
    sys.exit(1)
if pid <= 0:
    sys.exit(1)
try:
    cmdline = open(f"/proc/{pid}/cmdline", "rb").read().decode("utf-8", "replace")
except Exception:
    sys.exit(1)
if "refresh_v7_history_from_eodhd.py" in cmdline and "full_history_priority_backfill" in cmdline:
    sys.exit(0)
sys.exit(1)
PY
}

pipeline_is_active() {
  python3 - "$PIPELINE_LATEST_JSON" <<'PY'
import json
import os
import sys

needles = (
    "rv-nas-night-supervisor.sh",
    "run-nightly-full-pipeline.sh",
)
if os.path.isdir("/proc"):
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            cmdline = open(f"/proc/{name}/cmdline", "rb").read().decode("utf-8", "replace")
        except Exception:
            continue
        if any(needle in cmdline for needle in needles) and "run-nightly-full-pipeline-if-no-backfill.sh" not in cmdline:
            sys.exit(0)

latest_path = sys.argv[1]
try:
    with open(latest_path, "r", encoding="utf-8") as fh:
        doc = json.load(fh)
except Exception:
    sys.exit(1)
if doc.get("last_status") != "running":
    sys.exit(1)
pid = int(doc.get("current_pid") or 0)
if pid <= 0:
    sys.exit(1)
try:
    cmdline = open(f"/proc/{pid}/cmdline", "rb").read().decode("utf-8", "replace")
except Exception:
    sys.exit(1)
if "rv-nas-night-supervisor.sh" in cmdline or "measure-command.py" in cmdline:
    sys.exit(0)
sys.exit(1)
PY
}

rogue_pipeline_is_active() {
  python3 <<'PY'
import os
import sys

needles = (
    "run-pipeline-master-supervisor.mjs",
    "run-dashboard-green-recovery.mjs",
    "run-hist-probs-turbo.mjs",
    "measure-command.py",
)
allowed = (
    "rv-nas-night-supervisor.sh",
    "run-nightly-full-pipeline.sh",
    "run-nightly-full-pipeline-if-no-backfill.sh",
)
if os.path.isdir("/proc"):
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            cmdline = open(f"/proc/{name}/cmdline", "rb").read().decode("utf-8", "replace")
        except Exception:
            continue
        if not cmdline:
            continue
        if any(needle in cmdline for needle in needles) and not any(item in cmdline for item in allowed):
            print(f"rogue_pipeline_process pid={name} cmd={cmdline.replace(chr(0), ' ')[:240]}", file=sys.stderr)
            sys.exit(0)
sys.exit(1)
PY
}

write_skip_state() {
  local skip_reason="$1"
  local dow="$2"
  local target_market_date="$3"
  python3 - "$STATE_JSON" "$BACKFILL_STATE_JSON" "$skip_reason" "$dow" "$target_market_date" "${RV_FORCE_NIGHTLY_RUN:-0}" <<'PY'
import json
import os
import sys
from datetime import datetime

state_path, backfill_state_path, skip_reason, dow, target_market_date, force = sys.argv[1:7]
doc = {}
if os.path.exists(state_path):
    try:
        with open(state_path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        doc = {}
now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
doc.update({
    "schema_version": "nas.nightly_full_pipeline.schedule.v1",
    "updated_at": now,
    "status": "skipped",
    "current_lane": None,
    "exit_code": 0,
    "skip_reason": skip_reason,
    "schedule_policy": "trading_eod_tue_sat_v1",
    "dow": int(dow) if str(dow).isdigit() else dow,
    "force": force == "1",
    "target_market_date": target_market_date,
    "expected_eod_lag_policy": "early_morning_runs_process_last_completed_market_day",
    "backfill_state_path": backfill_state_path,
})
doc.setdefault("started_at", now)
doc["finished_at"] = now
os.makedirs(os.path.dirname(state_path), exist_ok=True)
with open(state_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

write_dry_run_state() {
  local dow="$1"
  local target_market_date="$2"
  python3 - "$STATE_JSON" "$BACKFILL_STATE_JSON" "$dow" "$target_market_date" "${RV_FORCE_NIGHTLY_RUN:-0}" <<'PY'
import json
import os
import sys
from datetime import datetime

state_path, backfill_state_path, dow, target_market_date, force = sys.argv[1:6]
now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
doc = {
    "schema_version": "nas.nightly_full_pipeline.schedule.v1",
    "updated_at": now,
    "started_at": now,
    "finished_at": now,
    "status": "dry_run_ready",
    "current_lane": None,
    "exit_code": 0,
    "skip_reason": None,
    "schedule_policy": "trading_eod_tue_sat_v1",
    "dow": int(dow) if str(dow).isdigit() else dow,
    "force": force == "1",
    "target_market_date": target_market_date,
    "expected_eod_lag_policy": "early_morning_runs_process_last_completed_market_day",
    "backfill_state_path": backfill_state_path,
}
os.makedirs(os.path.dirname(state_path), exist_ok=True)
with open(state_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

SCHEDULE_DOW="$(nightly_schedule_dow)"
TARGET_MARKET_DATE="$(nightly_target_market_date)"

if ! nightly_schedule_allowed; then
  write_skip_state "outside_market_pipeline_schedule" "$SCHEDULE_DOW" "$TARGET_MARKET_DATE"
  echo "nightly_full_skipped=outside_market_pipeline_schedule schedule_policy=trading_eod_tue_sat_v1 dow=$SCHEDULE_DOW target_market_date=$TARGET_MARKET_DATE force_with_RV_FORCE_NIGHTLY_RUN=1"
  exit 0
fi

if backfill_is_active; then
  write_skip_state "history_backfill_active" "$SCHEDULE_DOW" "$TARGET_MARKET_DATE"
  echo "nightly_full_skipped=history_backfill_active state=$BACKFILL_STATE_JSON"
  exit 0
fi

if pipeline_is_active; then
  write_skip_state "night_pipeline_active" "$SCHEDULE_DOW" "$TARGET_MARKET_DATE"
  echo "nightly_full_skipped=night_pipeline_active state=$PIPELINE_LATEST_JSON"
  exit 0
fi

if rogue_pipeline_is_active; then
  write_skip_state "rogue_pipeline_process_active" "$SCHEDULE_DOW" "$TARGET_MARKET_DATE"
  echo "nightly_full_skipped=rogue_pipeline_process_active"
  exit 0
fi

if [[ "$DRY_RUN" == "1" ]]; then
  write_dry_run_state "$SCHEDULE_DOW" "$TARGET_MARKET_DATE"
  echo "nightly_full_dry_run_ready=1 wrapper_checks_passed=1 schedule_policy=trading_eod_tue_sat_v1 dow=$SCHEDULE_DOW target_market_date=$TARGET_MARKET_DATE"
  exit 0
fi

exec "$REPO_ROOT/scripts/nas/run-nightly-full-pipeline.sh"
