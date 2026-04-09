#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REMOTE_BASE="$NAS_ROOT/offload/mac-artifacts"
REMOTE_RUN_DIR="$REMOTE_BASE/$STAMP"
REMOTE_CURRENT="$REMOTE_BASE/current"
LOG_DIR="$LOCAL_NAS_LOGS"
LOG_FILE="$LOG_DIR/offload-$STAMP.log"

ensure_local_dirs

DEFAULT_PATHS=(
  "tmp/v7-build"
  "tmp/registry-backups"
  "tmp/v5"
  "mirrors/ops/logs"
  "Report"
  "audit-evidence"
)

if [[ "$#" -gt 0 ]]; then
  PATHS=("$@")
else
  PATHS=("${DEFAULT_PATHS[@]}")
fi

ensure_remote_dirs
"${SSH_CMD[@]}" "$NAS_HOST" "mkdir -p '$REMOTE_RUN_DIR' '$REMOTE_CURRENT'"

{
  echo "timestamp=$STAMP"
  echo "nas_host=$NAS_HOST"
  echo "nas_root=$NAS_ROOT"
  echo "remote_run_dir=$REMOTE_RUN_DIR"
  echo "remote_current=$REMOTE_CURRENT"
  echo "---"
} > "$LOG_FILE"

for rel in "${PATHS[@]}"; do
  src="$ROOT/$rel"
  if [[ ! -e "$src" ]]; then
    echo "skip_missing=$rel" | tee -a "$LOG_FILE"
    continue
  fi
  echo "sync_start=$rel" | tee -a "$LOG_FILE"
  parent="$(dirname "$rel")"
  "${SSH_CMD[@]}" "$NAS_HOST" "mkdir -p '$REMOTE_RUN_DIR/$parent' '$REMOTE_CURRENT/$parent'"
  /opt/homebrew/bin/rsync -a --protect-args --rsync-path=/usr/bin/rsync -e "$RSYNC_SHELL" "$src" "$NAS_HOST:$REMOTE_RUN_DIR/$parent/" | tee -a "$LOG_FILE"
  /opt/homebrew/bin/rsync -a --protect-args --rsync-path=/usr/bin/rsync -e "$RSYNC_SHELL" "$src" "$NAS_HOST:$REMOTE_CURRENT/$parent/" | tee -a "$LOG_FILE"
  echo "sync_done=$rel" | tee -a "$LOG_FILE"
done

echo "---" >> "$LOG_FILE"
echo "remote_sizes:" >> "$LOG_FILE"
"${SSH_CMD[@]}" "$NAS_HOST" "du -sh '$REMOTE_RUN_DIR'/* 2>/dev/null || true" >> "$LOG_FILE"
rsync_to_remote "$LOG_FILE" "$REMOTE_LOGS" >/dev/null

echo "$LOG_FILE"
