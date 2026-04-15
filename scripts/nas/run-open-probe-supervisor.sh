#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OPS_ROOT="${OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
if [[ -f "$OPS_ROOT/tooling/env.sh" ]]; then
  # shellcheck disable=SC1090
  . "$OPS_ROOT/tooling/env.sh"
fi

SUPERVISOR_STAMP="${SUPERVISOR_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SUPERVISOR_DIR="$OPS_ROOT/runtime/open-probes/supervisors/$SUPERVISOR_STAMP"
SUPERVISOR_LOG="$SUPERVISOR_DIR/supervisor.log"
STATUS_JSON="$SUPERVISOR_DIR/status.json"
LOCK_DIR="$OPS_ROOT/runtime/open-probes/locks/open-probe-supervisor.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
LOCK_HEARTBEAT_FILE="$LOCK_DIR/heartbeat"
CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-1800}"
STALE_THRESHOLD_SEC="${STALE_THRESHOLD_SEC:-2700}"
END_LOCAL_DATE="${END_LOCAL_DATE:-}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-23}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
RUN_WATCHDOG_EACH_CYCLE="${RUN_WATCHDOG_EACH_CYCLE:-0}"
WATCHDOG_SCRIPT="${WATCHDOG_SCRIPT:-$REPO_ROOT/scripts/nas/rv-nas-watchdog.sh}"
MAX_CYCLES="${MAX_CYCLES:-480}"
SLEEP_BETWEEN_PROBES_SEC="${SLEEP_BETWEEN_PROBES_SEC:-15}"
SLEEP_BETWEEN_CYCLES_SEC="${SLEEP_BETWEEN_CYCLES_SEC:-120}"
PROBE_PLAN_VERSION="${PROBE_PLAN_VERSION:-2026-04-13a}"

mkdir -p "$SUPERVISOR_DIR" "$(dirname "$LOCK_DIR")"
: > "$SUPERVISOR_LOG"

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_PID_FILE"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$LOCK_HEARTBEAT_FILE"
    return 0
  fi

  local existing_pid=""
  if [[ -f "$LOCK_PID_FILE" ]]; then
    existing_pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
  fi

  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "open_probe_supervisor_lock_busy=$LOCK_DIR pid=$existing_pid" >&2
    exit 90
  fi

  rm -rf "$LOCK_DIR"
  mkdir -p "$LOCK_DIR"
  printf '%s\n' "$$" > "$LOCK_PID_FILE"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$LOCK_HEARTBEAT_FILE"
}

refresh_lock() {
  [[ -d "$LOCK_DIR" ]] || return 0
  printf '%s\n' "$$" > "$LOCK_PID_FILE"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$LOCK_HEARTBEAT_FILE"
}

acquire_lock
trap 'rm -rf "$LOCK_DIR"' EXIT

target_end_iso() {
  python3 - "$END_LOCAL_DATE" "$END_LOCAL_HOUR" "$END_LOCAL_MINUTE" <<'PY'
from datetime import datetime, timedelta
import sys

date_arg, hh, mm = sys.argv[1:4]
now = datetime.now().astimezone()
if date_arg:
    year, month, day = [int(part) for part in date_arg.split("-")]
    end = now.replace(year=year, month=month, day=day, hour=int(hh), minute=int(mm), second=0, microsecond=0)
else:
    end = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    if end <= now:
        end = end + timedelta(days=1)
print(end.isoformat())
PY
}

TARGET_END_LOCAL="$(target_end_iso)"

write_status() {
  local phase="$1"
  local note="$2"
  local campaign_stamp="${3:-}"
  local supervisor_pid="$$"
  refresh_lock
  python3 - "$STATUS_JSON" "$SUPERVISOR_STAMP" "$TARGET_END_LOCAL" "$phase" "$note" "$campaign_stamp" "$CHECK_INTERVAL_SEC" "$STALE_THRESHOLD_SEC" "$supervisor_pid" "$PROBE_PLAN_VERSION" <<'PY'
import json
import os
import sys

path, stamp, target_end, phase, note, campaign, check_interval, stale, supervisor_pid, plan_version = sys.argv[1:11]
doc = {
    "schema_version": "nas.open.probe.supervisor.status.v1",
    "generated_at": __import__("datetime").datetime.now().astimezone().isoformat(),
    "supervisor_stamp": stamp,
    "target_end_local": target_end,
    "phase": phase,
    "note": note,
    "watched_campaign_stamp": campaign or None,
    "current_pid": int(supervisor_pid),
    "check_interval_sec": int(check_interval),
    "stale_threshold_sec": int(stale),
    "probe_plan_version": plan_version,
}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

run_watchdog() {
  if [[ "$RUN_WATCHDOG_EACH_CYCLE" != "1" ]]; then
    return 0
  fi
  if [[ ! -f "$WATCHDOG_SCRIPT" ]]; then
    echo "watchdog_script_missing=$WATCHDOG_SCRIPT" >> "$SUPERVISOR_LOG"
    return 0
  fi
  bash "$WATCHDOG_SCRIPT" >> "$SUPERVISOR_LOG" 2>&1 || true
}

should_continue() {
  python3 - "$TARGET_END_LOCAL" <<'PY'
from datetime import datetime
import sys
end = datetime.fromisoformat(sys.argv[1])
now = datetime.now().astimezone()
print("yes" if now < end else "no")
PY
}

latest_campaign_status() {
  python3 - "$OPS_ROOT/runtime/open-probes/campaigns" "$STALE_THRESHOLD_SEC" "$PROBE_PLAN_VERSION" <<'PY'
import glob
import json
import os
import subprocess
import sys
import time
from datetime import datetime

root, stale, expected_plan = sys.argv[1], int(sys.argv[2]), sys.argv[3]
winner = None
if not os.path.isdir(root):
    print("")
    raise SystemExit(0)
for path in glob.glob(os.path.join(root, '*', 'status.json')):
    try:
        doc = json.load(open(path, 'r', encoding='utf-8'))
    except Exception:
        continue
    if str(doc.get('probe_plan_version') or '') != expected_plan:
        continue
    fresh = (time.time() - os.path.getmtime(path)) <= stale
    status = str(doc.get('last_status') or '')
    target_end = doc.get('target_end_local')
    pid = str(doc.get('current_pid') or '').strip()
    stamp = doc.get('campaign_stamp') or os.path.basename(os.path.dirname(path))
    if not target_end or not pid:
        continue
    try:
        end = datetime.fromisoformat(target_end)
    except Exception:
        continue
    if end <= datetime.now().astimezone():
        continue
    alive = subprocess.call(['kill', '-0', pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    score = 0
    if alive and fresh and status == 'running':
        score = 4
    elif fresh and status == 'completed':
        score = 3
    elif fresh:
        score = 2
    elif alive:
        score = 1
    candidate = (score, doc.get('started_at') or '', stamp)
    if winner is None or candidate > winner:
        winner = candidate
print(winner[2] if winner else '')
PY
}

campaign_is_healthy() {
  local stamp="$1"
  python3 - "$OPS_ROOT/runtime/open-probes/campaigns/$stamp/status.json" "$STALE_THRESHOLD_SEC" <<'PY'
import json
import os
import subprocess
import sys
import time

path, stale = sys.argv[1], int(sys.argv[2])
if not os.path.exists(path):
    print("no")
    raise SystemExit(0)
doc = json.load(open(path, "r", encoding="utf-8"))
fresh = (time.time() - os.path.getmtime(path)) <= stale
pid = str(doc.get("current_pid") or "").strip()
alive = False
if pid:
    alive = subprocess.call(["kill", "-0", pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
print("yes" if alive and fresh and str(doc.get("last_status")) == "running" else "no")
PY
}

start_campaign() {
  local campaign_stamp
  campaign_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  (
    cd "$REPO_ROOT"
    exec env \
      OPS_ROOT="$OPS_ROOT" \
      CAMPAIGN_STAMP="$campaign_stamp" \
      END_LOCAL_DATE="${END_LOCAL_DATE:-}" \
      END_LOCAL_HOUR="$END_LOCAL_HOUR" \
      END_LOCAL_MINUTE="$END_LOCAL_MINUTE" \
      MAX_CYCLES="$MAX_CYCLES" \
      SLEEP_BETWEEN_PROBES_SEC="$SLEEP_BETWEEN_PROBES_SEC" \
      SLEEP_BETWEEN_CYCLES_SEC="$SLEEP_BETWEEN_CYCLES_SEC" \
      PROBE_PLAN_VERSION="$PROBE_PLAN_VERSION" \
      bash scripts/nas/run-open-probe-campaign.sh
  ) >> "$SUPERVISOR_LOG" 2>&1 &
  printf '%s\n' "$campaign_stamp"
}

current_campaign="$(latest_campaign_status)"
write_status "monitoring" "supervisor_started" "$current_campaign"
run_watchdog

while [[ "$(should_continue)" == "yes" ]]; do
  refresh_lock
  run_watchdog
  current_campaign="$(latest_campaign_status)"
  if [[ -z "$current_campaign" ]]; then
    new_campaign="$(start_campaign)"
    write_status "monitoring" "campaign_started" "$new_campaign"
  elif [[ "$(campaign_is_healthy "$current_campaign")" == "yes" ]]; then
    node "$REPO_ROOT/scripts/nas/build-open-probe-report.mjs" >> "$SUPERVISOR_LOG" 2>&1 || true
    write_status "monitoring" "campaign_healthy" "$current_campaign"
  else
    new_campaign="$(start_campaign)"
    write_status "monitoring" "campaign_restarted" "$new_campaign"
  fi
  sleep "$CHECK_INTERVAL_SEC"
done

run_watchdog
node "$REPO_ROOT/scripts/nas/build-open-probe-report.mjs" >> "$SUPERVISOR_LOG" 2>&1 || true
write_status "completed" "target_window_reached" "$(latest_campaign_status)"
