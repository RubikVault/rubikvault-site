#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OPS_ROOT="${OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
if [[ -f "$OPS_ROOT/tooling/env.sh" ]]; then
  # shellcheck disable=SC1090
  . "$OPS_ROOT/tooling/env.sh"
fi

SUPERVISOR_STAMP="${SUPERVISOR_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SUPERVISOR_DIR="$OPS_ROOT/runtime/native-matrix/supervisors/$SUPERVISOR_STAMP"
SUPERVISOR_LOG="$SUPERVISOR_DIR/supervisor.log"
STATUS_JSON="$SUPERVISOR_DIR/status.json"
LOCK_DIR="$OPS_ROOT/runtime/native-matrix/locks/native-supervisor.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
LOCK_HEARTBEAT_FILE="$LOCK_DIR/heartbeat"
CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-600}"
STALE_THRESHOLD_SEC="${STALE_THRESHOLD_SEC:-1800}"
END_LOCAL_DATE="${END_LOCAL_DATE:-}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-20}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
RUN_WATCHDOG_EACH_CYCLE="${RUN_WATCHDOG_EACH_CYCLE:-0}"
WATCHDOG_SCRIPT="${WATCHDOG_SCRIPT:-$REPO_ROOT/scripts/nas/rv-nas-watchdog.sh}"

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
    echo "native_supervisor_lock_busy=$LOCK_DIR pid=$existing_pid" >&2
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
  python3 - "$STATUS_JSON" "$SUPERVISOR_STAMP" "$TARGET_END_LOCAL" "$phase" "$note" "$campaign_stamp" "$CHECK_INTERVAL_SEC" "$STALE_THRESHOLD_SEC" "$supervisor_pid" <<'PY'
import json
import os
import sys

path, stamp, target_end, phase, note, campaign, check_interval, stale, supervisor_pid = sys.argv[1:10]
doc = {
    "schema_version": "nas.native.matrix.supervisor.status.v1",
    "generated_at": __import__("datetime").datetime.now().astimezone().isoformat(),
    "supervisor_stamp": stamp,
    "target_end_local": target_end,
    "phase": phase,
    "note": note,
    "watched_campaign_stamp": campaign or None,
    "current_pid": int(supervisor_pid),
    "check_interval_sec": int(check_interval),
    "stale_threshold_sec": int(stale),
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
  python3 - "$OPS_ROOT/runtime/native-matrix/campaigns" "$STALE_THRESHOLD_SEC" <<'PY'
import json
import os
import sys
import time

root, stale = sys.argv[1], int(sys.argv[2])
winner = None
if not os.path.isdir(root):
    print("")
    raise SystemExit(0)
for name in sorted(os.listdir(root)):
    status_path = os.path.join(root, name, "status.json")
    if not os.path.exists(status_path):
        continue
    try:
        doc = json.load(open(status_path, "r", encoding="utf-8"))
    except Exception:
        continue
    fresh = (time.time() - os.path.getmtime(status_path)) <= stale
    status = str(doc.get("last_status") or "")
    cycles = int(doc.get("cycles_completed") or 0)
    pid = str(doc.get("current_pid") or "").strip()
    alive = False
    if pid:
        alive = __import__("subprocess").call(["kill", "-0", pid], stdout=__import__("subprocess").DEVNULL, stderr=__import__("subprocess").DEVNULL) == 0
    score = 0
    if alive and fresh and status == "running":
        score = 4
    elif fresh and status == "completed":
        score = 3
    elif fresh and cycles > 0:
        score = 2
    elif cycles > 0:
        score = 1
    candidate = (score, doc.get("started_at") or "", name)
    if winner is None or candidate > winner:
        winner = candidate
print(winner[2] if winner else "")
PY
}

campaign_is_healthy() {
  local stamp="$1"
  python3 - "$OPS_ROOT/runtime/native-matrix/campaigns/$stamp/status.json" "$STALE_THRESHOLD_SEC" <<'PY'
import json
import os
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
    alive = __import__("subprocess").call(["kill", "-0", pid], stdout=__import__("subprocess").DEVNULL, stderr=__import__("subprocess").DEVNULL) == 0
print("yes" if alive and fresh and str(doc.get("last_status")) == "running" else "no")
PY
}

start_campaign() {
  local campaign_stamp
  campaign_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  (
    cd "$REPO_ROOT"
    exec env \
      CAMPAIGN_STAMP="$campaign_stamp" \
      END_LOCAL_DATE="${END_LOCAL_DATE:-}" \
      END_LOCAL_HOUR="$END_LOCAL_HOUR" \
      END_LOCAL_MINUTE="$END_LOCAL_MINUTE" \
      bash scripts/nas/run-native-matrix-campaign.sh
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
    node "$REPO_ROOT/scripts/nas/build-native-matrix-report.mjs" >> "$SUPERVISOR_LOG" 2>&1 || true
    write_status "monitoring" "campaign_healthy" "$current_campaign"
  else
    new_campaign="$(start_campaign)"
    write_status "monitoring" "campaign_restarted" "$new_campaign"
  fi
  sleep "$CHECK_INTERVAL_SEC"
done

run_watchdog
node "$REPO_ROOT/scripts/nas/build-native-matrix-report.mjs" >> "$SUPERVISOR_LOG" 2>&1 || true
write_status "completed" "target_window_reached" "$(latest_campaign_status)"
