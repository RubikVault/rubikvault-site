#!/bin/bash

set -u

SRC_DIR="${1:-}"
DEST_ROOT="${2:-/Volumes/My Passport/t9_flat_batches_active}"
MIN_BYTES="${MIN_BYTES:-1048576}"                 # 1 MiB
MAX_BATCH_BYTES="${MAX_BATCH_BYTES:-2147483648}" # 2 GiB
MAX_FILES="${MAX_FILES:-1000}"

[[ -n "${SRC_DIR}" ]] || { echo "usage: $0 <src-dir> [dest-root]" >&2; exit 2; }
[[ -d "${SRC_DIR}" ]] || { echo "source dir not found: ${SRC_DIR}" >&2; exit 2; }
[[ -d "/Volumes/My Passport" ]] || { echo "target volume missing" >&2; exit 2; }
[[ -w "/Volumes/My Passport" ]] || { echo "target volume not writable" >&2; exit 2; }

RUN_TS="$(date +%Y%m%d_%H%M%S)"
LOG_DIR="${HOME}/Library/Logs/t9_flat_batch_${RUN_TS}"
LOG_FILE="${LOG_DIR}/run.log"
STATE_FILE="${LOG_DIR}/state.env"
BATCH_DIR="${DEST_ROOT}/batch_${RUN_TS}"

mkdir -p "${LOG_DIR}" "${DEST_ROOT}" "${BATCH_DIR}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${LOG_FILE}"
}

write_state() {
  {
    printf 'SRC_DIR=%q\n' "${SRC_DIR}"
    printf 'DEST_ROOT=%q\n' "${DEST_ROOT}"
    printf 'BATCH_DIR=%q\n' "${BATCH_DIR}"
    printf 'DONE_FILES=%q\n' "${DONE_FILES:-0}"
    printf 'DONE_BYTES=%q\n' "${DONE_BYTES:-0}"
    printf 'CURRENT_FILE=%q\n' "${CURRENT_FILE:-}"
  } > "${STATE_FILE}"
}

DONE_FILES=0
DONE_BYTES=0
CURRENT_FILE=""
write_state
log "START src_dir=${SRC_DIR} batch_dir=${BATCH_DIR}"

while IFS= read -r -d '' src; do
  size="$(stat -f '%z' "${src}" 2>/dev/null || echo 0)"
  if (( size < MIN_BYTES )); then
    continue
  fi
  if (( DONE_FILES >= MAX_FILES )); then
    break
  fi
  if (( DONE_BYTES > 0 && DONE_BYTES + size > MAX_BATCH_BYTES )); then
    break
  fi
  if (( DONE_BYTES == 0 && size > MAX_BATCH_BYTES )); then
    continue
  fi

  base="$(basename "${src}")"
  dest="${BATCH_DIR}/${base}"
  CURRENT_FILE="${src}"
  write_state
  rm -f -- "${dest}.part"
  log "COPY size=${size} src=${src}"
  if ! ditto "${src}" "${dest}.part"; then
    log "ERROR copy_failed src=${src}"
    rm -f -- "${dest}.part"
    continue
  fi
  actual="$(stat -f '%z' "${dest}.part" 2>/dev/null || echo 0)"
  if [[ "${actual}" != "${size}" ]]; then
    log "ERROR verify_failed src=${src} expected=${size} actual=${actual}"
    rm -f -- "${dest}.part"
    continue
  fi
  mv -f -- "${dest}.part" "${dest}"
  rm -f -- "${src}"
  DONE_FILES=$(( DONE_FILES + 1 ))
  DONE_BYTES=$(( DONE_BYTES + size ))
  write_state
  log "DONE_FILE size=${size} src_deleted=1 src=${src}"
done < <(find "${SRC_DIR}" -maxdepth 1 -type f ! -name '._*' ! -name '.DS_Store' -print0 2>/dev/null)

CURRENT_FILE=""
write_state
log "DONE batch_files=${DONE_FILES} batch_bytes=${DONE_BYTES} batch_dir=${BATCH_DIR}"
