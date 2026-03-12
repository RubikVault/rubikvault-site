#!/bin/bash

set -u

WORKER_SCRIPT="/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/mac/t9_to_wd_streaming_worker.sh"
LOG_ROOT="${HOME}/Library/Logs"
DAEMON_TS="${DAEMON_TS:-$(date +%Y%m%d_%H%M%S)}"
DAEMON_DIR="${LOG_ROOT}/t9_to_wd_night_${DAEMON_TS}"
DAEMON_LOG="${DAEMON_DIR}/daemon.log"
STATE_FILE="${DAEMON_DIR}/daemon_state.env"

SOURCE_DISK_ID="${SOURCE_DISK_ID:-disk8s2}"
TARGET_DISK_ID="${TARGET_DISK_ID:-disk9s1}"
SOURCE_VOL="${SOURCE_VOL:-/Volumes/T9}"
TARGET_VOL="${TARGET_VOL:-/Volumes/My Passport}"
TARGET_ROOT_NAME="${TARGET_ROOT_NAME:-t9_stream_batches_active}"

MAX_FILES_PER_BATCH="${MAX_FILES_PER_BATCH:-60}"
MAX_BYTES_PER_BATCH="${MAX_BYTES_PER_BATCH:-5368709120}"
SMALL_FILE_LIMIT_BYTES="${SMALL_FILE_LIMIT_BYTES:-10485760}"
SMALL_DELETE_PER_SCAN="${SMALL_DELETE_PER_SCAN:-0}"
SCAN_CANDIDATE_LIMIT="${SCAN_CANDIDATE_LIMIT:-120}"
FILE_HANG_SECONDS="${FILE_HANG_SECONDS:-180}"

ROOT_GROUPS="${ROOT_GROUPS:-Videos von Samsung2;Samsung2;Samsung3;Bilder von Samsung2;1;3;4;5;6;7;8;9;10}"
POLL_SECONDS="${POLL_SECONDS:-60}"
END_AT_EPOCH="${END_AT_EPOCH:-$(python3 - <<'PY'
from datetime import datetime, timedelta
now = datetime.now()
target = now.replace(hour=8, minute=0, second=0, microsecond=0)
if target <= now:
    target += timedelta(days=1)
print(int(target.timestamp()))
PY
)}"

mkdir -p "${DAEMON_DIR}"
: > "${DAEMON_LOG}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${DAEMON_LOG}"
}

write_state() {
  {
    printf 'GROUP_INDEX=%q\n' "${GROUP_INDEX:-0}"
    printf 'GROUP_NAME=%q\n' "${GROUP_NAME:-}"
    printf 'WORKER_PID=%q\n' "${WORKER_PID:-}"
    printf 'WORKER_RUN_DIR=%q\n' "${WORKER_RUN_DIR:-}"
    printf 'RETRY_COUNT=%q\n' "${RETRY_COUNT:-0}"
    printf 'LAST_ACTION=%q\n' "${LAST_ACTION:-}"
  } > "${STATE_FILE}"
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

kill_worker() {
  if [[ -n "${WORKER_PID:-}" ]]; then
    kill -TERM "${WORKER_PID}" 2>/dev/null || true
    sleep 2
    kill -KILL "${WORKER_PID}" 2>/dev/null || true
  fi
}

group_count() {
  python3 - "$ROOT_GROUPS" <<'PY'
import sys
items = [x.strip() for x in sys.argv[1].split(";") if x.strip()]
print(len(items))
PY
}

group_name_at() {
  python3 - "$ROOT_GROUPS" "$1" <<'PY'
import sys
items = [x.strip() for x in sys.argv[1].split(";") if x.strip()]
idx = int(sys.argv[2])
print(items[idx] if 0 <= idx < len(items) else "")
PY
}

current_report_interval() {
  python3 - <<'PY'
from datetime import datetime
now = datetime.now()
hm = now.hour * 60 + now.minute
if hm < 2 * 60:
    print(900)
elif hm < 6 * 60:
    print(1800)
elif hm < 8 * 60:
    print(3600)
else:
    print(1800)
PY
}

latest_worker_snapshot() {
  local run_dir="$1"
  python3 - "$run_dir" <<'PY'
import sys
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
    f"current_file={vals.get('CURRENT_FILE','')} "
    f"processed_files={vals.get('PROCESSED_FILES','0')} "
    f"processed_bytes={vals.get('PROCESSED_BYTES','0')} "
    f"last_success={vals.get('LAST_SUCCESS_TS','0')}"
)
PY
}

start_worker() {
  local roots="$1"
  local run_ts
  run_ts="$(date +%Y%m%d_%H%M%S)"
  WORKER_RUN_DIR="${LOG_ROOT}/t9_to_wd_${run_ts}"
  local stdout_log="${DAEMON_DIR}/worker_${run_ts}.stdout.log"

  nohup env PATH="${PATH}" HOME="${HOME}" USER="${USER}" SHELL="/bin/zsh" \
    T9WD_NO_CAFFEINATE=1 \
    RUN_TS="${run_ts}" \
    SOURCE_VOL="${SOURCE_VOL}" \
    TARGET_VOL="${TARGET_VOL}" \
    TARGET_ROOT_NAME="${TARGET_ROOT_NAME}" \
    SCAN_ROOTS="${roots}" \
    MAX_FILES_PER_BATCH="${MAX_FILES_PER_BATCH}" \
    MAX_BYTES_PER_BATCH="${MAX_BYTES_PER_BATCH}" \
    SMALL_FILE_LIMIT_BYTES="${SMALL_FILE_LIMIT_BYTES}" \
    SMALL_DELETE_PER_SCAN="${SMALL_DELETE_PER_SCAN}" \
    SCAN_CANDIDATE_LIMIT="${SCAN_CANDIDATE_LIMIT}" \
    FILE_HANG_SECONDS="${FILE_HANG_SECONDS}" \
    "${WORKER_SCRIPT}" >> "${stdout_log}" 2>&1 &

  WORKER_PID=$!
  LAST_ACTION="start_worker"
  write_state
  log "worker-start pid=${WORKER_PID} roots=${roots} run_dir=${WORKER_RUN_DIR}"
}

GROUP_TOTAL="$(group_count)"
GROUP_INDEX=0
RETRY_COUNT=0
WORKER_PID=""
WORKER_RUN_DIR=""
LAST_ACTION="init"
NEXT_REPORT_TS="$(date +%s)"
write_state

log "night-daemon-start end_at_epoch=${END_AT_EPOCH} group_total=${GROUP_TOTAL}"

while (( "$(date +%s)" < END_AT_EPOCH )); do
  mount_if_needed "${SOURCE_VOL}" "${SOURCE_DISK_ID}" || log "WARN source-mount-unavailable"
  mount_if_needed "${TARGET_VOL}" "${TARGET_DISK_ID}" || log "WARN target-mount-unavailable"

  if (( GROUP_INDEX >= GROUP_TOTAL )); then
    log "all-root-groups-processed"
    break
  fi

  GROUP_NAME="$(group_name_at "${GROUP_INDEX}")"
  write_state

  if [[ -z "${WORKER_PID}" ]] || ! kill -0 "${WORKER_PID}" 2>/dev/null; then
    start_worker "${GROUP_NAME}"
  fi

  if [[ -z "${WORKER_RUN_DIR}" || ! -d "${WORKER_RUN_DIR}" ]]; then
    now_ts="$(date +%s)"
    if (( now_ts >= NEXT_REPORT_TS )); then
      log "snapshot roots=${GROUP_NAME} run_dir_missing"
      NEXT_REPORT_TS=$(( now_ts + $(current_report_interval) ))
    fi
    RETRY_COUNT=$(( RETRY_COUNT + 1 ))
    if (( RETRY_COUNT >= 2 )); then
      GROUP_INDEX=$(( GROUP_INDEX + 1 ))
      RETRY_COUNT=0
    fi
    write_state
    sleep "${POLL_SECONDS}"
    continue
  fi

  snapshot="$(latest_worker_snapshot "${WORKER_RUN_DIR}")"
  phase="$(printf '%s\n' "${snapshot}" | sed -n 's/.*phase=\([^ ]*\).*/\1/p')"
  current_file="$(printf '%s\n' "${snapshot}" | sed -n 's/.*current_file=\([^ ]*\).*/\1/p')"
  processed_files="$(printf '%s\n' "${snapshot}" | sed -n 's/.*processed_files=\([0-9]*\).*/\1/p')"
  last_success_ts="$(printf '%s\n' "${snapshot}" | sed -n 's/.*last_success=\([0-9]*\).*/\1/p')"
  now_ts="$(date +%s)"
  last_success_age=$(( now_ts - ${last_success_ts:-0} ))

  if (( now_ts >= NEXT_REPORT_TS )); then
    log "snapshot roots=${GROUP_NAME} ${snapshot} last_success_age=${last_success_age}s"
    NEXT_REPORT_TS=$(( now_ts + $(current_report_interval) ))
  fi

  if [[ "${phase}" == "final_verification" ]]; then
    kill_worker
    GROUP_INDEX=$(( GROUP_INDEX + 1 ))
    RETRY_COUNT=0
    WORKER_PID=""
    WORKER_RUN_DIR=""
    LAST_ACTION="advance_group"
    write_state
    log "advance-group reason=final_verification next_index=${GROUP_INDEX}"
    NEXT_REPORT_TS="${now_ts}"
    continue
  fi

  if [[ -z "${current_file}" && "${processed_files:-0}" == "0" && "${last_success_age}" -ge 600 ]]; then
    kill_worker
    RETRY_COUNT=$(( RETRY_COUNT + 1 ))
    if (( RETRY_COUNT >= 2 )); then
      GROUP_INDEX=$(( GROUP_INDEX + 1 ))
      RETRY_COUNT=0
      log "advance-group reason=startup-stall next_index=${GROUP_INDEX}"
    else
      log "retry-group reason=startup-stall retry=${RETRY_COUNT}"
    fi
    WORKER_PID=""
    WORKER_RUN_DIR=""
    LAST_ACTION="restart_after_startup_stall"
    write_state
    NEXT_REPORT_TS="${now_ts}"
    continue
  fi

  if [[ "${last_success_age}" -ge 1800 ]]; then
    kill_worker
    RETRY_COUNT=$(( RETRY_COUNT + 1 ))
    if (( RETRY_COUNT >= 2 )); then
      GROUP_INDEX=$(( GROUP_INDEX + 1 ))
      RETRY_COUNT=0
      log "advance-group reason=long-stall next_index=${GROUP_INDEX}"
    else
      log "retry-group reason=long-stall retry=${RETRY_COUNT}"
    fi
    WORKER_PID=""
    WORKER_RUN_DIR=""
    LAST_ACTION="restart_after_long_stall"
    write_state
    NEXT_REPORT_TS="${now_ts}"
    continue
  fi

  RETRY_COUNT=0
  LAST_ACTION="healthy_check"
  write_state
  sleep "${POLL_SECONDS}"
done

kill_worker
log "night-daemon-exit"
