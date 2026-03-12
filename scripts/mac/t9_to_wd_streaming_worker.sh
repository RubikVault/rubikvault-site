#!/bin/bash

set -u

MAX_FILES_PER_BATCH="${MAX_FILES_PER_BATCH:-100}"
MAX_BYTES_PER_BATCH="${MAX_BYTES_PER_BATCH:-5368709120}"
SMALL_FILE_LIMIT_BYTES="${SMALL_FILE_LIMIT_BYTES:-1048576}"
SMALL_DELETE_PER_SCAN="${SMALL_DELETE_PER_SCAN:-1000}"
FILE_HANG_SECONDS="${FILE_HANG_SECONDS:-180}"
HEARTBEAT_SECONDS="${HEARTBEAT_SECONDS:-15}"
SCAN_CANDIDATE_LIMIT="${SCAN_CANDIDATE_LIMIT:-4000}"
SCAN_ROOTS="${SCAN_ROOTS:-}"
RUN_TS="${RUN_TS:-$(date +%Y%m%d_%H%M%S)}"
TARGET_ROOT_NAME="${TARGET_ROOT_NAME:-t9_stream_batches_active}"

LOCAL_RUN_DIR="${HOME}/Library/Logs/t9_to_wd_${RUN_TS}"
LOG_FILE="${LOCAL_RUN_DIR}/run.log"
STATE_FILE="${LOCAL_RUN_DIR}/state.env"
FAILED_BATCHES_LOG="${LOCAL_RUN_DIR}/failed_batches.log"
SKIPPED_PATHS_LOG="${LOCAL_RUN_DIR}/skipped_paths.log"
TARGET_DATA_ROOT=""

mkdir -p "${LOCAL_RUN_DIR}"
: > "${LOG_FILE}"
: > "${FAILED_BATCHES_LOG}"
: > "${SKIPPED_PATHS_LOG}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${LOG_FILE}"
}

warn() { log "WARN  $*"; }
die() { log "ERROR $*"; exit 1; }

human_bytes() {
  awk -v bytes="${1:-0}" '
    function human(x, i, units) {
      split("B KiB MiB GiB TiB", units, " ")
      i = 1
      while (x >= 1024 && i < 5) { x /= 1024; i++ }
      printf "%.2f %s", x, units[i]
    }
    BEGIN { human(bytes) }'
}

write_state() {
  {
    printf 'CURRENT_PHASE=%q\n' "${CURRENT_PHASE:-}"
    printf 'CURRENT_BATCH=%q\n' "${CURRENT_BATCH:-}"
    printf 'CURRENT_FILE=%q\n' "${CURRENT_FILE:-}"
    printf 'PROCESSED_FILES=%q\n' "${PROCESSED_FILES:-0}"
    printf 'PROCESSED_BYTES=%q\n' "${PROCESSED_BYTES:-0}"
    printf 'DELETED_SMALL_FILES=%q\n' "${DELETED_SMALL_FILES:-0}"
    printf 'DELETED_SMALL_BYTES=%q\n' "${DELETED_SMALL_BYTES:-0}"
    printf 'FAILED_BATCHES=%q\n' "${FAILED_BATCHES:-0}"
    printf 'LAST_SUCCESS_TS=%q\n' "${LAST_SUCCESS_TS:-0}"
    printf 'LAST_ACTIVITY_TS=%q\n' "${LAST_ACTIVITY_TS:-0}"
    printf 'REMAINING_FILES=%q\n' "${REMAINING_FILES:--1}"
  } > "${STATE_FILE}"
}

heartbeat_loop() {
  while true; do
    sleep "${HEARTBEAT_SECONDS}"
    if [[ -f "${STATE_FILE}" ]]; then
      # shellcheck disable=SC1090
      source "${STATE_FILE}" || true
      now="$(date +%s)"
      last_ok=$(( now - ${LAST_SUCCESS_TS:-0} ))
      log "HEARTBEAT phase=${CURRENT_PHASE:-na} batch=${CURRENT_BATCH:-na} processed_files=${PROCESSED_FILES:-0} processed_bytes=$(human_bytes "${PROCESSED_BYTES:-0}") small_deleted=${DELETED_SMALL_FILES:-0} failed_batches=${FAILED_BATCHES:-0} last_success_age=${last_ok}s current_file=${CURRENT_FILE:-na}"
    fi
  done
}

cleanup() {
  local rc=$?
  if [[ -n "${HEARTBEAT_PID:-}" ]]; then
    kill "${HEARTBEAT_PID}" 2>/dev/null || true
  fi
  log "EXIT code=${rc}"
  exit "${rc}"
}

trap cleanup EXIT INT TERM

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

for cmd in bash python3 diskutil stat df ditto mdutil caffeinate shasum; do
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
    out = []
    for child in sorted(Path("/Volumes").iterdir()):
        if os.path.ismount(child) and pattern.search(child.name):
            out.append(str(child))
    return out

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

SOURCE_VOL="${SOURCE_VOL:-$(mount_volume_if_needed '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)' || true)}"
TARGET_VOL="${TARGET_VOL:-$(mount_volume_if_needed '(my passport|western digital|wd)' || true)}"

[[ -d "${SOURCE_VOL}" ]] || die "Source volume not found: ${SOURCE_VOL}"
[[ -d "${TARGET_VOL}" ]] || die "Target volume not found: ${TARGET_VOL}"
[[ "${SOURCE_VOL}" == /Volumes/* ]] || die "Source must be under /Volumes: ${SOURCE_VOL}"
[[ "${TARGET_VOL}" == /Volumes/* ]] || die "Target must be under /Volumes: ${TARGET_VOL}"
[[ "${SOURCE_VOL}" != "${TARGET_VOL}" ]] || die "Source and target are identical"
[[ -r "${SOURCE_VOL}" ]] || die "Source unreadable"
[[ -w "${TARGET_VOL}" ]] || die "Target not writable"

touch "${TARGET_VOL}/.t9_write_test_${RUN_TS}" || die "Target write test failed"
rm -f "${TARGET_VOL}/.t9_write_test_${RUN_TS}" || die "Target cleanup test failed"
mdutil -i off "${TARGET_VOL}" >/dev/null 2>&1 || warn "Could not disable Spotlight on target"

TARGET_DATA_ROOT="${TARGET_VOL}/${TARGET_ROOT_NAME}"
mkdir -p "${TARGET_DATA_ROOT}" || die "Could not create target data root"

CURRENT_PHASE="startup"
CURRENT_BATCH=""
CURRENT_FILE=""
PROCESSED_FILES=0
PROCESSED_BYTES=0
DELETED_SMALL_FILES=0
DELETED_SMALL_BYTES=0
FAILED_BATCHES=0
LAST_SUCCESS_TS="$(date +%s)"
LAST_ACTIVITY_TS="$(date +%s)"
REMAINING_FILES=-1
write_state
heartbeat_loop &
HEARTBEAT_PID=$!

log "SOURCE=${SOURCE_VOL}"
log "TARGET=${TARGET_VOL}"
log "TARGET_DATA_ROOT=${TARGET_DATA_ROOT}"

build_next_batch() {
  python3 - "${SOURCE_VOL}" "${SMALL_FILE_LIMIT_BYTES}" "${MAX_FILES_PER_BATCH}" "${MAX_BYTES_PER_BATCH}" "${SMALL_DELETE_PER_SCAN}" "${LOCAL_RUN_DIR}" "${SKIPPED_PATHS_LOG}" "${SCAN_CANDIDATE_LIMIT}" "${SCAN_ROOTS}" <<'PY'
import json, os, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1])
small_limit = int(sys.argv[2])
max_files = int(sys.argv[3])
max_bytes = int(sys.argv[4])
small_cap = int(sys.argv[5])
run_dir = Path(sys.argv[6])
skipped_log = Path(sys.argv[7])
candidate_limit = int(sys.argv[8])
scan_roots_raw = sys.argv[9].strip()

root_dev = os.stat(src).st_dev
exclude_dir_names = {".Spotlight-V100", ".Trashes", ".fseventsd"}
exclude_substrings = ["RECOVERY_UFS", "phase2_photorec", "volumeUSB2/usbshare2-2/Volumes/T9"]
deprioritize_substrings = ["recup_dir", "RECOVERY_FIXED_V2_T9", "/#recycle/", "@eaDir", "volumeUSB2/usbshare2-2"]
preferred_root_markers = ["videos", "samsung", "bilder", "movies", "dcim", "camera"]
deprioritize_root_markers = ["recovery", "recup", "recycle", "trash", "lost", "found"]

requested_roots = []
if scan_roots_raw:
    requested_roots = [item.strip() for item in scan_roots_raw.split(":") if item.strip()]

small = []
batch = []
batch_bytes = 0
skipped = []
candidates = []

def bad_path(path: Path) -> bool:
    text = str(path)
    return any(part in text for part in exclude_substrings)

def priority_key(rel: str, size: int):
    # Prefer big files and cleaner paths first; push recovery/recycle trees later.
    penalty = 0
    for marker in deprioritize_substrings:
        if marker in rel:
            penalty += 1
    return (penalty, -size, rel)

def root_priority(name: str):
    lower = name.lower()
    if any(marker in lower for marker in preferred_root_markers):
        return (0, lower)
    if any(marker in lower for marker in deprioritize_root_markers):
        return (2, lower)
    return (1, lower)

search_roots = []
if requested_roots:
    for rel in requested_roots:
        path = src / rel
        if path.exists() and path.is_dir():
            search_roots.append(path)
else:
    search_roots = [src]

def add_candidate(full: Path):
    try:
        st = os.stat(full)
    except Exception as exc:
        skipped.append(f"{full}\t{exc}")
        return
    if st.st_dev != root_dev:
        return
    rel = str(full.relative_to(src))
    if st.st_size > max_bytes:
        skipped.append(f"{full}\tskip_gt_batch_limit")
        return
    if st.st_size < small_limit:
        if len(small) < small_cap:
            small.append({"rel": rel, "size": st.st_size})
        return
    candidates.append({"rel": rel, "size": st.st_size})

if requested_roots:
    min_kib = max(1, small_limit // 1024)
    max_kib = max(1, max_bytes // 1024)
    for search_root in search_roots:
        cmd = [
            "find", str(search_root),
            "-type", "f",
            "-size", f"+{min_kib}k",
            "-size", f"-{max_kib + 1}k",
            "-print0",
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            buffer = b""
            while len(candidates) < candidate_limit:
                if proc.stdout and hasattr(proc.stdout, "read1"):
                    chunk = proc.stdout.read1(65536)
                elif proc.stdout:
                    chunk = proc.stdout.read(4096)
                else:
                    chunk = b""
                if not chunk:
                    if buffer:
                        parts = [buffer]
                        buffer = b""
                    else:
                        break
                else:
                    buffer += chunk
                    parts = buffer.split(b"\0")
                    buffer = parts.pop() if parts else b""
                if not parts:
                    break
                for raw in parts:
                    if not raw:
                        continue
                    full = Path(raw.decode("utf-8", errors="ignore"))
                    if bad_path(full):
                        skipped.append(str(full))
                        continue
                    add_candidate(full)
                    if len(candidates) >= candidate_limit:
                        break
        finally:
            proc.kill()
            proc.wait()
        if len(candidates) >= candidate_limit:
            break
else:
    for search_root in search_roots:
      for root, dirs, files in os.walk(search_root, topdown=True):
        root_path = Path(root)
        keep_dirs = []
        for d in dirs:
            full = root_path / d
            if d in exclude_dir_names or bad_path(full):
                skipped.append(str(full))
                continue
            try:
                if os.stat(full).st_dev == root_dev:
                    keep_dirs.append(d)
            except Exception as exc:
                skipped.append(f"{full}\t{exc}")
        dirs[:] = keep_dirs
        if root_path == search_root:
            dirs.sort(key=root_priority)

        for name in files:
            full = root_path / name
            if bad_path(full):
                skipped.append(str(full))
                continue
            add_candidate(full)
            if len(candidates) >= candidate_limit:
                break
        if len(candidates) >= candidate_limit:
            break
      if len(candidates) >= candidate_limit:
          break

candidates.sort(key=lambda item: priority_key(item["rel"], item["size"]))

for item in candidates:
    if batch and (len(batch) >= max_files or batch_bytes + item["size"] > max_bytes):
        break
    batch.append(item)
    batch_bytes += item["size"]
    if len(batch) >= max_files or batch_bytes >= max_bytes:
        break

for entry in skipped[:200]:
    with skipped_log.open("a", encoding="utf-8") as fh:
        fh.write(entry + "\n")

payload = {
    "small": small,
    "batch": batch,
    "batch_bytes": batch_bytes,
}
print(json.dumps(payload))
PY
}

copy_file_with_watch() {
  local src_file="$1"
  local dest_file="$2"
  local batch_id="$3"
  local file_num="$4"
  local file_total="$5"
  local src_size current_size now last_size last_progress next_hb

  src_size="$(stat -f '%z' "${src_file}")"
  mkdir -p "$(dirname "${dest_file}")" || return 1
  rm -f -- "${dest_file}.part"
  CURRENT_FILE="${src_file}"
  LAST_ACTIVITY_TS="$(date +%s)"
  write_state

  ditto "${src_file}" "${dest_file}.part" &
  local copy_pid=$!
  last_size=0
  last_progress="$(date +%s)"
  next_hb="${last_progress}"

  while kill -0 "${copy_pid}" 2>/dev/null; do
    now="$(date +%s)"
    current_size=0
    if [[ -f "${dest_file}.part" ]]; then
      current_size="$(stat -f '%z' "${dest_file}.part" 2>/dev/null || echo 0)"
    fi
    if (( current_size > last_size )); then
      last_size="${current_size}"
      last_progress="${now}"
      LAST_ACTIVITY_TS="${now}"
    fi
    if (( now >= next_hb )); then
      log "COPY batch=${batch_id} file=${file_num}/${file_total} progress=$(human_bytes "${current_size}")/$(human_bytes "${src_size}") rel=${src_file#${SOURCE_VOL}/}"
      next_hb=$(( now + HEARTBEAT_SECONDS ))
    fi
    if (( now - last_progress >= FILE_HANG_SECONDS )); then
      warn "File copy hang detected: ${src_file}"
      kill -TERM "${copy_pid}" 2>/dev/null || true
      sleep 2
      kill -KILL "${copy_pid}" 2>/dev/null || true
      wait "${copy_pid}" 2>/dev/null || true
      return 124
    fi
    sleep 2
  done

  wait "${copy_pid}"
  local rc=$?
  if (( rc != 0 )); then
    return "${rc}"
  fi
  mv -f -- "${dest_file}.part" "${dest_file}" || return 1
  LAST_SUCCESS_TS="$(date +%s)"
  LAST_ACTIVITY_TS="${LAST_SUCCESS_TS}"
  write_state
  return 0
}

verify_batch() {
  local manifest="$1"
  local batch_dest="$2"
  python3 - "${SOURCE_VOL}" "${manifest}" "${batch_dest}" <<'PY'
import hashlib, json, sys
from pathlib import Path

src = Path(sys.argv[1])
manifest = Path(sys.argv[2])
dest_root = Path(sys.argv[3])
items = json.loads(manifest.read_text(encoding="utf-8"))

for item in items:
    rel = item["rel"]
    src_file = src / rel
    dst_file = dest_root / rel
    if not src_file.exists() or not dst_file.exists():
        raise SystemExit(f"missing\t{rel}")
    if src_file.stat().st_size != dst_file.stat().st_size:
        raise SystemExit(f"size\t{rel}")

sample = items if len(items) <= 5 else [items[0], items[len(items)//2], items[-1]]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

for item in sample:
    rel = item["rel"]
    if sha256(src / rel) != sha256(dest_root / rel):
        raise SystemExit(f"checksum\t{rel}")
print("VERIFY_OK")
PY
}

delete_manifest_sources() {
  local manifest="$1"
  python3 - "${SOURCE_VOL}" "${manifest}" <<'PY'
import json, sys
from pathlib import Path

src = Path(sys.argv[1])
manifest = Path(sys.argv[2])
items = json.loads(manifest.read_text(encoding="utf-8"))
count = 0
size = 0
parents = set()
for item in items:
    rel = item["rel"]
    full = src / rel
    try:
      if full.is_file():
        size += full.stat().st_size
        full.unlink()
        count += 1
        parents.add(full.parent)
    except Exception:
      pass
for parent in sorted(parents, key=lambda p: len(str(p)), reverse=True):
    path = parent
    while str(path).startswith(str(src)):
        try:
            path.rmdir()
        except Exception:
            break
        if path == src:
            break
        path = path.parent
print(f"{count}\t{size}")
PY
}

delete_small_files_batch() {
  local small_json="$1"
  python3 - "${SOURCE_VOL}" "${small_json}" <<'PY'
import json, sys
from pathlib import Path

src = Path(sys.argv[1])
items = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
count = 0
size = 0
for item in items:
    full = src / item["rel"]
    try:
        if full.is_file():
            size += full.stat().st_size
            full.unlink()
            count += 1
    except Exception:
        pass
print(f"{count}\t{size}")
PY
}

batch_num=0
CURRENT_PHASE="streaming"
write_state

while true; do
  batch_num=$(( batch_num + 1 ))
  CURRENT_BATCH="batch_$(printf '%06d' "${batch_num}")"
  CURRENT_FILE=""
  LAST_ACTIVITY_TS="$(date +%s)"
  write_state

  payload="$(build_next_batch)" || die "Batch builder failed"
  printf '%s' "${payload}" > "${LOCAL_RUN_DIR}/${CURRENT_BATCH}.payload.json"

  small_json="${LOCAL_RUN_DIR}/${CURRENT_BATCH}.small.json"
  batch_json="${LOCAL_RUN_DIR}/${CURRENT_BATCH}.batch.json"
  python3 - "${LOCAL_RUN_DIR}/${CURRENT_BATCH}.payload.json" "${small_json}" "${batch_json}" > "${LOCAL_RUN_DIR}/${CURRENT_BATCH}.counts" <<'PY'
import json, sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
Path(sys.argv[2]).write_text(json.dumps(payload["small"], indent=2), encoding="utf-8")
Path(sys.argv[3]).write_text(json.dumps(payload["batch"], indent=2), encoding="utf-8")
print(len(payload["small"]), len(payload["batch"]), payload["batch_bytes"])
PY
  read -r small_found batch_found batch_bytes < "${LOCAL_RUN_DIR}/${CURRENT_BATCH}.counts"

  if (( small_found > 0 )); then
    read -r deleted_count deleted_bytes < <(delete_small_files_batch "${small_json}")
    DELETED_SMALL_FILES=$(( DELETED_SMALL_FILES + deleted_count ))
    DELETED_SMALL_BYTES=$(( DELETED_SMALL_BYTES + deleted_bytes ))
    LAST_SUCCESS_TS="$(date +%s)"
    LAST_ACTIVITY_TS="${LAST_SUCCESS_TS}"
    write_state
    log "SMALL_DELETE batch=${CURRENT_BATCH} count=${deleted_count} bytes=$(human_bytes "${deleted_bytes}")"
  fi

  if (( batch_found == 0 )); then
    if (( small_found == 0 )); then
      log "No more readable files found for processing"
      break
    fi
    continue
  fi

  batch_dest="${TARGET_DATA_ROOT}/${CURRENT_BATCH}"
  if [[ -d "${batch_dest}" ]]; then
    rm -rf -- "${batch_dest}" || die "Could not reset existing batch destination: ${batch_dest}"
  fi
  mkdir -p "${batch_dest}" || die "Could not create batch destination"
  log "START batch=${CURRENT_BATCH} files=${batch_found} bytes=$(human_bytes "${batch_bytes}")"

  attempt=0
  batch_ok=0
  while (( attempt <= 1 )); do
    attempt=$(( attempt + 1 ))
    copy_failed=0
    file_idx=0
    while IFS= read -r relpath; do
      [[ -n "${relpath}" ]] || continue
      file_idx=$(( file_idx + 1 ))
      src_file="${SOURCE_VOL}/${relpath}"
      dest_file="${batch_dest}/${relpath}"
      if [[ ! -f "${src_file}" ]]; then
        warn "Source missing before copy: ${src_file}"
        copy_failed=1
        break
      fi
      if ! copy_file_with_watch "${src_file}" "${dest_file}" "${CURRENT_BATCH}" "${file_idx}" "${batch_found}"; then
        warn "Copy failed batch=${CURRENT_BATCH} attempt=${attempt} file=${src_file}"
        copy_failed=1
        break
      fi
    done < <(python3 - "${batch_json}" <<'PY'
import json, sys
from pathlib import Path
for item in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")):
    print(item["rel"])
PY
)

    if (( copy_failed == 0 )) && verify_batch "${batch_json}" "${batch_dest}" >> "${LOG_FILE}" 2>&1; then
      read -r deleted_count deleted_bytes < <(delete_manifest_sources "${batch_json}")
      PROCESSED_FILES=$(( PROCESSED_FILES + deleted_count ))
      PROCESSED_BYTES=$(( PROCESSED_BYTES + deleted_bytes ))
      LAST_SUCCESS_TS="$(date +%s)"
      LAST_ACTIVITY_TS="${LAST_SUCCESS_TS}"
      write_state
      log "DONE batch=${CURRENT_BATCH} files=${deleted_count} bytes=$(human_bytes "${deleted_bytes}")"
      batch_ok=1
      break
    fi
    warn "Batch failed verification/copy batch=${CURRENT_BATCH} attempt=${attempt}"
    rm -rf -- "${batch_dest}"
  done

  if (( batch_ok == 0 )); then
    FAILED_BATCHES=$(( FAILED_BATCHES + 1 ))
    echo "${CURRENT_BATCH}" >> "${FAILED_BATCHES_LOG}"
    write_state
    warn "FAILED batch=${CURRENT_BATCH}"
  fi
done

CURRENT_PHASE="final_verification"
CURRENT_BATCH=""
CURRENT_FILE=""
write_state

python3 - "${SOURCE_VOL}" "${LOCAL_RUN_DIR}/remaining_on_t9.txt" > "${LOCAL_RUN_DIR}/remaining_count.txt" <<'PY'
import os, sys
from pathlib import Path
src = Path(sys.argv[1])
out = Path(sys.argv[2])
root_dev = os.stat(src).st_dev
exclude = ["RECOVERY_UFS", "phase2_photorec", "volumeUSB2/usbshare2-2/Volumes/T9"]
remaining = []
for root, dirs, files in os.walk(src, topdown=True):
    dirs[:] = [d for d in dirs if all(x not in str(Path(root) / d) for x in exclude)]
    for name in files:
        full = Path(root) / name
        try:
            if os.stat(full).st_dev != root_dev:
                continue
        except Exception:
            continue
        remaining.append(str(full))
out.write_text("\n".join(remaining) + ("\n" if remaining else ""), encoding="utf-8")
print(len(remaining))
PY

remaining_count="$(cat "${LOCAL_RUN_DIR}/remaining_count.txt")"
log "SUMMARY small_deleted_count=${DELETED_SMALL_FILES} small_deleted_bytes=$(human_bytes "${DELETED_SMALL_BYTES}")"
log "SUMMARY moved_large_count=${PROCESSED_FILES} moved_large_bytes=$(human_bytes "${PROCESSED_BYTES}")"
log "SUMMARY failed_batches=${FAILED_BATCHES}"
log "SUMMARY remaining_files_on_t9=${remaining_count}"
if [[ "${remaining_count}" == "0" ]]; then
  log "T9_EMPTY=yes"
else
  warn "T9_EMPTY=no remaining_list=${LOCAL_RUN_DIR}/remaining_on_t9.txt"
fi
