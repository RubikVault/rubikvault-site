#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

JOB_ID="${1:-}"
STAMP="${2:-$(timestamp_utc)}"
if [[ -z "$JOB_ID" ]]; then
  echo "usage: bash scripts/nas/run-stage4-shadow.sh <scientific_summary|best_setups_v4|etf_diagnostic|daily_audit_report|cutover_readiness_report> [STAMP]" >&2
  exit 2
fi

COMMAND=""
PATH_MANIFEST=""
OUTPUTS=()
ENV_PREFIX=""
TODAY_UTC="$(node -e "process.stdout.write(new Date().toISOString().slice(0, 10))")"

case "$JOB_ID" in
  scientific_summary)
    COMMAND="node scripts/build-scientific-summary.mjs"
    PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-4.scientific-summary.paths"
    OUTPUTS=("public/data/supermodules/scientific-summary.json")
    ;;
  best_setups_v4)
    COMMAND="node scripts/build-best-setups-v4.mjs"
    PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-4.best-setups-v4.paths"
    OUTPUTS=("public/data/snapshots/best-setups-v4.json")
    ENV_PREFIX="ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1"
    ;;
  etf_diagnostic)
    COMMAND="node scripts/learning/diagnose-best-setups-etf-drop.mjs"
    PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-4.etf-diagnostic.paths"
    OUTPUTS=("public/data/reports/best-setups-etf-diagnostic-latest.json" "mirrors/learning/reports/best-setups-etf-diagnostic-latest.json")
    ;;
  daily_audit_report)
    COMMAND="node scripts/learning/quantlab-v1/daily-audit-report.mjs"
    PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-4.daily-audit-report.paths"
    OUTPUTS=("public/data/reports/quantlab-v1-latest.json" "mirrors/learning/quantlab-v1/reports/${TODAY_UTC}-internal.json")
    ;;
  cutover_readiness_report)
    COMMAND="node scripts/learning/quantlab-v1/cutover-readiness-report.mjs"
    PATH_MANIFEST="$ROOT/scripts/nas/inputs/stage-4.cutover-readiness.paths"
    OUTPUTS=("mirrors/learning/quantlab-v1/reports/cutover-readiness-${TODAY_UTC}.json")
    ;;
  *)
    echo "unknown_job_id=$JOB_ID" >&2
    exit 2
    ;;
esac

STAGE_ID="stage4:${JOB_ID}"
STAGE_DIR="stage4-$JOB_ID"
RUN_DIR="$LOCAL_SHADOW/$STAGE_DIR/$STAMP"
COMPARE_DIR="$RUN_DIR/compare"
FETCH_DIR="$RUN_DIR/fetched"
LOCAL_LOG="$RUN_DIR/stage4-shadow.log"
REMOTE_RUN_DIR="$REMOTE_SHADOW_RUNS/$STAGE_DIR/$STAMP"
REMOTE_REPO="$REMOTE_RUN_DIR/repo"
LOCAL_REFERENCE_REPO="$RUN_DIR/local-repo"
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
  echo "stage=$STAGE_ID"
  echo "job_id=$JOB_ID"
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
sync_copy_local_path "$ROOT/scripts/nas/build-input-manifest.mjs" "$LOCAL_REFERENCE_REPO/scripts/nas" >/dev/null
sync_copy_path "$LOCAL_REFERENCE_REPO/scripts/nas/build-input-manifest.mjs" "$REMOTE_REPO/scripts/nas" >/dev/null

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

node "$ROOT/scripts/nas/build-input-manifest.mjs" --root "$LOCAL_REFERENCE_REPO" --paths-file "$LOCAL_REFERENCE_REPO/$PATH_MANIFEST_REL" --stage "$STAGE_ID" --run-id "$STAMP" --output "$LOCAL_INPUT_MANIFEST" >> "$LOCAL_LOG"

for rel in "${OUTPUTS[@]}"; do
  mkdir -p "$LOCAL_REFERENCE_REPO/$(dirname "$rel")"
  remote_shell "mkdir -p '$REMOTE_REPO/$(dirname "$rel")'"
done

MANIFEST_START_MS="$(now_ms)"
set +e
"${SSH_CMD[@]}" "$NAS_HOST" "set -euo pipefail; . '$NAS_ROOT/tooling/env.sh'; cd '$REMOTE_REPO'; node scripts/nas/build-input-manifest.mjs --root '$REMOTE_REPO' --paths-file '$REMOTE_REPO/$PATH_MANIFEST_REL' --stage '$STAGE_ID' --run-id '$STAMP' --output '$REMOTE_RUN_DIR/input-manifest.nas.json'" > "$RUN_DIR/input-manifest.remote.stdout.log" 2> "$RUN_DIR/input-manifest.remote.stderr.log"
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
  write_run_metrics "$STAGE_ID" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
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
run_local_reference_shell "$LOCAL_REFERENCE_REPO" "$RUN_DIR/local-reference.stdout.log" "$RUN_DIR/local-reference.stderr.log" "${ENV_PREFIX:+$ENV_PREFIX }$COMMAND"
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
  write_run_metrics "$STAGE_ID" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
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
"${SSH_CMD[@]}" "$NAS_HOST" "set -euo pipefail; . '$NAS_ROOT/tooling/env.sh'; cd '$REMOTE_REPO'; ${ENV_PREFIX:+$ENV_PREFIX }$COMMAND" > "$RUN_DIR/remote.stdout.log" 2> "$RUN_DIR/remote.stderr.log"
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

fetch_output() {
  local rel="$1"
  local remote_path="$REMOTE_REPO/$rel"
  local local_parent="$FETCH_DIR/$(dirname "$rel")"
  mkdir -p "$local_parent"
  rsync_from_remote "$remote_path" "$local_parent/" >/dev/null
}

compare_output() {
  local rel="$1"
  local report_name="$2"
  node "$ROOT/scripts/nas/compare-json.mjs" \
    --left "$LOCAL_REFERENCE_REPO/$rel" \
    --right "$FETCH_DIR/$rel" \
    --report "$COMPARE_DIR/$report_name" | tee -a "$LOCAL_LOG"
}

for rel in "${OUTPUTS[@]}"; do
  set +e
  fetch_output "$rel"
  FETCH_STATUS="$?"
  set -e
  if [[ "$FETCH_STATUS" -ne 0 ]]; then
    STATUS="$FETCH_STATUS"
  fi
done

for rel in "${OUTPUTS[@]}"; do
  report_name="$(echo "$rel" | tr '/' '_' | tr '.' '_' ).compare.json"
  set +e
  compare_output "$rel" "$report_name"
  COMPARE_STATUS="${PIPESTATUS[0]}"
  set -e
  if [[ "$COMPARE_STATUS" -ne 0 ]]; then
    STATUS="$COMPARE_STATUS"
  fi
done

bash "$ROOT/scripts/nas/validate-priorities.sh" > "$RUN_DIR/validate-after.txt"
AFTER_CHECKPOINT="$(bash "$ROOT/scripts/nas/capture-checkpoint.sh" "${STAMP}-after")"
TOTAL_END_MS="$(now_ms)"
TOTAL_DURATION_SEC="$(elapsed_sec "$TOTAL_START_MS" "$TOTAL_END_MS")"
write_run_metrics "$STAGE_ID" "$STAMP" "$RUN_DIR" "$STATUS" "$GATE" "$BEFORE_CHECKPOINT" "$AFTER_CHECKPOINT" "$TOTAL_DURATION_SEC" "$LOCAL_REFERENCE_DURATION_SEC" "$NAS_DURATION_SEC" "$MANIFEST_DURATION_SEC" >/dev/null
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
