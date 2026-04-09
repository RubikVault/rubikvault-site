#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
KEEP_LOCAL_RUNS_PER_STAGE="${KEEP_LOCAL_RUNS_PER_STAGE:-5}"
RUN_DIR="$LOCAL_RETENTION/$STAMP"
REPORT_TXT="$RUN_DIR/retention-report.txt"
TRIM_LOCAL_AFTER_ARCHIVE="${TRIM_LOCAL_AFTER_ARCHIVE:-0}"

ensure_local_dirs
ensure_remote_dirs
mkdir -p "$RUN_DIR"

{
  echo "stamp=$STAMP"
  echo "keep_local_runs_per_stage=$KEEP_LOCAL_RUNS_PER_STAGE"
  echo "delete_policy=forbidden"
  echo "trim_local_after_archive=$TRIM_LOCAL_AFTER_ARCHIVE"
} > "$REPORT_TXT"

for stage_dir in "$LOCAL_SHADOW"/*; do
  [[ -d "$stage_dir" ]] || continue
  stage="$(basename "$stage_dir")"
  stamps=()
  while IFS= read -r stamp_dir; do
    [[ -n "$stamp_dir" ]] || continue
    stamps+=("$stamp_dir")
  done < <(find "$stage_dir" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -r)
  keep=0
  for stamp_dir in "${stamps[@]}"; do
    keep=$((keep + 1))
    if [[ "$keep" -le "$KEEP_LOCAL_RUNS_PER_STAGE" ]]; then
      echo "keep_local=$stage/$stamp_dir" >> "$REPORT_TXT"
      continue
    fi
    if [[ -f "$LOCAL_SHADOW/$stage/$stamp_dir/archived-to-nas.json" ]]; then
      echo "already_archived=$stage/$stamp_dir" >> "$REPORT_TXT"
      continue
    fi
    echo "archive_only=$stage/$stamp_dir" >> "$REPORT_TXT"
    remote_shell "mkdir -p '$REMOTE_ARCHIVE_SHADOW/$stage'"
    rsync_to_remote "$LOCAL_SHADOW/$stage/$stamp_dir/" "$REMOTE_ARCHIVE_SHADOW/$stage/$stamp_dir" >/dev/null
    if [[ "$TRIM_LOCAL_AFTER_ARCHIVE" == "1" ]]; then
      tmp_preserve="$RUN_DIR/${stage}-${stamp_dir}"
      mkdir -p "$tmp_preserve"
      if [[ -f "$LOCAL_SHADOW/$stage/$stamp_dir/metrics.json" ]]; then
        cp "$LOCAL_SHADOW/$stage/$stamp_dir/metrics.json" "$tmp_preserve/metrics.json"
      fi
      rm -rf "$LOCAL_SHADOW/$stage/$stamp_dir"
      mkdir -p "$LOCAL_SHADOW/$stage/$stamp_dir"
      if [[ -f "$tmp_preserve/metrics.json" ]]; then
        cp "$tmp_preserve/metrics.json" "$LOCAL_SHADOW/$stage/$stamp_dir/metrics.json"
      fi
      node --input-type=module - "$LOCAL_SHADOW/$stage/$stamp_dir/archived-to-nas.json" "$REMOTE_ARCHIVE_SHADOW/$stage/$stamp_dir" "$STAMP" <<'NODE'
import fs from 'node:fs/promises';
const [filePath, remotePath, stamp] = process.argv.slice(2);
const payload = {
  schema_version: 'nas.shadow.local.archive.pointer.v1',
  archived_at: new Date().toISOString(),
  archive_run_stamp: stamp,
  remote_archive_path: remotePath,
  local_trimmed: true,
};
await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
NODE
      rm -rf "$tmp_preserve"
      echo "trimmed_local=$stage/$stamp_dir" >> "$REPORT_TXT"
    fi
  done
done

rsync_to_remote "$REPORT_TXT" "$REMOTE_REPORTS/benchmarks" >/dev/null
echo "$REPORT_TXT"
