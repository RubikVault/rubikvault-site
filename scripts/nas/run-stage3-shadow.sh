#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
LOCAL_QUANT_ROOT="${LOCAL_QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
RUN_DIR="$LOCAL_SHADOW/stage3/$STAMP"
COMPARE_DIR="$RUN_DIR/compare"
FETCH_DIR="$RUN_DIR/fetched"
LOCAL_LOG="$RUN_DIR/stage3-shadow.log"
REMOTE_RUN_DIR="$REMOTE_SHADOW_RUNS/stage3/$STAMP"
REMOTE_REPO="$REMOTE_RUN_DIR/repo"
REMOTE_QUANT_ROOT="$REMOTE_RUN_DIR/quant-root"
LOCAL_REFERENCE_REPO="$RUN_DIR/local-repo"
LOCAL_REFERENCE_QUANT_ROOT="$RUN_DIR/local-quant-root"
SOURCE_PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-3.paths"
PATH_MANIFEST="$RUN_DIR/stage-3.paths"
PATH_MANIFEST_REL="scripts/nas/inputs/stage-3.paths"
LOCAL_DELTA_SUCCESS="$LOCAL_QUANT_ROOT/ops/q1_daily_delta_ingest/latest_success.json"
REMOTE_DELTA_PARENT="$REMOTE_QUANT_ROOT/ops/q1_daily_delta_ingest"
LOCAL_INPUT_MANIFEST="$RUN_DIR/input-manifest.mac.json"
LOCAL_REMOTE_INPUT_MANIFEST="$RUN_DIR/input-manifest.nas.json"
LOCAL_QUANT_PATHS="$RUN_DIR/quant-input.paths"
LOCAL_QUANT_MANIFEST="$RUN_DIR/quant-input.mac.json"
LOCAL_REMOTE_QUANT_MANIFEST="$RUN_DIR/quant-input.nas.json"
HIST_PROBS_PROFILE_INDEX_REL="tmp/nas-benchmark/hist-probs-profile-index.json"
HIST_PROBS_PROFILE_INDEX="$ROOT/$HIST_PROBS_PROFILE_INDEX_REL"
LOCK_NAME="nas-shadow-benchmark"
STATUS=0
GATE="completed"
TOTAL_START_MS="$(now_ms)"
LOCAL_REFERENCE_DURATION_SEC=""
NAS_DURATION_SEC=""
MANIFEST_DURATION_SEC=""
LOCAL_REFERENCE_COMMAND="QUANT_ROOT='$LOCAL_REFERENCE_QUANT_ROOT' HIST_PROBS_PROFILE_INDEX='$HIST_PROBS_PROFILE_INDEX_REL' node scripts/ops/build-system-status-report.mjs"

ensure_local_dirs
ensure_remote_dirs
mkdir -p "$RUN_DIR" "$COMPARE_DIR" "$FETCH_DIR" "$LOCAL_REFERENCE_REPO" "$LOCAL_REFERENCE_QUANT_ROOT"
: > "$LOCAL_LOG"
acquire_benchmark_lock "$LOCK_NAME"
trap 'release_benchmark_lock "$LOCK_NAME"' EXIT

if [[ ! -f "$LOCAL_DELTA_SUCCESS" ]]; then
  echo "missing_quant_input=$LOCAL_DELTA_SUCCESS" >&2
  exit 2
fi

BEFORE_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-before")"
bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-before.txt"
rsync_to_remote "$RUN_DIR/validate-before.txt" "$REMOTE_JOURNAL" >/dev/null

remote_shell "mkdir -p '$REMOTE_REPO' '$REMOTE_DELTA_PARENT'"
{
  echo "stage=stage3"
  echo "stamp=$STAMP"
  echo "before_checkpoint=$BEFORE_CHECKPOINT"
  echo "remote_repo=$REMOTE_REPO"
  echo "remote_quant_root=$REMOTE_QUANT_ROOT"
  echo "local_reference_repo=$LOCAL_REFERENCE_REPO"
  echo "local_reference_quant_root=$LOCAL_REFERENCE_QUANT_ROOT"
  echo "paths_manifest=$PATH_MANIFEST_REL"
  echo "--- sync"
} >> "$LOCAL_LOG"

printf '%s\n' 'ops/q1_daily_delta_ingest/latest_success.json' > "$LOCAL_QUANT_PATHS"
rsync_to_remote "$LOCAL_QUANT_PATHS" "$REMOTE_RUN_DIR" >/dev/null

node "$ROOT/scripts/nas/build-hist-probs-profile-index.mjs" \
  --dir "$ROOT/public/data/hist-probs" \
  --output "$HIST_PROBS_PROFILE_INDEX" >> "$LOCAL_LOG"

python3 - "$SOURCE_PATH_MANIFEST" "$PATH_MANIFEST" <<'PY'
import sys

source_path, output_path = sys.argv[1:3]
replacement = [
    "public/data/hist-probs/regime-daily.json",
    "public/data/hist-probs/run-summary.json",
    "tmp/nas-benchmark/hist-probs-profile-index.json",
]
with open(source_path, "r", encoding="utf-8") as fh:
    lines = [line.rstrip("\n") for line in fh]
with open(output_path, "w", encoding="utf-8") as fh:
    for line in lines:
        if line.strip() == "public/data/hist-probs":
            for item in replacement:
                fh.write(item + "\n")
        else:
            fh.write(line + "\n")
PY

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

echo "sync_quant=$LOCAL_DELTA_SUCCESS" | tee -a "$LOCAL_LOG"
sync_copy_local_path "$LOCAL_DELTA_SUCCESS" "$LOCAL_REFERENCE_QUANT_ROOT/ops/q1_daily_delta_ingest" >/dev/null
sync_copy_path "$LOCAL_REFERENCE_QUANT_ROOT/ops/q1_daily_delta_ingest/latest_success.json" "$REMOTE_DELTA_PARENT" >/dev/null

node "$ROOT/scripts/nas/build-input-manifest.mjs" --root "$LOCAL_REFERENCE_REPO" --paths-file "$LOCAL_REFERENCE_REPO/$PATH_MANIFEST_REL" --stage stage3 --run-id "$STAMP" --output "$LOCAL_INPUT_MANIFEST" >> "$LOCAL_LOG"
node "$ROOT/scripts/nas/build-input-manifest.mjs" --root "$LOCAL_REFERENCE_QUANT_ROOT" --paths-file "$LOCAL_QUANT_PATHS" --stage stage3 --run-id "$STAMP" --output "$LOCAL_QUANT_MANIFEST" >> "$LOCAL_LOG"

MANIFEST_START_MS="$(now_ms)"
set +e
"${SSH_CMD[@]}" "$NAS_HOST" "set -euo pipefail; . '$NAS_ROOT/tooling/env.sh'; cd '$REMOTE_REPO'; node scripts/nas/build-input-manifest.mjs --root '$REMOTE_REPO' --paths-file '$REMOTE_REPO/$PATH_MANIFEST_REL' --stage stage3 --run-id '$STAMP' --output '$REMOTE_RUN_DIR/input-manifest.nas.json'; node scripts/nas/build-input-manifest.mjs --root '$REMOTE_QUANT_ROOT' --paths-file '$REMOTE_RUN_DIR/quant-input.paths' --stage stage3 --run-id '$STAMP' --output '$REMOTE_RUN_DIR/quant-input.nas.json'" > "$RUN_DIR/input-manifest.remote.stdout.log" 2> "$RUN_DIR/input-manifest.remote.stderr.log"
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
rsync_from_remote "$REMOTE_RUN_DIR/quant-input.nas.json" "$RUN_DIR/" >/dev/null || STATUS="$?"
set +e
node "$ROOT/scripts/nas/compare-json.mjs" \
  --left "$LOCAL_INPUT_MANIFEST" \
  --right "$LOCAL_REMOTE_INPUT_MANIFEST" \
  --report "$COMPARE_DIR/input-manifest.compare.json" >> "$LOCAL_LOG" 2>&1
MANIFEST_COMPARE_STATUS="$?"
node "$ROOT/scripts/nas/compare-json.mjs" \
  --left "$LOCAL_QUANT_MANIFEST" \
  --right "$LOCAL_REMOTE_QUANT_MANIFEST" \
  --report "$COMPARE_DIR/quant-input.compare.json" >> "$LOCAL_LOG" 2>&1
QUANT_MANIFEST_COMPARE_STATUS="$?"
set -e
for manifest_status in "$MANIFEST_COMPARE_STATUS" "$QUANT_MANIFEST_COMPARE_STATUS"; do
  if [[ "$manifest_status" -ne 0 ]]; then
    STATUS="$manifest_status"
  fi
done

if [[ "$STATUS" -ne 0 ]]; then
  GATE="input_manifest_verification_failed"
  bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-after.txt"
  AFTER_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-after")"
  TOTAL_END_MS="$(now_ms)"
  TOTAL_DURATION_SEC="$(elapsed_sec "$TOTAL_START_MS" "$TOTAL_END_MS")"
  write_run_metrics "stage3" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
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
  write_run_metrics "stage3" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
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
"${SSH_CMD[@]}" "$NAS_HOST" "set -euo pipefail; . '$NAS_ROOT/tooling/env.sh'; cd '$REMOTE_REPO'; QUANT_ROOT='$REMOTE_QUANT_ROOT' HIST_PROBS_PROFILE_INDEX='$HIST_PROBS_PROFILE_INDEX_REL' node scripts/ops/build-system-status-report.mjs" > "$RUN_DIR/remote.stdout.log" 2> "$RUN_DIR/remote.stderr.log"
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
rsync_from_remote "$REMOTE_REPO/public/data/reports/system-status-latest.json" "$FETCH_DIR/" >/dev/null
FETCH_STATUS="$?"
set -e
if [[ "$FETCH_STATUS" -ne 0 ]]; then
  STATUS="$FETCH_STATUS"
fi

set +e
node "$ROOT/scripts/nas/compare-json.mjs" \
  --left "$LOCAL_REFERENCE_REPO/public/data/reports/system-status-latest.json" \
  --right "$FETCH_DIR/system-status-latest.json" \
  --report "$COMPARE_DIR/system-status.compare.json" | tee -a "$LOCAL_LOG"
COMPARE_STATUS="${PIPESTATUS[0]}"
set -e
if [[ "$COMPARE_STATUS" -ne 0 ]]; then
  STATUS="$COMPARE_STATUS"
fi

bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-after.txt"
AFTER_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-after")"
TOTAL_END_MS="$(now_ms)"
TOTAL_DURATION_SEC="$(elapsed_sec "$TOTAL_START_MS" "$TOTAL_END_MS")"
write_run_metrics "stage3" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
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
