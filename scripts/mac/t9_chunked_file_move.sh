#!/bin/bash

set -u

SRC_FILE="${1:-}"
DEST_ROOT="${2:-/Volumes/My Passport/t9_chunked_active}"
CHUNK_BYTES="${CHUNK_BYTES:-2147483648}" # 2 GiB
BLOCK_BYTES="${BLOCK_BYTES:-1048576}"    # 1 MiB

[[ -n "${SRC_FILE}" ]] || { echo "usage: $0 <src-file> [dest-root]" >&2; exit 2; }
[[ -f "${SRC_FILE}" ]] || { echo "source file not found: ${SRC_FILE}" >&2; exit 2; }
[[ -d "/Volumes/My Passport" ]] || { echo "target volume missing" >&2; exit 2; }
[[ -w "/Volumes/My Passport" ]] || { echo "target volume not writable" >&2; exit 2; }

RUN_TS="$(date +%Y%m%d_%H%M%S)"
LOG_DIR="${HOME}/Library/Logs/t9_chunked_${RUN_TS}"
LOG_FILE="${LOG_DIR}/run.log"
STATE_FILE="${LOG_DIR}/state.env"
mkdir -p "${LOG_DIR}" "${DEST_ROOT}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${LOG_FILE}"
}

write_state() {
  {
    printf 'SRC_FILE=%q\n' "${SRC_FILE}"
    printf 'DEST_ROOT=%q\n' "${DEST_ROOT}"
    printf 'CURRENT_CHUNK=%q\n' "${CURRENT_CHUNK:-0}"
    printf 'TOTAL_CHUNKS=%q\n' "${TOTAL_CHUNKS:-0}"
    printf 'BYTES_DONE=%q\n' "${BYTES_DONE:-0}"
  } > "${STATE_FILE}"
}

SRC_SIZE="$(stat -f '%z' "${SRC_FILE}")"
CHUNK_MIB=$(( CHUNK_BYTES / BLOCK_BYTES ))
TOTAL_CHUNKS=$(( (SRC_SIZE + CHUNK_BYTES - 1) / CHUNK_BYTES ))
BYTES_DONE=0
CURRENT_CHUNK=0
write_state

SAFE_NAME="$(basename "${SRC_FILE}")"
TARGET_DIR="${DEST_ROOT}/${SAFE_NAME}.chunks"
mkdir -p "${TARGET_DIR}"

log "START src=${SRC_FILE} size=${SRC_SIZE} chunk_bytes=${CHUNK_BYTES} total_chunks=${TOTAL_CHUNKS}"

chunk_index=0
offset_bytes=0
while (( offset_bytes < SRC_SIZE )); do
  chunk_index=$(( chunk_index + 1 ))
  CURRENT_CHUNK="${chunk_index}"
  remaining=$(( SRC_SIZE - offset_bytes ))
  if (( remaining > CHUNK_BYTES )); then
    this_chunk_bytes="${CHUNK_BYTES}"
  else
    this_chunk_bytes="${remaining}"
  fi

  skip_blocks=$(( offset_bytes / BLOCK_BYTES ))
  count_blocks=$(( (this_chunk_bytes + BLOCK_BYTES - 1) / BLOCK_BYTES ))
  part_file="${TARGET_DIR}/chunk_$(printf '%05d' "${chunk_index}").bin"

  if [[ -f "${part_file}" ]]; then
    existing_size="$(stat -f '%z' "${part_file}")"
    if (( existing_size == this_chunk_bytes )); then
      log "RESUME skip_existing chunk=${chunk_index}/${TOTAL_CHUNKS} bytes=${this_chunk_bytes} offset=${offset_bytes}"
      BYTES_DONE=$(( BYTES_DONE + existing_size ))
      write_state
      offset_bytes=$(( offset_bytes + existing_size ))
      continue
    fi
    rm -f "${part_file}"
  fi

  log "COPY chunk=${chunk_index}/${TOTAL_CHUNKS} bytes=${this_chunk_bytes} offset=${offset_bytes}"
  dd if="${SRC_FILE}" of="${part_file}" bs="${BLOCK_BYTES}" skip="${skip_blocks}" count="${count_blocks}" status=none

  actual_size="$(stat -f '%z' "${part_file}")"
  if (( actual_size != this_chunk_bytes )); then
    log "ERROR chunk-size-mismatch chunk=${chunk_index} expected=${this_chunk_bytes} actual=${actual_size}"
    exit 1
  fi

  BYTES_DONE=$(( BYTES_DONE + actual_size ))
  write_state
  offset_bytes=$(( offset_bytes + actual_size ))
done

target_sum="$(find "${TARGET_DIR}" -type f -name 'chunk_*.bin' -exec stat -f '%z' {} + | awk '{s+=$1} END {print s+0}')"
if (( target_sum != SRC_SIZE )); then
  log "ERROR total-size-mismatch expected=${SRC_SIZE} actual=${target_sum}"
  exit 1
fi

manifest="${TARGET_DIR}/manifest.txt"
{
  echo "source=${SRC_FILE}"
  echo "source_size=${SRC_SIZE}"
  echo "chunk_bytes=${CHUNK_BYTES}"
  echo "total_chunks=${TOTAL_CHUNKS}"
} > "${manifest}"

rm -f "${SRC_FILE}"
log "DONE src_deleted=1 bytes=${SRC_SIZE} target_dir=${TARGET_DIR}"
