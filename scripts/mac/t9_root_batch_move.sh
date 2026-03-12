#!/bin/bash

set -u

SOURCE_ROOTS="${SOURCE_ROOTS:-/Volumes/T9/Samsung2:/Volumes/T9/Samsung3:/Volumes/T9/Videos von Samsung2:/Volumes/T9/Bilder von Samsung2:/Volumes/T9/1:/Volumes/T9/3:/Volumes/T9/4:/Volumes/T9/5:/Volumes/T9/6:/Volumes/T9/7:/Volumes/T9/8:/Volumes/T9/9:/Volumes/T9/10}"
TARGET_ROOT="${TARGET_ROOT:-/Volumes/My Passport/t9_file_batches_active}"
MIN_BYTES="${MIN_BYTES:-1048576}"              # 1 MiB
MAX_FILES="${MAX_FILES:-1000}"
MAX_BATCH_BYTES="${MAX_BATCH_BYTES:-2147483648}" # 2 GiB
MAX_DEPTH="${MAX_DEPTH:-99}"

RUN_TS="$(date +%Y%m%d_%H%M%S)"
LOG_DIR="${HOME}/Library/Logs/t9_root_batch_${RUN_TS}"
LOG_FILE="${LOG_DIR}/run.log"
STATE_FILE="${LOG_DIR}/state.env"
MANIFEST="${LOG_DIR}/manifest.bin"
BATCH_DIR="${TARGET_ROOT}/batch_${RUN_TS}"

mkdir -p "${LOG_DIR}" "${TARGET_ROOT}" "${BATCH_DIR}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${LOG_FILE}"
}

write_state() {
  {
    printf 'SOURCE_ROOTS=%q\n' "${SOURCE_ROOTS}"
    printf 'TARGET_ROOT=%q\n' "${TARGET_ROOT}"
    printf 'BATCH_DIR=%q\n' "${BATCH_DIR}"
    printf 'MAX_DEPTH=%q\n' "${MAX_DEPTH}"
    printf 'SELECTED_FILES=%q\n' "${SELECTED_FILES:-0}"
    printf 'SELECTED_BYTES=%q\n' "${SELECTED_BYTES:-0}"
    printf 'DONE_FILES=%q\n' "${DONE_FILES:-0}"
    printf 'DONE_BYTES=%q\n' "${DONE_BYTES:-0}"
    printf 'CURRENT_FILE=%q\n' "${CURRENT_FILE:-}"
  } > "${STATE_FILE}"
}

[[ -d "/Volumes/T9" ]] || { echo "T9 missing" >&2; exit 2; }
[[ -d "/Volumes/My Passport" ]] || { echo "My Passport missing" >&2; exit 2; }
[[ -w "/Volumes/My Passport" ]] || { echo "My Passport not writable" >&2; exit 2; }

SELECTED_FILES=0
SELECTED_BYTES=0
DONE_FILES=0
DONE_BYTES=0
CURRENT_FILE=""
write_state

python3 - "${SOURCE_ROOTS}" "${MIN_BYTES}" "${MAX_FILES}" "${MAX_BATCH_BYTES}" "${MAX_DEPTH}" "${MANIFEST}" <<'PY'
import os
import sys
from pathlib import Path

roots = [r for r in sys.argv[1].split(":") if r]
min_bytes = int(sys.argv[2])
max_files = int(sys.argv[3])
max_batch_bytes = int(sys.argv[4])
max_depth = int(sys.argv[5])
manifest = Path(sys.argv[6])

skip_exact = {
    "$RECYCLE.BIN",
    "System Volume Information",
    "RECOVERY",
    "phase2_photorec",
    ".Spotlight-V100",
    ".fseventsd",
    ".Trashes",
}

selected = []
selected_bytes = 0

for root in roots:
    if len(selected) >= max_files or selected_bytes >= max_batch_bytes:
        break
    if not os.path.isdir(root):
        continue
    for dirpath, dirnames, filenames in os.walk(root):
        rel_depth = os.path.relpath(dirpath, root).count(os.sep)
        if os.path.relpath(dirpath, root) == ".":
            rel_depth = 0
        keep = []
        for name in dirnames:
            if name in skip_exact:
                continue
            if name.startswith(".Trash"):
                continue
            if name.startswith("._"):
                continue
            if rel_depth >= max_depth:
                continue
            keep.append(name)
        dirnames[:] = keep

        files = []
        for name in filenames:
            if name.startswith("._"):
                continue
            path = os.path.join(dirpath, name)
            try:
                st = os.stat(path)
            except Exception:
                continue
            if not os.path.isfile(path):
                continue
            if st.st_size < min_bytes:
                continue
            files.append((st.st_size, path))

        for size, path in sorted(files, reverse=True):
            if len(selected) >= max_files:
                break
            if selected and selected_bytes + size > max_batch_bytes:
                continue
            if not selected and size > max_batch_bytes:
                continue
            selected.append((size, path))
            selected_bytes += size
            if len(selected) >= max_files or selected_bytes >= max_batch_bytes:
                break

with manifest.open("wb") as fh:
    for size, path in selected:
        fh.write(str(size).encode("utf-8"))
        fh.write(b"\t")
        fh.write(path.encode("utf-8"))
        fh.write(b"\0")

print(f"{len(selected)}\t{selected_bytes}")
PY

read -r SELECTED_FILES SELECTED_BYTES < <(python3 - "${MANIFEST}" <<'PY'
import sys
from pathlib import Path
data = Path(sys.argv[1]).read_bytes().split(b"\0")
count = 0
total = 0
for item in data:
    if not item:
        continue
    count += 1
    size = int(item.split(b"\t", 1)[0].decode("utf-8"))
    total += size
print(f"{count}\t{total}")
PY
)

write_state
log "SELECT files=${SELECTED_FILES} bytes=${SELECTED_BYTES} batch_dir=${BATCH_DIR}"

if (( SELECTED_FILES == 0 )); then
  log "DONE no_more_candidates=1"
  exit 0
fi

while IFS= read -r -d '' record; do
  size="${record%%$'\t'*}"
  src="${record#*$'\t'}"
  rel="${src#/Volumes/T9/}"
  dest="${BATCH_DIR}/${rel}"
  CURRENT_FILE="${src}"
  write_state
  mkdir -p "$(dirname "${dest}")"
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
done < "${MANIFEST}"

CURRENT_FILE=""
write_state
log "DONE batch_files=${DONE_FILES} batch_bytes=${DONE_BYTES} batch_dir=${BATCH_DIR}"
