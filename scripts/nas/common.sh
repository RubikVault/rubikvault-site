#!/usr/bin/env bash

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAS_HOST="${NAS_HOST:-neoboy@192.168.188.21}"
NAS_ROOT="${NAS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_nas}"
SSH_PORT="${SSH_PORT:-2222}"
SSH_CMD=(
  ssh
  -n
  -i "$SSH_KEY"
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o PreferredAuthentications=publickey
  -o LogLevel=ERROR
  -o ConnectTimeout=15
  -o ConnectionAttempts=2
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
)
RSYNC_BIN="${RSYNC_BIN:-/opt/homebrew/bin/rsync}"
RSYNC_SHELL="ssh -i $SSH_KEY -p $SSH_PORT -o BatchMode=yes -o IdentitiesOnly=yes -o PreferredAuthentications=publickey -o LogLevel=ERROR -o ConnectTimeout=15 -o ConnectionAttempts=2 -o ServerAliveInterval=15 -o ServerAliveCountMax=3"

REMOTE_RUNTIME="$NAS_ROOT/runtime"
REMOTE_LOGS="$REMOTE_RUNTIME/logs"
REMOTE_CHECKPOINTS="$REMOTE_RUNTIME/checkpoints"
REMOTE_JOURNAL="$REMOTE_RUNTIME/journal"
REMOTE_LOCKS="$REMOTE_RUNTIME/locks"
REMOTE_REPORTS="$REMOTE_RUNTIME/reports"
REMOTE_BENCHMARK_REPORTS="$REMOTE_REPORTS/benchmarks"
REMOTE_SYSTEM_AUDIT="$REMOTE_REPORTS/system-partition"
REMOTE_TESTS="$REMOTE_RUNTIME/tests"
REMOTE_STAGING="$NAS_ROOT/staging"
REMOTE_SHADOW_RUNS="$REMOTE_STAGING/shadow-runs"
REMOTE_ARCHIVES="$NAS_ROOT/archives"
REMOTE_ARCHIVE_SHADOW="$REMOTE_ARCHIVES/shadow-runs"
REMOTE_DATASETS="$NAS_ROOT/datasets"

LOCAL_TMP="$ROOT/tmp"
LOCAL_NAS_LOGS="$LOCAL_TMP/nas-offload-logs"
LOCAL_CHECKPOINTS="$LOCAL_TMP/nas-checkpoints"
LOCAL_SHADOW="$LOCAL_TMP/nas-shadow-runs"
LOCAL_JOURNAL="$LOCAL_TMP/nas-migration-journal"
LOCAL_LOCKS="$LOCAL_TMP/nas-locks"
LOCAL_BENCHMARKS="$LOCAL_TMP/nas-benchmarks"
LOCAL_SYSTEM_AUDIT="$LOCAL_TMP/nas-system-audit"
LOCAL_DATASET_MIRRORS="$LOCAL_TMP/nas-dataset-mirrors"
LOCAL_RETENTION="$LOCAL_TMP/nas-retention"

timestamp_utc() {
  date -u +%Y%m%dT%H%M%SZ
}

now_ms() {
  python3 -c 'import time; print(time.time_ns() // 1_000_000)'
}

elapsed_sec() {
  local start_ms="$1"
  local end_ms="$2"
  awk -v start="$start_ms" -v end="$end_ms" 'BEGIN { printf "%.3f", (end - start) / 1000 }'
}

ensure_ssh_key_loaded() {
  if command -v ssh-add >/dev/null 2>&1; then
    ssh-add --apple-use-keychain "$SSH_KEY" >/dev/null 2>&1 || true
  fi
}

ensure_local_dirs() {
  mkdir -p "$LOCAL_TMP" "$LOCAL_NAS_LOGS" "$LOCAL_CHECKPOINTS" "$LOCAL_SHADOW" "$LOCAL_JOURNAL" "$LOCAL_LOCKS" "$LOCAL_BENCHMARKS" "$LOCAL_SYSTEM_AUDIT" "$LOCAL_DATASET_MIRRORS" "$LOCAL_RETENTION"
  ensure_ssh_key_loaded
}

ensure_remote_dirs() {
  "${SSH_CMD[@]}" "$NAS_HOST" "mkdir -p '$REMOTE_LOGS' '$REMOTE_CHECKPOINTS' '$REMOTE_JOURNAL' '$REMOTE_LOCKS' '$REMOTE_REPORTS' '$REMOTE_BENCHMARK_REPORTS' '$REMOTE_SYSTEM_AUDIT' '$REMOTE_TESTS' '$REMOTE_SHADOW_RUNS' '$REMOTE_ARCHIVE_SHADOW' '$REMOTE_DATASETS'"
}

remote_shell() {
  "${SSH_CMD[@]}" "$NAS_HOST" "$@"
}

nas_ssh_preflight() {
  ensure_local_dirs
  nc -z 192.168.188.21 "$SSH_PORT" >/dev/null 2>&1 || return 1
  "${SSH_CMD[@]}" "$NAS_HOST" "printf ok" >/dev/null 2>&1
}

rsync_to_remote() {
  local src="$1"
  local dst="$2"
  "$RSYNC_BIN" -a --protect-args --rsync-path=/usr/bin/rsync -e "$RSYNC_SHELL" "$src" "$NAS_HOST:$dst" </dev/null
}

rsync_to_remote_checksum() {
  local src="$1"
  local dst="$2"
  "$RSYNC_BIN" -a --checksum --protect-args --rsync-path=/usr/bin/rsync -e "$RSYNC_SHELL" "$src" "$NAS_HOST:$dst" </dev/null
}

rsync_from_remote() {
  local src="$1"
  local dst="$2"
  "$RSYNC_BIN" -a --protect-args --rsync-path=/usr/bin/rsync -e "$RSYNC_SHELL" "$NAS_HOST:$src" "$dst" </dev/null
}

sync_copy_path() {
  local src="$1"
  local dst_parent="$2"
  if [[ ! -e "$src" ]]; then
    return 2
  fi
  remote_shell "mkdir -p '$dst_parent'"
  rsync_to_remote "$src" "$dst_parent/"
}

sync_copy_local_path() {
  local src="$1"
  local dst_parent="$2"
  if [[ ! -e "$src" ]]; then
    return 2
  fi
  mkdir -p "$dst_parent"
  "$RSYNC_BIN" -a --protect-args "$src" "$dst_parent/"
}

run_local_reference_shell() {
  local workdir="$1"
  local stdout_path="$2"
  local stderr_path="$3"
  shift 3
  local command="$*"
  (
    cd "$workdir"
    /usr/bin/time -l sh -c "$command"
  ) > "$stdout_path" 2> "$stderr_path"
}

acquire_benchmark_lock() {
  local name="${1:-nas-shadow-benchmark}"
  local local_lock="$LOCAL_LOCKS/$name.lock"
  local remote_lock="$REMOTE_LOCKS/$name.lock"

  ensure_local_dirs
  ensure_remote_dirs

  if ! mkdir "$local_lock" 2>/dev/null; then
    echo "lock_busy_local=$local_lock" >&2
    return 90
  fi
  printf '%s\n' "$$" > "$local_lock/pid"

  if ! remote_shell "mkdir '$remote_lock' 2>/dev/null"; then
    rm -rf "$local_lock"
    echo "lock_busy_remote=$remote_lock" >&2
    return 91
  fi
  remote_shell "printf '%s\n' '$$' > '$remote_lock/pid'"
}

release_benchmark_lock() {
  local name="${1:-nas-shadow-benchmark}"
  local local_lock="$LOCAL_LOCKS/$name.lock"
  local remote_lock="$REMOTE_LOCKS/$name.lock"

  rm -rf "$local_lock"
  remote_shell "rm -rf '$remote_lock'" >/dev/null 2>&1 || true
}

write_run_metrics() {
  local stage="$1"
  local stamp="$2"
  local run_dir="$3"
  local status="$4"
  local gate="$5"
  local before_checkpoint="$6"
  local after_checkpoint="$7"
  local total_duration_sec="$8"
  local local_reference_duration_sec="${9:-}"
  local nas_duration_sec="${10:-}"
  local manifest_duration_sec="${11:-}"
  node "$ROOT/scripts/nas/build-run-metrics.mjs" \
    --stage "$stage" \
    --stamp "$stamp" \
    --run-dir "$run_dir" \
    --status "$status" \
    --gate "$gate" \
    --before-checkpoint "$before_checkpoint" \
    --after-checkpoint "$after_checkpoint" \
    --total-duration-sec "$total_duration_sec" \
    --local-reference-duration-sec "${local_reference_duration_sec:-null}" \
    --nas-duration-sec "${nas_duration_sec:-null}" \
    --manifest-duration-sec "${manifest_duration_sec:-null}"
}

refresh_benchmark_reports() {
  ensure_local_dirs
  ensure_remote_dirs
  (
    cd "$ROOT"
    npm run nas:benchmark:build >/dev/null
  )
  rsync_to_remote "$LOCAL_BENCHMARKS/" "$REMOTE_BENCHMARK_REPORTS" >/dev/null
}
