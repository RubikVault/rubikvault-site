#!/bin/bash

set -u

SCRIPT_PATH="/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/mac/t9_to_wd_streaming_supervisor.sh"
MONITOR_TS="${MONITOR_TS:-$(date +%Y%m%d_%H%M%S)}"
MONITOR_DIR="${HOME}/Library/Logs/t9_to_wd_monitor_${MONITOR_TS}"
MONITOR_LOG="${MONITOR_DIR}/monitor.log"
MONITOR_STATE="${MONITOR_DIR}/monitor_state.env"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-120}"
TOTAL_DURATION_SECONDS="${TOTAL_DURATION_SECONDS:-3600}"

mkdir -p "${MONITOR_DIR}"
: > "${MONITOR_LOG}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${MONITOR_LOG}"
}

find_latest_dir() {
  local pattern="$1"
  python3 - "$pattern" <<'PY'
import glob, os, sys
matches = sorted(glob.glob(sys.argv[1]), key=os.path.getmtime, reverse=True)
print(matches[0] if matches else "")
PY
}

find_latest_worker_dir() {
  python3 - <<'PY'
import glob, os

matches = []
for path in glob.glob(os.path.expanduser("~/Library/Logs/t9_to_wd_*")):
    base = os.path.basename(path)
    if "supervisor_" in base or "monitor_" in base:
        continue
    matches.append(path)
matches.sort(key=os.path.getmtime, reverse=True)
print(matches[0] if matches else "")
PY
}

mount_summary() {
  mount | egrep '/Volumes/T9|/Volumes/My Passport' || true
}

proc_summary() {
  ps ax | egrep 't9_to_wd_(batch_mover|streaming_worker|streaming_supervisor|first_hour_monitor).sh|caffeinate .*t9_to_wd_(batch_mover|streaming_worker|streaming_supervisor|first_hour_monitor).sh' | grep -v grep || true
}

start_ts="$(date +%s)"
end_ts=$(( start_ts + TOTAL_DURATION_SECONDS ))

log "monitor-start interval=${INTERVAL_SECONDS}s duration=${TOTAL_DURATION_SECONDS}s"

while (( "$(date +%s)" < end_ts )); do
  now="$(date +%s)"
  sup_dir="$(find_latest_dir "$HOME/Library/Logs/t9_to_wd_supervisor_*")"
  run_dir="$(find_latest_worker_dir)"
  sup_log=""
  run_log=""
  state_file=""
  if [[ -n "${sup_dir}" ]]; then
    sup_log="${sup_dir}/supervisor.log"
  fi
  if [[ -n "${run_dir}" ]]; then
    run_log="${run_dir}/run.log"
    state_file="${run_dir}/state.env"
  fi

  worker_age="na"
  phase="na"
  batch="na"
  current_file="na"
  processed="na"
  failed="na"
  last_success_age="na"
  if [[ -f "${state_file}" ]]; then
    # shellcheck disable=SC1090
    source "${state_file}" || true
    phase="${CURRENT_PHASE:-na}"
    batch="${CURRENT_BATCH:-na}"
    current_file="${CURRENT_FILE:-na}"
    processed="${PROCESSED_FILES:-na}"
    failed="${FAILED_BATCHES:-na}"
    if [[ "${LAST_SUCCESS_TS:-0}" =~ ^[0-9]+$ ]] && (( LAST_SUCCESS_TS > 0 )); then
      last_success_age=$(( now - LAST_SUCCESS_TS ))
    fi
  fi

  {
    printf 'TIMESTAMP=%q\n' "$(date '+%F %T')"
    printf 'SUP_DIR=%q\n' "${sup_dir}"
    printf 'RUN_DIR=%q\n' "${run_dir}"
    printf 'PHASE=%q\n' "${phase}"
    printf 'BATCH=%q\n' "${batch}"
    printf 'CURRENT_FILE=%q\n' "${current_file}"
    printf 'PROCESSED=%q\n' "${processed}"
    printf 'FAILED=%q\n' "${failed}"
    printf 'LAST_SUCCESS_AGE=%q\n' "${last_success_age}"
  } > "${MONITOR_STATE}"

  log "snapshot phase=${phase} batch=${batch} processed=${processed} failed=${failed} last_success_age=${last_success_age}s"
  log "mounts: $(mount_summary | tr '\n' '; ')"
  log "procs: $(proc_summary | tr '\n' '; ')"

  if [[ -f "${sup_log}" ]]; then
    tail -n 3 "${sup_log}" >> "${MONITOR_LOG}" 2>/dev/null || true
  fi
  if [[ -f "${run_log}" ]]; then
    tail -n 5 "${run_log}" >> "${MONITOR_LOG}" 2>/dev/null || true
  fi

  if [[ "${last_success_age}" != "na" ]] && (( last_success_age >= 420 )); then
    log "WARN stalled-worker-detected age=${last_success_age}s"
  fi

  sleep "${INTERVAL_SECONDS}"
done

log "monitor-exit"
