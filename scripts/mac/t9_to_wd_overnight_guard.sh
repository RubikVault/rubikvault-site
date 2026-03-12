#!/bin/bash

set -u

SCRIPT_DIR="/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/mac"
SUPERVISOR_SCRIPT="${SCRIPT_DIR}/t9_to_wd_streaming_supervisor.sh"
LOG_ROOT="${HOME}/Library/Logs"
GUARD_TS="${GUARD_TS:-$(date +%Y%m%d_%H%M%S)}"
GUARD_DIR="${LOG_ROOT}/t9_to_wd_guard_${GUARD_TS}"
GUARD_LOG="${GUARD_DIR}/guard.log"

INTERVAL_SECONDS="${INTERVAL_SECONDS:-1800}"
STALL_SECONDS="${STALL_SECONDS:-2100}"
SUPERVISOR_RUNTIME_SECONDS="${SUPERVISOR_RUNTIME_SECONDS:-43200}"
END_AT_EPOCH="${END_AT_EPOCH:-$(python3 - <<'PY'
from datetime import datetime, timedelta
now = datetime.now()
target = (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
if target <= now:
    target += timedelta(days=1)
print(int(target.timestamp()))
PY
)}"

SOURCE_DISK_ID="${SOURCE_DISK_ID:-disk8s2}"
TARGET_DISK_ID="${TARGET_DISK_ID:-disk9s1}"
SOURCE_VOL="${SOURCE_VOL:-/Volumes/T9}"
TARGET_VOL="${TARGET_VOL:-/Volumes/My Passport}"

MAX_FILES_PER_BATCH="${MAX_FILES_PER_BATCH:-100}"
MAX_BYTES_PER_BATCH="${MAX_BYTES_PER_BATCH:-5368709120}"
SMALL_FILE_LIMIT_BYTES="${SMALL_FILE_LIMIT_BYTES:-10485760}"
SMALL_DELETE_PER_SCAN="${SMALL_DELETE_PER_SCAN:-0}"
SCAN_CANDIDATE_LIMIT="${SCAN_CANDIDATE_LIMIT:-150}"
FILE_HANG_SECONDS="${FILE_HANG_SECONDS:-180}"
TARGET_ROOT_NAME="${TARGET_ROOT_NAME:-t9_stream_batches_active}"
SCAN_ROOTS="${SCAN_ROOTS:-Samsung2:Samsung3:Videos von Samsung2:Bilder von Samsung2}"

mkdir -p "${GUARD_DIR}"
: > "${GUARD_LOG}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${GUARD_LOG}"
}

mount_if_needed() {
  local mount_path="$1"
  local disk_id="$2"
  if [[ -d "${mount_path}" ]] && mount | grep -Fq "on ${mount_path} "; then
    return 0
  fi
  diskutil mount "${disk_id}" >/dev/null 2>&1 || return 1
  [[ -d "${mount_path}" ]] && mount | grep -Fq "on ${mount_path} "
}

latest_run_dir() {
  ls -1dt "${LOG_ROOT}"/t9_to_wd_* 2>/dev/null | grep -v supervisor | grep -v monitor | grep -v guard | head -n 1
}

latest_supervisor_dir() {
  ls -1dt "${LOG_ROOT}"/t9_to_wd_supervisor_* 2>/dev/null | head -n 1
}

supervisor_running() {
  pgrep -f "${SUPERVISOR_SCRIPT}" >/dev/null 2>&1
}

kill_all_transfer_procs() {
  pkill -f 't9_to_wd_(streaming_worker|streaming_supervisor|first_hour_monitor|overnight_guard)\.sh' >/dev/null 2>&1 || true
}

start_supervisor() {
  local sup_ts
  sup_ts="$(date +%Y%m%d_%H%M%S)"
  nohup env PATH="${PATH}" HOME="${HOME}" USER="${USER}" SHELL="/bin/zsh" \
    T9WD_NO_CAFFEINATE=1 \
    SOURCE_VOL="${SOURCE_VOL}" \
    TARGET_VOL="${TARGET_VOL}" \
    SUPERVISOR_TS="${sup_ts}" \
    TARGET_ROOT_NAME="${TARGET_ROOT_NAME}" \
    RUNTIME_SECONDS="${SUPERVISOR_RUNTIME_SECONDS}" \
    POLL_SECONDS=30 \
    STALL_RESTART_SECONDS=420 \
    MAX_FILES_PER_BATCH="${MAX_FILES_PER_BATCH}" \
    MAX_BYTES_PER_BATCH="${MAX_BYTES_PER_BATCH}" \
    SMALL_FILE_LIMIT_BYTES="${SMALL_FILE_LIMIT_BYTES}" \
    SMALL_DELETE_PER_SCAN="${SMALL_DELETE_PER_SCAN}" \
    SCAN_CANDIDATE_LIMIT="${SCAN_CANDIDATE_LIMIT}" \
    FILE_HANG_SECONDS="${FILE_HANG_SECONDS}" \
    SCAN_ROOTS="${SCAN_ROOTS}" \
    "${SUPERVISOR_SCRIPT}" >> "${GUARD_DIR}/supervisor_${sup_ts}.stdout.log" 2>&1 &
  log "supervisor-start ts=${sup_ts}"
}

latest_done_age() {
  local run_dir="$1"
  python3 - "$run_dir" <<'PY'
import re, sys, time
from pathlib import Path
run_dir = Path(sys.argv[1])
log = run_dir / "run.log"
if not log.exists():
    print(-1)
    raise SystemExit(0)
lines = log.read_text(errors="ignore").splitlines()
for line in reversed(lines):
    if "DONE batch=" in line:
        m = re.match(r"\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]", line)
        if not m:
            continue
        ts = time.mktime(time.strptime(f"{m.group(1)} {m.group(2)}", "%Y-%m-%d %H:%M:%S"))
        print(int(time.time() - ts))
        raise SystemExit(0)
print(-1)
PY
}

current_snapshot() {
  local run_dir="$1"
  python3 - "$run_dir" <<'PY'
import os, sys
from pathlib import Path
run_dir = Path(sys.argv[1])
state = run_dir / "state.env"
vals = {}
if state.exists():
    for line in state.read_text(errors="ignore").splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            vals[k] = v.strip().strip("'")
print(
    f"phase={vals.get('CURRENT_PHASE','na')} "
    f"batch={vals.get('CURRENT_BATCH','na')} "
    f"processed={vals.get('PROCESSED_FILES','0')} "
    f"bytes={vals.get('PROCESSED_BYTES','0')} "
    f"failed={vals.get('FAILED_BATCHES','0')} "
    f"last_success={vals.get('LAST_SUCCESS_TS','0')} "
    f"last_activity={vals.get('LAST_ACTIVITY_TS','0')}"
)
PY
}

log "guard-start interval=${INTERVAL_SECONDS}s stall=${STALL_SECONDS}s end_at_epoch=${END_AT_EPOCH}"

while (( "$(date +%s)" < END_AT_EPOCH )); do
  source_ok=0
  target_ok=0
  mount_if_needed "${SOURCE_VOL}" "${SOURCE_DISK_ID}" && source_ok=1
  mount_if_needed "${TARGET_VOL}" "${TARGET_DISK_ID}" && target_ok=1

  if (( source_ok == 0 || target_ok == 0 )); then
    log "mount-problem source_ok=${source_ok} target_ok=${target_ok}"
  fi

  run_dir="$(latest_run_dir || true)"
  sup_dir="$(latest_supervisor_dir || true)"
  done_age=-1
  snapshot="phase=na batch=na processed=0 bytes=0 failed=0 last_success=0"
  last_success_age=-1

  if [[ -n "${run_dir}" && -d "${run_dir}" ]]; then
    done_age="$(latest_done_age "${run_dir}")"
    snapshot="$(current_snapshot "${run_dir}")"
    last_success_ts="$(printf '%s\n' "${snapshot}" | sed -n 's/.*last_success=\([0-9]*\).*/\1/p')"
    if [[ -n "${last_success_ts}" && "${last_success_ts}" != "0" ]]; then
      last_success_age=$(( $(date +%s) - last_success_ts ))
    fi
  fi

  log "snapshot run=${run_dir:-na} supervisor=${sup_dir:-na} done_age=${done_age} last_success_age=${last_success_age} ${snapshot}"

  restart_needed=0
  if ! supervisor_running; then
    restart_needed=1
    log "reason=no-supervisor"
  elif (( source_ok == 0 || target_ok == 0 )); then
    restart_needed=1
    log "reason=mount-problem"
  elif [[ "${done_age}" != "-1" ]] && (( done_age >= STALL_SECONDS )); then
    restart_needed=1
    log "reason=stale-done-age age=${done_age}"
  elif [[ "${done_age}" == "-1" ]] && (( last_success_age >= STALL_SECONDS )); then
    restart_needed=1
    log "reason=stale-startup age=${last_success_age}"
  fi

  if (( restart_needed == 1 )); then
    kill_all_transfer_procs
    sleep 2
    mount_if_needed "${SOURCE_VOL}" "${SOURCE_DISK_ID}" || true
    mount_if_needed "${TARGET_VOL}" "${TARGET_DISK_ID}" || true
    start_supervisor
  fi

  sleep "${INTERVAL_SECONDS}"
done

log "guard-exit"
