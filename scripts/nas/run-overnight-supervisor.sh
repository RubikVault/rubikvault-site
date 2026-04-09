#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

SUPERVISOR_STAMP="${SUPERVISOR_STAMP:-$(timestamp_utc)}"
SUPERVISOR_DIR="$ROOT/tmp/nas-supervisors/$SUPERVISOR_STAMP"
SUPERVISOR_LOG="$SUPERVISOR_DIR/supervisor.log"
SUPERVISOR_STATUS="$SUPERVISOR_DIR/status.json"
CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-3600}"
STALE_THRESHOLD_SEC="${STALE_THRESHOLD_SEC:-5400}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-7}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-10}"
CAMPAIGN_MAX_CYCLES="${CAMPAIGN_MAX_CYCLES:-60}"
CAMPAIGN_SLEEP_BETWEEN_JOBS_SEC="${CAMPAIGN_SLEEP_BETWEEN_JOBS_SEC:-30}"
CAMPAIGN_SLEEP_BETWEEN_CYCLES_SEC="${CAMPAIGN_SLEEP_BETWEEN_CYCLES_SEC:-120}"
CAMPAIGN_SLOW_JOB_EVERY_N_CYCLES="${CAMPAIGN_SLOW_JOB_EVERY_N_CYCLES:-3}"
RETENTION_KEEP_LOCAL_RUNS_PER_STAGE="${RETENTION_KEEP_LOCAL_RUNS_PER_STAGE:-1}"
RETENTION_TRIM_LOCAL_AFTER_ARCHIVE="${RETENTION_TRIM_LOCAL_AFTER_ARCHIVE:-1}"
CURRENT_CAMPAIGN_STAMP="${CURRENT_CAMPAIGN_STAMP:-}"
LOCK_DIR="$ROOT/tmp/nas-locks/nas-overnight-supervisor.lock"

mkdir -p "$SUPERVISOR_DIR" "$ROOT/tmp/nas-supervisors" "$ROOT/tmp/nas-locks"
: > "$SUPERVISOR_LOG"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "supervisor_lock_busy=$LOCK_DIR" >&2
  exit 90
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

find_preferred_campaign_stamp() {
  python3 - "$ROOT/tmp/nas-campaigns" "$STALE_THRESHOLD_SEC" <<'PY'
import json
import os
import sys
import time

root = sys.argv[1]
threshold = int(sys.argv[2])
winner = None
for name in sorted(os.listdir(root)) if os.path.isdir(root) else []:
    status_path = os.path.join(root, name, "status.json")
    if not os.path.exists(status_path):
        continue
    try:
        with open(status_path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        continue
    started = doc.get("started_at")
    if not started:
        continue
    mtime = os.path.getmtime(status_path)
    fresh = (time.time() - mtime) <= threshold
    cycles = int(doc.get("cycles_completed") or 0)
    status = str(doc.get("last_status") or "")
    if fresh and status == "running":
        score = 4
    elif fresh and cycles > 0:
        score = 3
    elif fresh and status and not status.startswith("failed_preflight"):
        score = 2
    elif cycles > 0:
        score = 1
    else:
        score = 0
    candidate = (score, started, name)
    if winner is None or candidate > winner:
        winner = candidate
print(winner[2] if winner else "")
PY
}

campaign_status_path() {
  local stamp="$1"
  printf '%s\n' "$ROOT/tmp/nas-campaigns/$stamp/status.json"
}

campaign_log_path() {
  local stamp="$1"
  printf '%s\n' "$ROOT/tmp/nas-campaigns/$stamp/campaign.log"
}

write_supervisor_status() {
  local phase="$1"
  local note="$2"
  python3 - "$SUPERVISOR_STATUS" "$SUPERVISOR_STAMP" "$CURRENT_CAMPAIGN_STAMP" "$phase" "$note" "$END_LOCAL_HOUR" "$END_LOCAL_MINUTE" "$CHECK_INTERVAL_SEC" "$STALE_THRESHOLD_SEC" <<'PY'
import json
import os
import sys
from datetime import datetime, timedelta

status_path, stamp, campaign_stamp, phase, note, hh, mm, interval_sec, stale_sec = sys.argv[1:10]
now = datetime.now().astimezone()
end = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
if end <= now:
    end = end + timedelta(days=1)
doc = {
    "schema_version": "nas.overnight.supervisor.status.v1",
    "supervisor_stamp": stamp,
    "generated_at": now.isoformat(),
    "watched_campaign_stamp": campaign_stamp or None,
    "phase": phase,
    "note": note,
    "target_end_local": end.isoformat(),
    "check_interval_sec": int(interval_sec),
    "stale_threshold_sec": int(stale_sec),
}
os.makedirs(os.path.dirname(status_path), exist_ok=True)
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

campaign_is_running() {
  local status_path="$1"
  python3 - "$status_path" <<'PY'
import json
import os
import sys

path = sys.argv[1]
if not os.path.exists(path):
    print("no")
    raise SystemExit(0)
with open(path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
print("yes" if doc.get("last_status") == "running" else "no")
PY
}

campaign_is_failed() {
  local status_path="$1"
  python3 - "$status_path" <<'PY'
import json
import os
import sys

path = sys.argv[1]
if not os.path.exists(path):
    print("no")
    raise SystemExit(0)
with open(path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
print("yes" if str(doc.get("last_status", "")).startswith("failed") else "no")
PY
}

campaign_is_stale() {
  local status_path="$1"
  local threshold="$2"
  python3 - "$status_path" "$threshold" <<'PY'
import os
import sys
import time

path, threshold = sys.argv[1], int(sys.argv[2])
if not os.path.exists(path):
    print("yes")
    raise SystemExit(0)
mtime = os.path.getmtime(path)
print("yes" if (time.time() - mtime) > threshold else "no")
PY
}

start_new_campaign() {
  local new_stamp
  new_stamp="$(timestamp_utc)"
  local launch_log="$ROOT/tmp/nas-campaign-launch-$new_stamp.log"
  mkdir -p "$ROOT/tmp/nas-campaigns/$new_stamp"
  (
    cd "$ROOT"
    env \
      CAMPAIGN_STAMP="$new_stamp" \
      MAX_CYCLES="$CAMPAIGN_MAX_CYCLES" \
      SLEEP_BETWEEN_JOBS_SEC="$CAMPAIGN_SLEEP_BETWEEN_JOBS_SEC" \
      SLEEP_BETWEEN_CYCLES_SEC="$CAMPAIGN_SLEEP_BETWEEN_CYCLES_SEC" \
      SLOW_JOB_EVERY_N_CYCLES="$CAMPAIGN_SLOW_JOB_EVERY_N_CYCLES" \
      RETENTION_KEEP_LOCAL_RUNS_PER_STAGE="$RETENTION_KEEP_LOCAL_RUNS_PER_STAGE" \
      RETENTION_TRIM_LOCAL_AFTER_ARCHIVE="$RETENTION_TRIM_LOCAL_AFTER_ARCHIVE" \
      bash scripts/nas/run-overnight-shadow-campaign.sh
  ) >> "$launch_log" 2>&1 &
  CURRENT_CAMPAIGN_STAMP="$new_stamp"
  printf 'campaign_restart=%s launch_log=%s\n' "$new_stamp" "$launch_log" >> "$SUPERVISOR_LOG"
}

run_refresh_bundle() {
  (
    cd "$ROOT"
    npm run nas:benchmark:build
  ) >> "$SUPERVISOR_LOG" 2>&1
}

run_remote_publish_bundle() {
  (
    cd "$ROOT"
    npm run nas:benchmark:publish
    KEEP_LOCAL_RUNS_PER_STAGE="$RETENTION_KEEP_LOCAL_RUNS_PER_STAGE" TRIM_LOCAL_AFTER_ARCHIVE="$RETENTION_TRIM_LOCAL_AFTER_ARCHIVE" npm run nas:retention
    npm run nas:publish-docs
  ) >> "$SUPERVISOR_LOG" 2>&1
}

run_validate_snapshot() {
  (
    cd "$ROOT"
    npm run nas:validate
  ) >> "$SUPERVISOR_LOG" 2>&1
}

should_continue() {
  python3 - "$END_LOCAL_HOUR" "$END_LOCAL_MINUTE" <<'PY'
from datetime import datetime, timedelta
import sys

hh, mm = map(int, sys.argv[1:3])
now = datetime.now().astimezone()
end = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
if end <= now:
    end = end + timedelta(days=1)
print("yes" if now < end else "no")
PY
}

if [[ -z "$CURRENT_CAMPAIGN_STAMP" ]]; then
  CURRENT_CAMPAIGN_STAMP="$(find_preferred_campaign_stamp)"
fi

if [[ -z "$CURRENT_CAMPAIGN_STAMP" ]]; then
  if nas_ssh_preflight; then
    write_supervisor_status "starting_campaign" "no campaign detected"
    start_new_campaign
  else
    write_supervisor_status "ssh_unavailable" "waiting_for_nas_ssh_before_first_campaign"
  fi
fi

write_supervisor_status "monitoring" "supervisor_started"

while [[ "$(should_continue)" == "yes" ]]; do
  STATUS_PATH="$(campaign_status_path "$CURRENT_CAMPAIGN_STAMP")"
  LOG_PATH="$(campaign_log_path "$CURRENT_CAMPAIGN_STAMP")"
  printf 'check_at=%s campaign=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CURRENT_CAMPAIGN_STAMP" >> "$SUPERVISOR_LOG"

  if ! nas_ssh_preflight; then
    run_refresh_bundle || true
    write_supervisor_status "ssh_unavailable" "waiting_for_nas_ssh"
    sleep "$CHECK_INTERVAL_SEC"
    continue
  fi

  run_validate_snapshot || true
  run_refresh_bundle || true
  run_remote_publish_bundle || true

  if [[ "$(campaign_is_failed "$STATUS_PATH")" == "yes" ]]; then
    PREFERRED_CAMPAIGN_STAMP="$(find_preferred_campaign_stamp)"
    if [[ -n "$PREFERRED_CAMPAIGN_STAMP" && "$PREFERRED_CAMPAIGN_STAMP" != "$CURRENT_CAMPAIGN_STAMP" ]]; then
      ALT_STATUS_PATH="$(campaign_status_path "$PREFERRED_CAMPAIGN_STAMP")"
      if [[ "$(campaign_is_running "$ALT_STATUS_PATH")" == "yes" && "$(campaign_is_stale "$ALT_STATUS_PATH" "$STALE_THRESHOLD_SEC")" == "no" ]]; then
        CURRENT_CAMPAIGN_STAMP="$PREFERRED_CAMPAIGN_STAMP"
        write_supervisor_status "monitoring" "adopted_running_campaign_after_failure"
        sleep "$CHECK_INTERVAL_SEC"
        continue
      fi
    fi
    write_supervisor_status "campaign_failed" "restarting_failed_campaign"
    if [[ ! -d "$ROOT/tmp/nas-locks/nas-overnight-campaign.lock" ]]; then
      start_new_campaign
      sleep 5
      write_supervisor_status "monitoring" "campaign_restarted_after_failure"
    else
      write_supervisor_status "campaign_failed" "lock_present_skip_restart"
    fi
  elif [[ "$(campaign_is_running "$STATUS_PATH")" == "no" ]]; then
    PREFERRED_CAMPAIGN_STAMP="$(find_preferred_campaign_stamp)"
    if [[ -n "$PREFERRED_CAMPAIGN_STAMP" && "$PREFERRED_CAMPAIGN_STAMP" != "$CURRENT_CAMPAIGN_STAMP" ]]; then
      ALT_STATUS_PATH="$(campaign_status_path "$PREFERRED_CAMPAIGN_STAMP")"
      if [[ "$(campaign_is_running "$ALT_STATUS_PATH")" == "yes" && "$(campaign_is_stale "$ALT_STATUS_PATH" "$STALE_THRESHOLD_SEC")" == "no" ]]; then
        CURRENT_CAMPAIGN_STAMP="$PREFERRED_CAMPAIGN_STAMP"
        write_supervisor_status "monitoring" "adopted_running_campaign_after_idle"
        sleep "$CHECK_INTERVAL_SEC"
        continue
      fi
    fi
    write_supervisor_status "campaign_not_running" "starting_new_campaign"
    if [[ ! -d "$ROOT/tmp/nas-locks/nas-overnight-campaign.lock" ]]; then
      start_new_campaign
      sleep 5
      write_supervisor_status "monitoring" "campaign_restarted"
    else
      write_supervisor_status "campaign_not_running" "lock_present_skip_restart"
    fi
  elif [[ "$(campaign_is_stale "$STATUS_PATH" "$STALE_THRESHOLD_SEC")" == "yes" ]]; then
    PREFERRED_CAMPAIGN_STAMP="$(find_preferred_campaign_stamp)"
    if [[ -n "$PREFERRED_CAMPAIGN_STAMP" && "$PREFERRED_CAMPAIGN_STAMP" != "$CURRENT_CAMPAIGN_STAMP" ]]; then
      ALT_STATUS_PATH="$(campaign_status_path "$PREFERRED_CAMPAIGN_STAMP")"
      if [[ "$(campaign_is_running "$ALT_STATUS_PATH")" == "yes" && "$(campaign_is_stale "$ALT_STATUS_PATH" "$STALE_THRESHOLD_SEC")" == "no" ]]; then
        CURRENT_CAMPAIGN_STAMP="$PREFERRED_CAMPAIGN_STAMP"
        write_supervisor_status "monitoring" "adopted_running_campaign_after_stale"
        sleep "$CHECK_INTERVAL_SEC"
        continue
      fi
    fi
    write_supervisor_status "campaign_stale" "status_file_not_updated_recently"
    if [[ ! -d "$ROOT/tmp/nas-locks/nas-overnight-campaign.lock" ]]; then
      start_new_campaign
      sleep 5
      write_supervisor_status "monitoring" "campaign_restarted_after_stale"
    fi
  else
    tail -n 40 "$LOG_PATH" >> "$SUPERVISOR_LOG" 2>/dev/null || true
    write_supervisor_status "monitoring" "campaign_healthy"
  fi

  sleep "$CHECK_INTERVAL_SEC"
done

run_validate_snapshot || true
run_refresh_bundle || true
write_supervisor_status "completed" "supervisor_finished"
printf '%s\n' "$SUPERVISOR_DIR"
