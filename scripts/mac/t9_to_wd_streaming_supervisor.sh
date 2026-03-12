#!/bin/bash

set -u

SCRIPT_PATH="/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/mac/t9_to_wd_streaming_worker.sh"
SUPERVISOR_TS="${SUPERVISOR_TS:-$(date +%Y%m%d_%H%M%S)}"
SUPERVISOR_DIR="${HOME}/Library/Logs/t9_to_wd_supervisor_${SUPERVISOR_TS}"
SUPERVISOR_LOG="${SUPERVISOR_DIR}/supervisor.log"
SUPERVISOR_STATE="${SUPERVISOR_DIR}/supervisor_state.env"
RUNTIME_SECONDS="${RUNTIME_SECONDS:-14400}"
POLL_SECONDS="${POLL_SECONDS:-30}"
STALL_RESTART_SECONDS="${STALL_RESTART_SECONDS:-420}"
TARGET_ROOT_NAME="${TARGET_ROOT_NAME:-t9_stream_batches_active}"
SCAN_ROOTS="${SCAN_ROOTS:-}"

mkdir -p "${SUPERVISOR_DIR}"
: > "${SUPERVISOR_LOG}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${SUPERVISOR_LOG}"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "ERROR missing command: $1"
    exit 1
  }
}

for cmd in bash python3 diskutil caffeinate; do
  require_cmd "${cmd}"
done

if [[ "${T9WD_NO_CAFFEINATE:-0}" != "1" && -z "${T9WD_CAFFEINATED:-}" ]]; then
  export T9WD_CAFFEINATED=1
  exec caffeinate -dimsu "${BASH_SOURCE[0]}" "$@"
fi

mount_volume_if_needed() {
  local label_regex="$1"
  python3 - "$label_regex" <<'PY'
import os, re, subprocess, sys
from pathlib import Path

pattern = re.compile(sys.argv[1], re.I)

def mounted_matches():
    matches = []
    for child in sorted(Path("/Volumes").iterdir()):
        if os.path.ismount(child) and pattern.search(child.name):
            matches.append(str(child))
    return matches

mounted = mounted_matches()
if mounted:
    print(mounted[0])
    raise SystemExit(0)

out = subprocess.check_output(["diskutil", "list", "external", "physical"], text=True, stderr=subprocess.STDOUT)
disk = None
for line in out.splitlines():
    if pattern.search(line):
        parts = line.split()
        ident = parts[-1] if parts else ""
        if re.fullmatch(r"disk\d+s\d+", ident) or re.fullmatch(r"disk\d+", ident):
            disk = ident
            break
if not disk:
    raise SystemExit(1)
subprocess.check_call(["diskutil", "mount", disk], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
mounted = mounted_matches()
if not mounted:
    raise SystemExit(2)
print(mounted[0])
PY
}

worker_pid=""
worker_run_dir=""
worker_log=""
worker_state=""
worker_stdout=""
restart_count=0
start_ts="$(date +%s)"
end_ts=$(( start_ts + RUNTIME_SECONDS ))

write_state() {
  {
    printf 'WORKER_PID=%q\n' "${worker_pid}"
    printf 'WORKER_RUN_DIR=%q\n' "${worker_run_dir}"
    printf 'WORKER_LOG=%q\n' "${worker_log}"
    printf 'WORKER_STATE=%q\n' "${worker_state}"
    printf 'WORKER_STDOUT=%q\n' "${worker_stdout}"
    printf 'RESTART_COUNT=%q\n' "${restart_count}"
    printf 'END_TS=%q\n' "${end_ts}"
  } > "${SUPERVISOR_STATE}"
}

log "Supervisor start runtime=${RUNTIME_SECONDS}s poll=${POLL_SECONDS}s restart_after=${STALL_RESTART_SECONDS}s"

while (( "$(date +%s)" < end_ts )); do
  SOURCE_VOL="${SOURCE_VOL:-$(mount_volume_if_needed '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)' || true)}"
  TARGET_VOL="${TARGET_VOL:-$(mount_volume_if_needed '(my passport|western digital|wd)' || true)}"
  [[ -d "${SOURCE_VOL}" ]] || {
    log "WARN source mount unavailable"
    sleep "${POLL_SECONDS}"
    continue
  }
  [[ -d "${TARGET_VOL}" ]] || {
    log "WARN target mount unavailable"
    sleep "${POLL_SECONDS}"
    continue
  }

  worker_ts="$(date +%Y%m%d_%H%M%S)"
  worker_run_dir="${HOME}/Library/Logs/t9_to_wd_${worker_ts}"
  worker_log="${worker_run_dir}/run.log"
  worker_state="${worker_run_dir}/state.env"
  worker_stdout="${SUPERVISOR_DIR}/worker_${worker_ts}.stdout.log"
  restart_count=$(( restart_count + 1 ))
  write_state

  T9WD_NO_CAFFEINATE=1 \
  RUN_TS="${worker_ts}" \
  TARGET_ROOT_NAME="${TARGET_ROOT_NAME}" \
  SCAN_ROOTS="${SCAN_ROOTS}" \
  SOURCE_VOL="${SOURCE_VOL}" \
  TARGET_VOL="${TARGET_VOL}" \
  "${SCRIPT_PATH}" >> "${worker_stdout}" 2>&1 &
  worker_pid=$!
  write_state
  log "Worker start pid=${worker_pid} run_dir=${worker_run_dir} source=${SOURCE_VOL} target=${TARGET_VOL}"

  while kill -0 "${worker_pid}" 2>/dev/null; do
    sleep "${POLL_SECONDS}"
    SOURCE_VOL="${SOURCE_VOL:-$(mount_volume_if_needed '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)' || true)}"
    TARGET_VOL="${TARGET_VOL:-$(mount_volume_if_needed '(my passport|western digital|wd)' || true)}"
    if [[ -f "${worker_state}" ]]; then
      # shellcheck disable=SC1090
      source "${worker_state}" || true
      now="$(date +%s)"
      age=$(( now - ${LAST_SUCCESS_TS:-0} ))
      log "Monitor pid=${worker_pid} phase=${CURRENT_PHASE:-na} batch=${CURRENT_BATCH:-na} file=${CURRENT_FILE:-na} processed=${PROCESSED_FILES:-0} small_deleted=${DELETED_SMALL_FILES:-0} failed=${FAILED_BATCHES:-0} age=${age}s"
      if (( LAST_SUCCESS_TS > 0 )) && (( age >= STALL_RESTART_SECONDS )); then
        log "Restarting stalled worker pid=${worker_pid} age=${age}s"
        kill -TERM "${worker_pid}" 2>/dev/null || true
        sleep 5
        kill -KILL "${worker_pid}" 2>/dev/null || true
        break
      fi
    else
      log "Worker state not ready yet"
    fi

    if [[ -f "${worker_log}" ]] && grep -q 'T9_EMPTY=yes' "${worker_log}"; then
      log "Worker reported T9_EMPTY=yes"
      wait "${worker_pid}" 2>/dev/null || true
      exit 0
    fi

    if (( "$(date +%s)" >= end_ts )); then
      log "Supervisor runtime reached, stopping worker"
      kill -TERM "${worker_pid}" 2>/dev/null || true
      sleep 5
      kill -KILL "${worker_pid}" 2>/dev/null || true
      break
    fi
  done

  wait "${worker_pid}" 2>/dev/null || true
  if [[ -f "${worker_log}" ]] && grep -q 'T9_EMPTY=yes' "${worker_log}"; then
    log "Worker completed with T9_EMPTY=yes"
    exit 0
  fi
  if (( "$(date +%s)" >= end_ts )); then
    break
  fi
  log "Worker ended without completion; restarting"
done

log "Supervisor exit"
