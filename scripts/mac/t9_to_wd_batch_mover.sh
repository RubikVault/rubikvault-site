#!/bin/bash

set -u

MAX_FILES_PER_BATCH="${MAX_FILES_PER_BATCH:-100}"
MAX_BYTES_PER_BATCH="${MAX_BYTES_PER_BATCH:-5368709120}" # 5 GiB
SMALL_FILE_LIMIT_BYTES="${SMALL_FILE_LIMIT_BYTES:-1048576}" # 1 MiB
BATCH_RETRIES="${BATCH_RETRIES:-1}"
FILE_HANG_SECONDS="${FILE_HANG_SECONDS:-180}"
HEARTBEAT_SECONDS="${HEARTBEAT_SECONDS:-15}"
SUPERVISOR_MODE="${SUPERVISOR_MODE:-0}"
SUPERVISOR_RUNTIME_SECONDS="${SUPERVISOR_RUNTIME_SECONDS:-14400}" # 4 hours
SUPERVISOR_POLL_SECONDS="${SUPERVISOR_POLL_SECONDS:-30}"
STALL_RESTART_SECONDS="${STALL_RESTART_SECONDS:-420}"

RUN_TS="${RUN_TS:-$(date +%Y%m%d_%H%M%S)}"
LOCAL_RUN_DIR="${HOME}/Library/Logs/t9_to_wd_${RUN_TS}"
STATE_FILE="${LOCAL_RUN_DIR}/state.env"
LOG_FILE="${LOCAL_RUN_DIR}/run.log"
FAILED_BATCHES_LOG="${LOCAL_RUN_DIR}/failed_batches.log"
SMALL_DELETE_LOG="${LOCAL_RUN_DIR}/deleted_small_files.log"

mkdir -p "${LOCAL_RUN_DIR}"
: > "${LOG_FILE}"
: > "${FAILED_BATCHES_LOG}"
: > "${SMALL_DELETE_LOG}"

log() {
  local msg="[$(date '+%F %T')] $*"
  echo "${msg}" | tee -a "${LOG_FILE}"
}

warn() {
  log "WARN  $*"
}

die() {
  log "ERROR $*"
  exit 1
}

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
    printf 'FAILED_BATCHES=%q\n' "${FAILED_BATCHES:-0}"
    printf 'LAST_SUCCESS_TS=%q\n' "${LAST_SUCCESS_TS:-0}"
    printf 'REMAINING_BATCHES=%q\n' "${REMAINING_BATCHES:-0}"
    printf 'REMAINING_FILES=%q\n' "${REMAINING_FILES:-0}"
  } > "${STATE_FILE}"
}

heartbeat_loop() {
  while true; do
    sleep "${HEARTBEAT_SECONDS}"
    if [[ -f "${STATE_FILE}" ]]; then
      # shellcheck disable=SC1090
      source "${STATE_FILE}"
      local now last_age
      now="$(date +%s)"
      last_age=$(( now - ${LAST_SUCCESS_TS:-0} ))
      log "HEARTBEAT phase=${CURRENT_PHASE:-na} batch=${CURRENT_BATCH:-na} processed_files=${PROCESSED_FILES:-0} processed_bytes=$(human_bytes "${PROCESSED_BYTES:-0}") remaining_batches=${REMAINING_BATCHES:-0} remaining_files=${REMAINING_FILES:-0} failed_batches=${FAILED_BATCHES:-0} last_success_age=${last_age}s current_file=${CURRENT_FILE:-na}"
      if (( LAST_SUCCESS_TS > 0 )) && (( last_age >= FILE_HANG_SECONDS )); then
        warn "No successful file completion for ${last_age}s"
      fi
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

for cmd in bash python3 diskutil find stat df ditto mdutil caffeinate shasum; do
  require_cmd "${cmd}"
done

if [[ "${T9WD_NO_CAFFEINATE:-0}" != "1" && -z "${T9WD_CAFFEINATED:-}" ]]; then
  export T9WD_CAFFEINATED=1
  exec caffeinate -dimsu "${BASH_SOURCE[0]}" "$@"
fi

mount_volume_if_needed() {
  local label_regex="$1"
  python3 - "$label_regex" <<'PY'
import json, os, re, subprocess, sys
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

try:
    out = subprocess.check_output(["diskutil", "list", "external", "physical"], text=True, stderr=subprocess.STDOUT)
except subprocess.CalledProcessError as exc:
    print(exc.output, file=sys.stderr)
    raise

disk = None
for line in out.splitlines():
    if pattern.search(line):
        parts = line.split()
        if parts:
            ident = parts[-1]
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

if [[ "${SUPERVISOR_MODE}" == "1" ]]; then
  SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  MASTER_DIR="${HOME}/Library/Logs/t9_to_wd_supervisor_${RUN_TS}"
  mkdir -p "${MASTER_DIR}"
  SUP_LOG="${MASTER_DIR}/supervisor.log"
  SUP_STATE="${MASTER_DIR}/supervisor_state.env"
  : > "${SUP_LOG}"
  worker_pid=""
  worker_log=""
  worker_state=""
  worker_run_dir=""
  worker_stdout_log=""
  start_ts="$(date +%s)"
  end_ts=$(( start_ts + SUPERVISOR_RUNTIME_SECONDS ))
  restart_count=0
  log_sup() {
    local msg="[$(date '+%F %T')] $*"
    echo "${msg}" | tee -a "${SUP_LOG}"
  }
  write_sup_state() {
    {
      printf 'WORKER_PID=%q\n' "${worker_pid}"
      printf 'WORKER_LOG=%q\n' "${worker_log}"
      printf 'WORKER_STATE=%q\n' "${worker_state}"
      printf 'WORKER_RUN_DIR=%q\n' "${worker_run_dir}"
      printf 'RESTART_COUNT=%q\n' "${restart_count}"
      printf 'END_TS=%q\n' "${end_ts}"
    } > "${SUP_STATE}"
  }
  log_sup "Supervisor start runtime=${SUPERVISOR_RUNTIME_SECONDS}s"
  while (( "$(date +%s)" < end_ts )); do
    SOURCE_VOL="${SOURCE_VOL:-$(mount_volume_if_needed '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)' || true)}"
    TARGET_VOL="${TARGET_VOL:-$(mount_volume_if_needed '(my passport|western digital|wd)' || true)}"
    worker_ts="$(date +%Y%m%d_%H%M%S)"
    worker_run_dir="${HOME}/Library/Logs/t9_to_wd_${worker_ts}"
    worker_log="${worker_run_dir}/run.log"
    worker_state="${worker_run_dir}/state.env"
    worker_stdout_log="${MASTER_DIR}/worker_${worker_ts}.stdout.log"
    T9WD_NO_CAFFEINATE=1 \
    SUPERVISOR_MODE=0 \
    RUN_TS="${worker_ts}" \
    SOURCE_VOL="${SOURCE_VOL}" \
    TARGET_VOL="${TARGET_VOL}" \
    "${SCRIPT_PATH}" >> "${worker_stdout_log}" 2>&1 &
    worker_pid=$!
    sleep 2
    restart_count=$(( restart_count + 1 ))
    write_sup_state
    log_sup "Worker start pid=${worker_pid} run_dir=${worker_run_dir}"
    while kill -0 "${worker_pid}" 2>/dev/null; do
      sleep "${SUPERVISOR_POLL_SECONDS}"
      SOURCE_VOL="${SOURCE_VOL:-$(mount_volume_if_needed '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)' || true)}"
      TARGET_VOL="${TARGET_VOL:-$(mount_volume_if_needed '(my passport|western digital|wd)' || true)}"
      if [[ -f "${worker_state}" ]]; then
        # shellcheck disable=SC1090
        source "${worker_state}" || true
        now="$(date +%s)"
        age=$(( now - ${LAST_SUCCESS_TS:-0} ))
        log_sup "Monitor pid=${worker_pid} phase=${CURRENT_PHASE:-na} batch=${CURRENT_BATCH:-na} file=${CURRENT_FILE:-na} age=${age}s processed=${PROCESSED_FILES:-0}"
        if (( LAST_SUCCESS_TS > 0 )) && (( age >= STALL_RESTART_SECONDS )); then
          log_sup "Restarting stalled worker pid=${worker_pid} age=${age}s"
          kill -TERM "${worker_pid}" 2>/dev/null || true
          sleep 5
          kill -KILL "${worker_pid}" 2>/dev/null || true
          break
        fi
      else
        log_sup "Worker state file not ready yet"
      fi
      if (( "$(date +%s)" >= end_ts )); then
        log_sup "Supervisor runtime reached, stopping worker"
        kill -TERM "${worker_pid}" 2>/dev/null || true
        sleep 5
        kill -KILL "${worker_pid}" 2>/dev/null || true
        break
      fi
    done
    wait "${worker_pid}" 2>/dev/null || true
    if [[ -f "${worker_log}" ]] && grep -q 'T9_EMPTY=yes' "${worker_log}"; then
      log_sup "Worker reported T9_EMPTY=yes"
      exit 0
    fi
    if (( "$(date +%s)" >= end_ts )); then
      break
    fi
    log_sup "Worker ended without completion; restarting"
  done
  log_sup "Supervisor exit"
  exit 0
fi

choose_volume() {
  local purpose="$1"
  local pattern="$2"
  python3 - "$purpose" "$pattern" <<'PY'
import os, re, sys
from pathlib import Path

purpose = sys.argv[1]
pattern = re.compile(sys.argv[2], re.I)
mounts = []
for child in sorted(Path("/Volumes").iterdir()):
    if not os.path.ismount(child):
        continue
    mounts.append(str(child))
candidates = [m for m in mounts if pattern.search(Path(m).name)]
if len(candidates) == 1:
    print(candidates[0])
    raise SystemExit(0)
if len(candidates) == 0:
    candidates = mounts
if not sys.stdin.isatty():
    raise SystemExit(f"{purpose}: could not auto-select a unique mounted volume")
print(f"Select {purpose} volume:")
for idx, item in enumerate(candidates, 1):
    print(f"{idx}) {item}")
while True:
    choice = input("> ").strip()
    if choice.isdigit():
        index = int(choice)
        if 1 <= index <= len(candidates):
            print(candidates[index - 1])
            break
PY
}

SOURCE_VOL="${SOURCE_VOL:-}"
TARGET_VOL="${TARGET_VOL:-}"

if [[ -z "${SOURCE_VOL}" ]]; then
  SOURCE_VOL="$(mount_volume_if_needed '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)' || choose_volume "source" '(^|[^A-Za-z])(t9|samsung)([^A-Za-z]|$)')"
fi
if [[ -z "${TARGET_VOL}" ]]; then
  TARGET_VOL="$(mount_volume_if_needed '(my passport|western digital|wd)' || choose_volume "target" '(my passport|western digital|wd)')"
fi

[[ -d "${SOURCE_VOL}" ]] || die "Source volume not found: ${SOURCE_VOL}"
[[ -d "${TARGET_VOL}" ]] || die "Target volume not found: ${TARGET_VOL}"
[[ "${SOURCE_VOL}" == /Volumes/* ]] || die "Source must be under /Volumes: ${SOURCE_VOL}"
[[ "${TARGET_VOL}" == /Volumes/* ]] || die "Target must be under /Volumes: ${TARGET_VOL}"
[[ "${SOURCE_VOL}" != "${TARGET_VOL}" ]] || die "Source and target volumes are identical"
[[ -r "${SOURCE_VOL}" ]] || die "Source is not readable: ${SOURCE_VOL}"
[[ -w "${TARGET_VOL}" ]] || die "Target is not writable: ${TARGET_VOL}"

SRC_REAL="$(cd "${SOURCE_VOL}" && pwd)"
DST_REAL="$(cd "${TARGET_VOL}" && pwd)"
[[ "${SRC_REAL}" != "${DST_REAL}" ]] || die "Source and target resolve to the same mount"

TARGET_WRITE_TEST="${TARGET_VOL}/.t9_to_wd_write_test_${RUN_TS}"
touch "${TARGET_WRITE_TEST}" || die "Target is not writable: ${TARGET_VOL}"
rm -f "${TARGET_WRITE_TEST}" || die "Could not clean target write test"

log "SOURCE=${SOURCE_VOL}"
log "TARGET=${TARGET_VOL}"

mdutil -i off "${TARGET_VOL}" >/dev/null 2>&1 || warn "Could not disable Spotlight indexing on target"

TARGET_DATA_ROOT="${TARGET_VOL}/t9_batches_${RUN_TS}"
BATCH_MANIFEST_DIR="${LOCAL_RUN_DIR}/batch_manifests"
mkdir -p "${TARGET_DATA_ROOT}" "${BATCH_MANIFEST_DIR}"

CURRENT_PHASE="inventory"
CURRENT_BATCH=""
CURRENT_FILE=""
PROCESSED_FILES=0
PROCESSED_BYTES=0
FAILED_BATCHES=0
LAST_SUCCESS_TS="$(date +%s)"
REMAINING_BATCHES=0
REMAINING_FILES=0
write_state
heartbeat_loop &
HEARTBEAT_PID=$!

run_python() {
  python3 - "$@"
}

SMALL_STATS_JSON="${LOCAL_RUN_DIR}/small_files_stats.json"
LARGE_STATS_JSON="${LOCAL_RUN_DIR}/large_files_stats.json"
SUMMARY_JSON="${LOCAL_RUN_DIR}/summary.json"

log "Scanning source and building manifests"
run_python "${SOURCE_VOL}" "${BATCH_MANIFEST_DIR}" "${MAX_FILES_PER_BATCH}" "${MAX_BYTES_PER_BATCH}" "${SMALL_FILE_LIMIT_BYTES}" "${SMALL_DELETE_LOG}" "${SMALL_STATS_JSON}" "${LARGE_STATS_JSON}" "${SUMMARY_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

src = Path(sys.argv[1])
batch_dir = Path(sys.argv[2])
max_files = int(sys.argv[3])
max_bytes = int(sys.argv[4])
small_limit = int(sys.argv[5])
small_log = Path(sys.argv[6])
small_stats = Path(sys.argv[7])
large_stats = Path(sys.argv[8])
summary_json = Path(sys.argv[9])

root_dev = os.stat(src).st_dev
batch_dir.mkdir(parents=True, exist_ok=True)

small_count = 0
small_bytes = 0
large_count = 0
large_bytes = 0
batches = []
current_files = []
current_bytes = 0
errors = []

def on_error(err):
    errors.append(str(err))

def flush_batch():
    global current_files, current_bytes
    if not current_files:
        return
    idx = len(batches) + 1
    list_path = batch_dir / f"batch_{idx:06d}.lst"
    meta_path = batch_dir / f"batch_{idx:06d}.json"
    with list_path.open("wb") as fh:
        for relpath in current_files:
            fh.write(relpath.encode("utf-8"))
            fh.write(b"\0")
    meta = {
        "batch_id": f"batch_{idx:06d}",
        "count": len(current_files),
        "bytes": current_bytes,
        "list": str(list_path),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    batches.append(meta)
    current_files = []
    current_bytes = 0

with small_log.open("w", encoding="utf-8") as small_fh:
    for root, dirs, files in os.walk(src, topdown=True, onerror=on_error):
        # stay on the same mounted filesystem
        keep_dirs = []
        for d in dirs:
            full = Path(root) / d
            try:
                if os.stat(full).st_dev == root_dev:
                    keep_dirs.append(d)
            except Exception as exc:
                errors.append(f"dir_stat\t{full}\t{exc}")
        dirs[:] = keep_dirs

        for name in files:
            full = Path(root) / name
            try:
                st = os.stat(full)
            except Exception as exc:
                errors.append(f"file_stat\t{full}\t{exc}")
                continue
            if st.st_dev != root_dev:
                continue
            rel = str(full.relative_to(src))
            if st.st_size < small_limit:
                small_count += 1
                small_bytes += st.st_size
                small_fh.write(rel + "\n")
            else:
                large_count += 1
                large_bytes += st.st_size
                if current_files and (len(current_files) >= max_files or current_bytes + st.st_size > max_bytes):
                    flush_batch()
                current_files.append(rel)
                current_bytes += st.st_size

flush_batch()

small_stats.write_text(json.dumps({"count": small_count, "bytes": small_bytes}, indent=2), encoding="utf-8")
large_stats.write_text(json.dumps({"count": large_count, "bytes": large_bytes}, indent=2), encoding="utf-8")
summary_json.write_text(json.dumps({"batches": batches, "errors": errors}, indent=2), encoding="utf-8")
print(json.dumps({
    "small_count": small_count,
    "small_bytes": small_bytes,
    "large_count": large_count,
    "large_bytes": large_bytes,
    "batch_count": len(batches),
    "error_count": len(errors),
}, indent=2))
PY

SMALL_COUNT="$(python3 - "${SMALL_STATS_JSON}" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())["count"])
PY
)"
SMALL_BYTES="$(python3 - "${SMALL_STATS_JSON}" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())["bytes"])
PY
)"
LARGE_COUNT="$(python3 - "${LARGE_STATS_JSON}" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())["count"])
PY
)"
LARGE_BYTES="$(python3 - "${LARGE_STATS_JSON}" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())["bytes"])
PY
)"
BATCH_COUNT="$(python3 - "${SUMMARY_JSON}" <<'PY'
import json, sys
from pathlib import Path
print(len(json.loads(Path(sys.argv[1]).read_text())["batches"]))
PY
)"

TARGET_AVAIL_BYTES="$(
  df -k "${TARGET_VOL}" | awk 'END { print $4 * 1024 }'
)"

if (( TARGET_AVAIL_BYTES < LARGE_BYTES )); then
  die "Target free space $(human_bytes "${TARGET_AVAIL_BYTES}") is smaller than required $(human_bytes "${LARGE_BYTES}")"
fi

log "Small files (<1 MiB): count=${SMALL_COUNT} bytes=$(human_bytes "${SMALL_BYTES}")"
log "Large files (>=1 MiB): count=${LARGE_COUNT} bytes=$(human_bytes "${LARGE_BYTES}") batches=${BATCH_COUNT}"

CURRENT_PHASE="delete_small_files"
REMAINING_FILES="${LARGE_COUNT}"
REMAINING_BATCHES="${BATCH_COUNT}"
write_state

if (( SMALL_COUNT > 0 )); then
  log "Deleting small files from source"
  python3 - "${SOURCE_VOL}" "${SMALL_DELETE_LOG}" <<'PY'
import sys
from pathlib import Path

src = Path(sys.argv[1])
log_path = Path(sys.argv[2])

deleted = 0
deleted_bytes = 0

for rel in log_path.read_text(encoding="utf-8").splitlines():
    if not rel:
        continue
    full = src / rel
    try:
        if full.is_file():
            deleted += 1
            deleted_bytes += full.stat().st_size
            full.unlink()
    except Exception:
        pass

print(f"{deleted}\t{deleted_bytes}")
PY
else
  log "No small files to delete"
fi

safe_remove_target_path() {
  local path="$1"
  [[ -n "${path}" ]] || die "safe_remove_target_path got empty path"
  [[ "${path}" == "${TARGET_DATA_ROOT}"* ]] || die "Refusing to remove path outside target data root: ${path}"
  rm -rf -- "${path}"
}

copy_file_with_watch() {
  local src_file="$1"
  local dest_file="$2"
  local batch_id="$3"
  local file_num="$4"
  local file_total="$5"
  local src_size last_size last_progress now

  src_size="$(stat -f '%z' "${src_file}")"
  mkdir -p "$(dirname "${dest_file}")" || return 1
  rm -f -- "${dest_file}.part"
  CURRENT_FILE="${src_file}"
  write_state

  ditto "${src_file}" "${dest_file}.part" &
  local copy_pid=$!
  last_size=0
  last_progress="$(date +%s)"
  local next_heartbeat="$last_progress"

  while kill -0 "${copy_pid}" 2>/dev/null; do
    now="$(date +%s)"
    local current_size=0
    if [[ -f "${dest_file}.part" ]]; then
      current_size="$(stat -f '%z' "${dest_file}.part" 2>/dev/null || echo 0)"
    fi
    if (( current_size > last_size )); then
      last_size="${current_size}"
      last_progress="${now}"
    fi
    if (( now >= next_heartbeat )); then
      log "COPY batch=${batch_id} file=${file_num}/${file_total} dest=$(basename "${dest_file}") progress=$(human_bytes "${current_size}")/$(human_bytes "${src_size}")"
      next_heartbeat=$(( now + HEARTBEAT_SECONDS ))
    fi
    if (( now - last_progress >= FILE_HANG_SECONDS )); then
      warn "File copy hang detected for ${src_file}"
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
  write_state
  return 0
}

verify_batch() {
  local manifest="$1"
  local batch_dest="$2"
  python3 - "${SOURCE_VOL}" "${manifest}" "${batch_dest}" <<'PY'
import hashlib
import os
import sys
from pathlib import Path

src_root = Path(sys.argv[1])
manifest = Path(sys.argv[2])
dest_root = Path(sys.argv[3])

rels = []
with manifest.open("rb") as fh:
    data = fh.read().split(b"\0")
for item in data:
    if item:
        rels.append(item.decode("utf-8"))

src_count = 0
dest_count = 0
size_mismatch = []

for rel in rels:
    src = src_root / rel
    dest = dest_root / rel
    if src.exists():
        src_count += 1
    if dest.exists():
        dest_count += 1
    if not dest.exists() or not src.exists():
        size_mismatch.append(rel)
        continue
    if src.stat().st_size != dest.stat().st_size:
        size_mismatch.append(rel)

if size_mismatch:
    print("VERIFY_FAIL size_or_missing")
    for rel in size_mismatch[:20]:
        print(rel)
    raise SystemExit(2)

sample = []
if len(rels) <= 5:
    sample = rels
elif rels:
    sample = [rels[0], rels[len(rels)//2], rels[-1]]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

for rel in sample:
    src = src_root / rel
    dest = dest_root / rel
    if sha256(src) != sha256(dest):
        print("VERIFY_FAIL checksum", rel)
        raise SystemExit(3)

print(f"VERIFY_OK count={len(rels)} sample={len(sample)}")
PY
}

delete_batch_sources() {
  local manifest="$1"
  python3 - "${SOURCE_VOL}" "${manifest}" <<'PY'
import os
import sys
from pathlib import Path

src_root = Path(sys.argv[1])
manifest = Path(sys.argv[2])
dirs = set()
deleted_count = 0
deleted_bytes = 0

rels = []
with manifest.open("rb") as fh:
    data = fh.read().split(b"\0")
for item in data:
    if item:
        rels.append(item.decode("utf-8"))

for rel in rels:
    full = src_root / rel
    try:
        if full.is_file():
            deleted_bytes += full.stat().st_size
            full.unlink()
            deleted_count += 1
            dirs.add(str(full.parent))
    except Exception:
        pass

for d in sorted(dirs, key=len, reverse=True):
    path = Path(d)
    while str(path).startswith(str(src_root)):
      try:
          path.rmdir()
      except Exception:
          break
      if path == src_root:
          break
      path = path.parent

print(f"{deleted_count}\t{deleted_bytes}")
PY
}

CURRENT_PHASE="move_large_files"
write_state

batch_index=0
while [[ -f "${BATCH_MANIFEST_DIR}/batch_$(printf '%06d' $((batch_index + 1))).json" ]]; do
  batch_index=$(( batch_index + 1 ))
  batch_id="batch_$(printf '%06d' "${batch_index}")"
  meta="${BATCH_MANIFEST_DIR}/${batch_id}.json"
  manifest="${BATCH_MANIFEST_DIR}/${batch_id}.lst"
  batch_count="$(python3 - "${meta}" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())["count"])
PY
)"
  batch_bytes="$(python3 - "${meta}" <<'PY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())["bytes"])
PY
)"
  batch_dest="${TARGET_DATA_ROOT}/${batch_id}"
  REMAINING_BATCHES=$(( BATCH_COUNT - batch_index + 1 ))
  CURRENT_BATCH="${batch_id}"
  CURRENT_FILE=""
  write_state

  attempt=0
  batch_ok=0
  while (( attempt <= BATCH_RETRIES )); do
    attempt=$(( attempt + 1 ))
    if [[ -d "${batch_dest}" ]]; then
      safe_remove_target_path "${batch_dest}"
    fi
    mkdir -p "${batch_dest}" || die "Could not create batch destination: ${batch_dest}"
    log "START batch=${batch_id} attempt=${attempt} files=${batch_count} bytes=$(human_bytes "${batch_bytes}")"

    copy_failed=0
    file_idx=0
    while IFS= read -r -d '' relpath; do
      file_idx=$(( file_idx + 1 ))
      src_file="${SOURCE_VOL}/${relpath}"
      dest_file="${batch_dest}/${relpath}"
      if [[ ! -f "${src_file}" ]]; then
        warn "Source missing, skipping file in batch ${batch_id}: ${src_file}"
        copy_failed=1
        break
      fi
      if ! copy_file_with_watch "${src_file}" "${dest_file}" "${batch_id}" "${file_idx}" "${batch_count}"; then
        warn "Copy failed batch=${batch_id} attempt=${attempt} file=${src_file}"
        copy_failed=1
        break
      fi
    done < "${manifest}"

    if (( copy_failed == 0 )); then
      if verify_batch "${manifest}" "${batch_dest}" >> "${LOG_FILE}" 2>&1; then
        read -r deleted_count deleted_bytes < <(delete_batch_sources "${manifest}")
        PROCESSED_FILES=$(( PROCESSED_FILES + deleted_count ))
        PROCESSED_BYTES=$(( PROCESSED_BYTES + deleted_bytes ))
        REMAINING_FILES=$(( REMAINING_FILES - deleted_count ))
        LAST_SUCCESS_TS="$(date +%s)"
        batch_ok=1
        write_state
        log "DONE batch=${batch_id} files=${deleted_count} bytes=$(human_bytes "${deleted_bytes}") processed_total=${PROCESSED_FILES} remaining_files=${REMAINING_FILES}"
        break
      else
        warn "Verification failed for ${batch_id} attempt=${attempt}"
      fi
    fi
  done

  if (( batch_ok == 0 )); then
    FAILED_BATCHES=$(( FAILED_BATCHES + 1 ))
    echo "${batch_id}" >> "${FAILED_BATCHES_LOG}"
    write_state
    warn "FAILED batch=${batch_id} after $(( BATCH_RETRIES + 1 )) attempt(s)"
  fi
done

CURRENT_PHASE="final_verification"
CURRENT_BATCH=""
CURRENT_FILE=""
write_state

FINAL_REMAINDER_REPORT="${LOCAL_RUN_DIR}/remaining_on_t9.txt"
find -x "${SOURCE_VOL}" -type f -print > "${FINAL_REMAINDER_REPORT}" 2>> "${LOG_FILE}"
FINAL_REMAINING_COUNT="$(wc -l < "${FINAL_REMAINDER_REPORT}" | tr -d ' ')"
FINAL_REMAINING_BYTES="$(
  python3 - "${FINAL_REMAINDER_REPORT}" <<'PY'
import os, sys
from pathlib import Path
total = 0
for line in Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore").splitlines():
    try:
        total += os.stat(line).st_size
    except Exception:
        pass
print(total)
PY
)"

log "SUMMARY small_deleted_count=${SMALL_COUNT} small_deleted_bytes=$(human_bytes "${SMALL_BYTES}")"
log "SUMMARY moved_large_count=${PROCESSED_FILES} moved_large_bytes=$(human_bytes "${PROCESSED_BYTES}")"
log "SUMMARY failed_batches=${FAILED_BATCHES}"
log "SUMMARY remaining_files_on_t9=${FINAL_REMAINING_COUNT} remaining_bytes_on_t9=$(human_bytes "${FINAL_REMAINING_BYTES}")"
log "SUMMARY logs=${LOCAL_RUN_DIR}"
log "SUMMARY target_batches=${TARGET_DATA_ROOT}"

if (( FINAL_REMAINING_COUNT == 0 )); then
  log "T9_EMPTY=yes"
else
  warn "T9_EMPTY=no"
  warn "Remaining file list: ${FINAL_REMAINDER_REPORT}"
fi
