#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FETCH_SCRIPT="$ROOT/scripts/nas/fetch-nas-live-status.sh"
SNAPSHOT_PATH="$ROOT/public/data/ui/nas-pipeline-dashboard.json"
LOCK_ROOT="$ROOT/tmp/nas-locks"
LOCK_DIR="$LOCK_ROOT/dashboard-sync.lock"

RUNNING_SYNC_INTERVAL_SEC="${RUNNING_SYNC_INTERVAL_SEC:-60}"
RUNNING_FULL_INTERVAL_SEC="${RUNNING_FULL_INTERVAL_SEC:-600}"
FAILED_SYNC_INTERVAL_SEC="${FAILED_SYNC_INTERVAL_SEC:-120}"
FAILED_FULL_INTERVAL_SEC="${FAILED_FULL_INTERVAL_SEC:-300}"
COMPLETED_SYNC_INTERVAL_SEC="${COMPLETED_SYNC_INTERVAL_SEC:-300}"
COMPLETED_FULL_INTERVAL_SEC="${COMPLETED_FULL_INTERVAL_SEC:-1800}"
OFFLINE_SYNC_INTERVAL_SEC="${OFFLINE_SYNC_INTERVAL_SEC:-300}"
OFFLINE_FULL_INTERVAL_SEC="${OFFLINE_FULL_INTERVAL_SEC:-900}"

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

mkdir -p "$LOCK_ROOT"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "dashboard sync already running, skip"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT

read_snapshot_state() {
  python3 - "$SNAPSHOT_PATH" <<'PY'
from __future__ import annotations
import json, sys
from datetime import datetime, timezone
from pathlib import Path

path = Path(sys.argv[1])
if not path.exists():
    print("\x1f".join(["-1", "-1", "missing", "missing", "", "", "", "0"]))
    raise SystemExit(0)

def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None

try:
    doc = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print("\x1f".join(["-1", "-1", "missing", "missing", "", "", "", "0"]))
    raise SystemExit(0)

now = datetime.now(timezone.utc)
local_sync = doc.get("local_sync") or {}
current = doc.get("current_run") or {}
synced_at = parse_iso(local_sync.get("synced_at"))
last_full_sync_at = parse_iso(local_sync.get("last_full_sync_at"))
sync_age = int((now - synced_at).total_seconds()) if synced_at else -1
full_age = int((now - last_full_sync_at).total_seconds()) if last_full_sync_at else -1
runtime_state = str(current.get("runtime_state") or current.get("status") or "missing")
status = str(current.get("status") or runtime_state or "missing")
campaign = str(current.get("campaign_stamp") or "")
step = str(current.get("current_step") or "")
failed_step = str(current.get("failed_step") or "")
has_history = 1 if ((doc.get("historical") or {}).get("steps")) else 0
print("\x1f".join([str(sync_age), str(full_age), runtime_state, status, campaign, step, failed_step, str(has_history)]))
PY
}

select_intervals() {
  local runtime_state="$1"
  case "$runtime_state" in
    running)
      echo "$RUNNING_SYNC_INTERVAL_SEC $RUNNING_FULL_INTERVAL_SEC"
      ;;
    failed|stalled)
      echo "$FAILED_SYNC_INTERVAL_SEC $FAILED_FULL_INTERVAL_SEC"
      ;;
    completed)
      echo "$COMPLETED_SYNC_INTERVAL_SEC $COMPLETED_FULL_INTERVAL_SEC"
      ;;
    *)
      echo "$OFFLINE_SYNC_INTERVAL_SEC $OFFLINE_FULL_INTERVAL_SEC"
      ;;
  esac
}

IFS=$'\x1f' read -r sync_age full_age runtime_state status campaign step failed_step has_history <<<"$(read_snapshot_state)"
read -r sync_interval full_interval <<<"$(select_intervals "$runtime_state")"

if [[ "${FORCE_SYNC:-0}" != "1" && "$sync_age" -ge 0 && "$sync_age" -lt "$sync_interval" ]]; then
  log "skip sync: runtime_state=$runtime_state sync_age=${sync_age}s threshold=${sync_interval}s"
  exit 0
fi

mode="fast"
if [[ ! -f "$SNAPSHOT_PATH" || "$has_history" != "1" || "$full_age" -lt 0 || "$full_age" -ge "$full_interval" ]]; then
  mode="full"
fi

before_sig="${status}|${campaign}|${step}|${failed_step}"
log "dashboard sync start: mode=$mode runtime_state=$runtime_state sync_age=${sync_age}s full_age=${full_age}s"
bash "$FETCH_SCRIPT" --mode "$mode"

IFS=$'\x1f' read -r _new_sync_age _new_full_age new_runtime_state new_status new_campaign new_step new_failed_step _new_has_history <<<"$(read_snapshot_state)"
after_sig="${new_status}|${new_campaign}|${new_step}|${new_failed_step}"

if [[ "$mode" == "fast" && "$after_sig" != "$before_sig" ]]; then
  log "state changed after fast sync ($before_sig -> $after_sig), rerunning full sync"
  bash "$FETCH_SCRIPT" --mode full
fi
