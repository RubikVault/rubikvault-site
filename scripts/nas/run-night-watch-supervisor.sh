#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

SUPERVISOR_STAMP="${SUPERVISOR_STAMP:-$(timestamp_utc)}"
SUPERVISOR_DIR="$ROOT/tmp/nas-night-watch/$SUPERVISOR_STAMP"
STATUS_JSON="$SUPERVISOR_DIR/status.json"
SUPERVISOR_LOG="$SUPERVISOR_DIR/supervisor.log"
LATEST_JSON="$ROOT/tmp/nas-night-watch/latest.json"
LOCK_DIR="$ROOT/tmp/nas-locks/nas-night-watch.lock"

CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-1800}"
STALE_THRESHOLD_SEC="${STALE_THRESHOLD_SEC:-2700}"
END_LOCAL_DATE="${END_LOCAL_DATE:-}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-8}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
AUTO_DEPLOY="${AUTO_DEPLOY:-1}"
RUN_REMOTE_WATCHDOG="${RUN_REMOTE_WATCHDOG:-1}"
RUN_SYSTEM_AUDIT_EACH_CYCLE="${RUN_SYSTEM_AUDIT_EACH_CYCLE:-1}"
PUBLISH_BENCHMARKS_EACH_CYCLE="${PUBLISH_BENCHMARKS_EACH_CYCLE:-1}"
PUBLISH_DOCS_EACH_CYCLE="${PUBLISH_DOCS_EACH_CYCLE:-1}"
REMOTE_REPO="/volume1/homes/neoboy/Dev/rubikvault-site"
REMOTE_NATIVE_RUNTIME="$NAS_ROOT/runtime/native-matrix"
REMOTE_NATIVE_REPORTS="$NAS_ROOT/runtime/reports/native-matrix"
REMOTE_OPEN_PROBES_ROOT="$NAS_ROOT/runtime/open-probes"
REMOTE_OPEN_PROBE_REPORTS="$NAS_ROOT/runtime/reports/open-probes"
REMOTE_STATUS_JSON="$NAS_ROOT/runtime/STATUS.json"
REMOTE_SYSTEM_AUDIT="$NAS_ROOT/runtime/reports/system-partition"
LOCAL_NATIVE_ROOT="$ROOT/tmp/nas-native-matrix"
LOCAL_NATIVE_LIVE="$LOCAL_NATIVE_ROOT/live"
LOCAL_NATIVE_SUPERVISORS="$LOCAL_NATIVE_ROOT/supervisors"
LOCAL_NATIVE_CAMPAIGNS="$LOCAL_NATIVE_ROOT/campaigns"
LOCAL_OPEN_PROBES_ROOT="$ROOT/tmp/nas-open-probes"
LOCAL_OPEN_PROBES_LIVE="$LOCAL_OPEN_PROBES_ROOT/live"
LOCAL_OPEN_PROBE_CAMPAIGNS="$LOCAL_OPEN_PROBES_ROOT/campaigns"
LOCAL_OPEN_PROBE_RUNS="$LOCAL_OPEN_PROBES_ROOT/runs"
LOCAL_SYSTEM_AUDIT="$ROOT/tmp/nas-system-audit"

mkdir -p "$SUPERVISOR_DIR" "$ROOT/tmp/nas-night-watch" "$ROOT/tmp/nas-locks" "$LOCAL_NATIVE_LIVE" "$LOCAL_NATIVE_SUPERVISORS" "$LOCAL_NATIVE_CAMPAIGNS" "$LOCAL_OPEN_PROBES_LIVE" "$LOCAL_OPEN_PROBE_CAMPAIGNS" "$LOCAL_OPEN_PROBE_RUNS" "$LOCAL_SYSTEM_AUDIT"
: > "$SUPERVISOR_LOG"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "night_watch_lock_busy=$LOCK_DIR" >&2
  exit 90
fi
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
  local connected="${3:-false}"
  local remote_supervisor="${4:-}"
  local open_probe_campaign="${5:-}"
  python3 - "$STATUS_JSON" "$LATEST_JSON" "$SUPERVISOR_STAMP" "$TARGET_END_LOCAL" "$phase" "$note" "$connected" "$remote_supervisor" "$CHECK_INTERVAL_SEC" "$open_probe_campaign" <<'PY'
import json
import os
import sys
from datetime import datetime

status_path, latest_path, stamp, target_end, phase, note, connected, remote_supervisor, interval, open_probe_campaign = sys.argv[1:11]
doc = {
    "schema_version": "nas.night.watch.status.v1",
    "generated_at": datetime.now().astimezone().isoformat(),
    "supervisor_stamp": stamp,
    "target_end_local": target_end,
    "phase": phase,
    "note": note,
    "remote_connected": connected == "true",
    "remote_supervisor_stamp": remote_supervisor or None,
    "remote_open_probe_campaign": open_probe_campaign or None,
    "check_interval_sec": int(interval),
}
os.makedirs(os.path.dirname(status_path), exist_ok=True)
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
os.makedirs(os.path.dirname(latest_path), exist_ok=True)
with open(latest_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
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

sync_remote_artifacts() {
  mkdir -p "$LOCAL_NATIVE_LIVE" "$LOCAL_NATIVE_SUPERVISORS" "$LOCAL_NATIVE_CAMPAIGNS" "$LOCAL_OPEN_PROBES_LIVE" "$LOCAL_OPEN_PROBE_CAMPAIGNS" "$LOCAL_OPEN_PROBE_RUNS" "$LOCAL_SYSTEM_AUDIT"
  rsync_from_remote "$REMOTE_NATIVE_REPORTS/" "$LOCAL_NATIVE_LIVE/" >/dev/null
  rsync_from_remote "$REMOTE_STATUS_JSON" "$LOCAL_NATIVE_LIVE/" >/dev/null
  rsync_from_remote "$REMOTE_NATIVE_RUNTIME/supervisors/" "$LOCAL_NATIVE_SUPERVISORS/" >/dev/null
  rsync_from_remote "$REMOTE_NATIVE_RUNTIME/campaigns/" "$LOCAL_NATIVE_CAMPAIGNS/" >/dev/null
  rsync_from_remote "$REMOTE_OPEN_PROBE_REPORTS/" "$LOCAL_OPEN_PROBES_LIVE/" >/dev/null || true
  rsync_from_remote "$REMOTE_OPEN_PROBES_ROOT/campaigns/" "$LOCAL_OPEN_PROBE_CAMPAIGNS/" >/dev/null || true
  rsync_from_remote "$REMOTE_OPEN_PROBES_ROOT/runs/" "$LOCAL_OPEN_PROBE_RUNS/" >/dev/null || true
  rsync_from_remote "$REMOTE_SYSTEM_AUDIT/" "$LOCAL_SYSTEM_AUDIT/" >/dev/null
}

run_local_rollups() {
  (
    cd "$ROOT"
    if [[ "$RUN_SYSTEM_AUDIT_EACH_CYCLE" == "1" ]]; then
      bash scripts/nas/audit-system-partition.sh >/dev/null 2>&1 || true
    fi
    node scripts/nas/build-open-probe-report.mjs >/dev/null 2>&1 || true
    node scripts/nas/build-reality-check-report.mjs >/dev/null 2>&1 || true
    node scripts/nas/build-solution-matrix-report.mjs >/dev/null 2>&1 || true
    node scripts/nas/build-transfer-status-report.mjs >/dev/null 2>&1 || true
    node scripts/nas/build-solution-attempt-log.mjs >/dev/null 2>&1 || true
    node scripts/nas/build-evidence-hub.mjs >/dev/null 2>&1 || true
    node scripts/nas/build-night-watch-report.mjs >/dev/null 2>&1 || true
    if [[ "$PUBLISH_BENCHMARKS_EACH_CYCLE" == "1" ]]; then
      bash scripts/nas/publish-benchmark-reports.sh >/dev/null 2>&1 || true
    fi
    if [[ "$PUBLISH_DOCS_EACH_CYCLE" == "1" ]]; then
      bash scripts/nas/publish-docs-to-nas.sh >/dev/null 2>&1 || true
    fi
  )
}

deployed="no"
write_status "monitoring" "night_watch_started" "false" "" ""

while [[ "$(should_continue)" == "yes" ]]; do
  if ! nas_ssh_preflight; then
    write_status "monitoring" "nas_unreachable_retrying" "false" "" ""
    sleep "$CHECK_INTERVAL_SEC"
    continue
  fi

  if [[ "$AUTO_DEPLOY" == "1" && "$deployed" != "yes" ]]; then
    (
      cd "$ROOT"
      bash scripts/nas/deploy-native-matrix-to-nas.sh
    ) >> "$SUPERVISOR_LOG" 2>&1 || true
    deployed="yes"
  fi

  remote_supervisor="$(
    cd "$ROOT" && \
    CHECK_INTERVAL_SEC="$CHECK_INTERVAL_SEC" \
    STALE_THRESHOLD_SEC="$STALE_THRESHOLD_SEC" \
    RUN_WATCHDOG_EACH_CYCLE=1 \
    END_LOCAL_DATE="$END_LOCAL_DATE" \
    END_LOCAL_HOUR="$END_LOCAL_HOUR" \
    END_LOCAL_MINUTE="$END_LOCAL_MINUTE" \
    bash scripts/nas/start-native-matrix-supervisor.sh 2>>"$SUPERVISOR_LOG" || true
  )"
  open_probe_campaign="$(
    cd "$ROOT" && \
    AUTO_DEPLOY=0 \
    END_LOCAL_DATE="$END_LOCAL_DATE" \
    END_LOCAL_HOUR="$END_LOCAL_HOUR" \
    END_LOCAL_MINUTE="$END_LOCAL_MINUTE" \
    bash scripts/nas/start-open-probe-campaign.sh 2>>"$SUPERVISOR_LOG" || true
  )"

  if [[ "$RUN_REMOTE_WATCHDOG" == "1" ]]; then
    remote_shell "cd '$REMOTE_REPO' && bash scripts/nas/rv-nas-watchdog.sh" >> "$SUPERVISOR_LOG" 2>&1 || true
  fi

  sync_remote_artifacts >> "$SUPERVISOR_LOG" 2>&1 || true
  run_local_rollups >> "$SUPERVISOR_LOG" 2>&1 || true
  write_status "monitoring" "cycle_complete" "true" "$remote_supervisor" "$open_probe_campaign"
  sleep "$CHECK_INTERVAL_SEC"
done

if nas_ssh_preflight; then
  if [[ "$RUN_REMOTE_WATCHDOG" == "1" ]]; then
    remote_shell "cd '$REMOTE_REPO' && bash scripts/nas/rv-nas-watchdog.sh" >> "$SUPERVISOR_LOG" 2>&1 || true
  fi
  sync_remote_artifacts >> "$SUPERVISOR_LOG" 2>&1 || true
  run_local_rollups >> "$SUPERVISOR_LOG" 2>&1 || true
fi

write_status "completed" "target_window_reached" "true" "" ""
