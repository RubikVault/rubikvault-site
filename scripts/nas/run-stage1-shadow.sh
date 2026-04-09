#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
RUN_DIR="$LOCAL_SHADOW/stage1/$STAMP"
COMPARE_DIR="$RUN_DIR/compare"
FETCH_DIR="$RUN_DIR/fetched"
LOCAL_LOG="$RUN_DIR/stage1-shadow.log"
REMOTE_RUN_DIR="$REMOTE_SHADOW_RUNS/stage1/$STAMP"
REMOTE_REPO="$REMOTE_RUN_DIR/repo"
LOCAL_REFERENCE_REPO="$RUN_DIR/local-repo"
PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-1.paths"
PATH_MANIFEST_REL="${PATH_MANIFEST#$ROOT/}"
LOCAL_INPUT_MANIFEST="$RUN_DIR/input-manifest.mac.json"
LOCAL_REMOTE_INPUT_MANIFEST="$RUN_DIR/input-manifest.nas.json"
LOCK_NAME="nas-shadow-benchmark"
STATUS=0
GATE="completed"
TOTAL_START_MS="$(now_ms)"
LOCAL_REFERENCE_DURATION_SEC=""
NAS_DURATION_SEC=""
MANIFEST_DURATION_SEC=""
LOCAL_REFERENCE_COMMAND="node scripts/ops/build-safety-snapshot.mjs && node scripts/ops/build-mission-control-summary.mjs && node scripts/ops/build-ops-pulse.mjs"

ensure_local_dirs
ensure_remote_dirs
mkdir -p "$RUN_DIR" "$COMPARE_DIR" "$FETCH_DIR" "$LOCAL_REFERENCE_REPO"
: > "$LOCAL_LOG"
acquire_benchmark_lock "$LOCK_NAME"
trap 'release_benchmark_lock "$LOCK_NAME"' EXIT

BEFORE_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-before")"
bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-before.txt"
rsync_to_remote "$RUN_DIR/validate-before.txt" "$REMOTE_JOURNAL" >/dev/null

{
  echo "stage=stage1"
  echo "stamp=$STAMP"
  echo "before_checkpoint=$BEFORE_CHECKPOINT"
  echo "remote_repo=$REMOTE_REPO"
  echo "local_reference_repo=$LOCAL_REFERENCE_REPO"
  echo "paths_manifest=$PATH_MANIFEST_REL"
  echo "--- sync"
} >> "$LOCAL_LOG"

remote_shell "mkdir -p '$REMOTE_REPO'"
sync_copy_local_path "$PATH_MANIFEST" "$LOCAL_REFERENCE_REPO/scripts/nas/inputs" >/dev/null
sync_copy_path "$LOCAL_REFERENCE_REPO/$PATH_MANIFEST_REL" "$REMOTE_REPO/scripts/nas/inputs" >/dev/null

while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  [[ "$rel" == \#* ]] && continue
  src="$ROOT/$rel"
  dst_parent="$REMOTE_REPO/$(dirname "$rel")"
  if [[ ! -e "$src" ]]; then
    echo "skip_missing=$rel" | tee -a "$LOCAL_LOG"
    continue
  fi
  echo "sync=$rel" | tee -a "$LOCAL_LOG"
  sync_copy_local_path "$src" "$LOCAL_REFERENCE_REPO/$(dirname "$rel")" >/dev/null
  sync_copy_path "$LOCAL_REFERENCE_REPO/$rel" "$dst_parent" >/dev/null
done < "$PATH_MANIFEST"

node "$ROOT/scripts/nas/build-input-manifest.mjs" --root "$LOCAL_REFERENCE_REPO" --paths-file "$LOCAL_REFERENCE_REPO/$PATH_MANIFEST_REL" --stage stage1 --run-id "$STAMP" --output "$LOCAL_INPUT_MANIFEST" >> "$LOCAL_LOG"

MANIFEST_START_MS="$(now_ms)"
set +e
"${SSH_CMD[@]}" "$NAS_HOST" "set -euo pipefail; . '$NAS_ROOT/tooling/env.sh'; cd '$REMOTE_REPO'; node scripts/nas/build-input-manifest.mjs --root '$REMOTE_REPO' --paths-file '$REMOTE_REPO/$PATH_MANIFEST_REL' --stage stage1 --run-id '$STAMP' --output '$REMOTE_RUN_DIR/input-manifest.nas.json'" > "$RUN_DIR/input-manifest.remote.stdout.log" 2> "$RUN_DIR/input-manifest.remote.stderr.log"
MANIFEST_STATUS="$?"
set -e
MANIFEST_END_MS="$(now_ms)"
MANIFEST_DURATION_SEC="$(elapsed_sec "$MANIFEST_START_MS" "$MANIFEST_END_MS")"
if [[ "$MANIFEST_STATUS" -ne 0 ]]; then
  STATUS="$MANIFEST_STATUS"
fi
if [[ -s "$RUN_DIR/input-manifest.remote.stdout.log" ]]; then
  {
    echo "--- input_manifest_stdout"
    cat "$RUN_DIR/input-manifest.remote.stdout.log"
  } >> "$LOCAL_LOG"
fi
if [[ -s "$RUN_DIR/input-manifest.remote.stderr.log" ]]; then
  {
    echo "--- input_manifest_stderr"
    cat "$RUN_DIR/input-manifest.remote.stderr.log"
  } >> "$LOCAL_LOG"
fi
rsync_from_remote "$REMOTE_RUN_DIR/input-manifest.nas.json" "$RUN_DIR/" >/dev/null || STATUS="$?"
set +e
node "$ROOT/scripts/nas/compare-json.mjs" \
  --left "$LOCAL_INPUT_MANIFEST" \
  --right "$LOCAL_REMOTE_INPUT_MANIFEST" \
  --report "$COMPARE_DIR/input-manifest.compare.json" >> "$LOCAL_LOG" 2>&1
MANIFEST_COMPARE_STATUS="$?"
set -e
if [[ "$MANIFEST_COMPARE_STATUS" -ne 0 ]]; then
  STATUS="$MANIFEST_COMPARE_STATUS"
fi

if [[ "$STATUS" -ne 0 ]]; then
  GATE="input_manifest_verification_failed"
  bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-after.txt"
  AFTER_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-after")"
  TOTAL_END_MS="$(now_ms)"
  TOTAL_DURATION_SEC="$(elapsed_sec "$TOTAL_START_MS" "$TOTAL_END_MS")"
  write_run_metrics "stage1" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
  refresh_benchmark_reports
  {
    echo "--- validation"
    echo "after_checkpoint=$AFTER_CHECKPOINT"
    echo "status=$STATUS"
    echo "gate=$GATE"
  } >> "$LOCAL_LOG"
  rsync_to_remote "$LOCAL_LOG" "$REMOTE_JOURNAL" >/dev/null
  rsync_to_remote "$RUN_DIR/validate-after.txt" "$REMOTE_JOURNAL" >/dev/null
  rsync_to_remote "$RUN_DIR/metrics.json" "$REMOTE_BENCHMARK_REPORTS" >/dev/null
  echo "$RUN_DIR"
  exit "$STATUS"
fi

{
  echo "--- local_reference_run"
} >> "$LOCAL_LOG"

LOCAL_REFERENCE_START_MS="$(now_ms)"
set +e
run_local_reference_shell "$LOCAL_REFERENCE_REPO" "$RUN_DIR/local-reference.stdout.log" "$RUN_DIR/local-reference.stderr.log" "$LOCAL_REFERENCE_COMMAND"
LOCAL_REFERENCE_STATUS="$?"
set -e
LOCAL_REFERENCE_END_MS="$(now_ms)"
LOCAL_REFERENCE_DURATION_SEC="$(elapsed_sec "$LOCAL_REFERENCE_START_MS" "$LOCAL_REFERENCE_END_MS")"
if [[ "$LOCAL_REFERENCE_STATUS" -ne 0 ]]; then
  STATUS="$LOCAL_REFERENCE_STATUS"
fi
if [[ -s "$RUN_DIR/local-reference.stdout.log" ]]; then
  {
    echo "--- local_reference_stdout"
    cat "$RUN_DIR/local-reference.stdout.log"
  } >> "$LOCAL_LOG"
fi
if [[ -s "$RUN_DIR/local-reference.stderr.log" ]]; then
  {
    echo "--- local_reference_stderr"
    cat "$RUN_DIR/local-reference.stderr.log"
  } >> "$LOCAL_LOG"
fi

if [[ "$STATUS" -ne 0 ]]; then
  GATE="local_reference_failed"
  bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-after.txt"
  AFTER_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-after")"
  TOTAL_END_MS="$(now_ms)"
  TOTAL_DURATION_SEC="$(elapsed_sec "$TOTAL_START_MS" "$TOTAL_END_MS")"
  write_run_metrics "stage1" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
  refresh_benchmark_reports
  {
    echo "--- validation"
    echo "after_checkpoint=$AFTER_CHECKPOINT"
    echo "status=$STATUS"
    echo "gate=$GATE"
  } >> "$LOCAL_LOG"
  rsync_to_remote "$LOCAL_LOG" "$REMOTE_JOURNAL" >/dev/null
  rsync_to_remote "$RUN_DIR/validate-after.txt" "$REMOTE_JOURNAL" >/dev/null
  rsync_to_remote "$RUN_DIR/metrics.json" "$REMOTE_BENCHMARK_REPORTS" >/dev/null
  echo "$RUN_DIR"
  exit "$STATUS"
fi

{
  echo "--- remote_run"
} >> "$LOCAL_LOG"

REMOTE_START_MS="$(now_ms)"
set +e
"${SSH_CMD[@]}" "$NAS_HOST" "set -euo pipefail; . '$NAS_ROOT/tooling/env.sh'; cd '$REMOTE_REPO'; node scripts/ops/build-safety-snapshot.mjs; node scripts/ops/build-mission-control-summary.mjs; node scripts/ops/build-ops-pulse.mjs" > "$RUN_DIR/remote.stdout.log" 2> "$RUN_DIR/remote.stderr.log"
RUN_STATUS="$?"
set -e
REMOTE_END_MS="$(now_ms)"
NAS_DURATION_SEC="$(elapsed_sec "$REMOTE_START_MS" "$REMOTE_END_MS")"
if [[ "$RUN_STATUS" -ne 0 ]]; then
  STATUS="$RUN_STATUS"
fi
cat "$RUN_DIR/remote.stdout.log" >> "$LOCAL_LOG"
if [[ -s "$RUN_DIR/remote.stderr.log" ]]; then
  {
    echo "--- remote_stderr"
    cat "$RUN_DIR/remote.stderr.log"
  } >> "$LOCAL_LOG"
fi

{
  echo "--- fetch_outputs"
} >> "$LOCAL_LOG"

set +e
rsync_from_remote "$REMOTE_REPO/public/data/ops/" "$FETCH_DIR/" >/dev/null
FETCH_STATUS="$?"
set -e
if [[ "$FETCH_STATUS" -ne 0 ]]; then
  STATUS="$FETCH_STATUS"
fi

compare_pair() {
  local label="$1"
  local local_path="$2"
  local shadow_path="$3"
  local report_path="$4"
  if [[ ! -f "$local_path" || ! -f "$shadow_path" ]]; then
    echo "compare_missing=$label" | tee -a "$LOCAL_LOG"
    return 1
  fi
  node "$ROOT/scripts/nas/compare-json.mjs" --left "$local_path" --right "$shadow_path" --report "$report_path"
}

set +e
compare_pair "safety" "$LOCAL_REFERENCE_REPO/public/data/ops/safety.latest.json" "$FETCH_DIR/safety.latest.json" "$COMPARE_DIR/safety.compare.json" | tee -a "$LOCAL_LOG"
COMPARE_SAFETY="${PIPESTATUS[0]}"
compare_pair "summary" "$LOCAL_REFERENCE_REPO/public/data/ops/summary.latest.json" "$FETCH_DIR/summary.latest.json" "$COMPARE_DIR/summary.compare.json" | tee -a "$LOCAL_LOG"
COMPARE_SUMMARY="${PIPESTATUS[0]}"
compare_pair "pulse" "$LOCAL_REFERENCE_REPO/public/data/ops/pulse.json" "$FETCH_DIR/pulse.json" "$COMPARE_DIR/pulse.compare.json" | tee -a "$LOCAL_LOG"
COMPARE_PULSE="${PIPESTATUS[0]}"
set -e

for compare_status in "$COMPARE_SAFETY" "$COMPARE_SUMMARY" "$COMPARE_PULSE"; do
  if [[ "$compare_status" -ne 0 ]]; then
    STATUS="$compare_status"
  fi
done

bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-after.txt"
AFTER_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-after")"
TOTAL_END_MS="$(now_ms)"
TOTAL_DURATION_SEC="$(elapsed_sec "$TOTAL_START_MS" "$TOTAL_END_MS")"
write_run_metrics "stage1" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
refresh_benchmark_reports

{
  echo "--- validation"
  echo "after_checkpoint=$AFTER_CHECKPOINT"
  echo "status=$STATUS"
} >> "$LOCAL_LOG"

rsync_to_remote "$LOCAL_LOG" "$REMOTE_JOURNAL" >/dev/null
rsync_to_remote "$RUN_DIR/validate-after.txt" "$REMOTE_JOURNAL" >/dev/null
rsync_to_remote "$RUN_DIR/metrics.json" "$REMOTE_BENCHMARK_REPORTS" >/dev/null

echo "$RUN_DIR"
exit "$STATUS"
