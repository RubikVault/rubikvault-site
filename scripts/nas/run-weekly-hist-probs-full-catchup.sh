#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

nas_ensure_runtime_roots

RUN_STAMP="${RUN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_ROOT="${NAS_PIPELINE_ARTIFACTS_ROOT:-$NAS_OPS_ROOT/pipeline-artifacts}/hist-probs-weekly-full/$RUN_STAMP"
MEASURE_JSON="$RUN_ROOT/measure.json"
RESULT_JSON="$RUN_ROOT/result.json"
STDOUT_LOG="$RUN_ROOT/stdout.log"
STDERR_LOG="$RUN_ROOT/stderr.log"
LOCK_NAME="${RV_HIST_PROBS_WEEKLY_LOCK_NAME:-hist-probs-weekly-full}"
NIGHT_WINDOW_TZ="${RV_HIST_PROBS_WEEKLY_WINDOW_TZ:-Europe/Berlin}"
NIGHT_WINDOW_START="${RV_HIST_PROBS_WEEKLY_FORBID_START_HOUR:-2}"
NIGHT_WINDOW_END="${RV_HIST_PROBS_WEEKLY_FORBID_END_HOUR:-9}"

mkdir -p "$RUN_ROOT"

hour="$(TZ="$NIGHT_WINDOW_TZ" date +%H)"
if [[ "${RV_HIST_PROBS_WEEKLY_ALLOW_NIGHT_WINDOW:-0}" != "1" ]]; then
  if (( 10#$hour >= NIGHT_WINDOW_START && 10#$hour < NIGHT_WINDOW_END )); then
    printf '{"schema":"rv.hist_probs_weekly_full_result.v1","status":"blocked","reason":"nightly_window","hour":%s,"timezone":"%s"}\n' "$((10#$hour))" "$NIGHT_WINDOW_TZ" > "$RESULT_JSON"
    echo "hist_probs_weekly_blocked=nightly_window hour=$hour tz=$NIGHT_WINDOW_TZ" >&2
    exit 20
  fi
fi

if nas_lock_is_active "night-pipeline"; then
  printf '{"schema":"rv.hist_probs_weekly_full_result.v1","status":"blocked","reason":"night_pipeline_active"}\n' > "$RESULT_JSON"
  echo "hist_probs_weekly_blocked=night_pipeline_active" >&2
  exit 21
fi

trap 'nas_release_global_lock "$LOCK_NAME"' EXIT
nas_acquire_global_lock "$LOCK_NAME"

prefix=""
if command -v nice >/dev/null 2>&1; then
  prefix="nice -n ${RV_HIST_PROBS_WEEKLY_NICE:-10} $prefix"
fi
if command -v ionice >/dev/null 2>&1; then
  prefix="ionice -c2 -n7 $prefix"
fi

cmd="${prefix}bash -lc 'HIST_PROBS_WORKERS=\"${RV_HIST_PROBS_WEEKLY_WORKERS:-2}\" HIST_PROBS_WORKER_BATCH_SIZE=\"${RV_HIST_PROBS_WEEKLY_BATCH_SIZE:-25}\" HIST_PROBS_SKIP_EXISTING=\"1\" HIST_PROBS_WRITE_MODE=\"bucket_only\" HIST_PROBS_TIER=\"all\" HIST_PROBS_MAX_TICKERS=\"0\" HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS=\"${RV_HIST_PROBS_WEEKLY_FRESHNESS_BUDGET_TRADING_DAYS:-2}\" HIST_PROBS_RSS_BUDGET_MB=\"${RV_HIST_PROBS_WEEKLY_RSS_BUDGET_MB:-3072}\" HIST_PROBS_RESPECT_CHECKPOINT_VERSION=\"1\" HIST_PROBS_FAIL_ON_SOFT_ERRORS=\"0\" HIST_PROBS_MIN_COVERAGE_RATIO=\"${RV_HIST_PROBS_WEEKLY_MIN_COVERAGE_RATIO:-0.95}\" HIST_PROBS_DEFER_IF_REMAINING_OVER=\"0\" HIST_PROBS_ALLOW_DEFER_SUCCESS=\"1\" node scripts/ops/nas-hist-probs-worker-guard.mjs --mode all -- node run-hist-probs-turbo.mjs --asset-classes \"${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}\" && node scripts/ops/build-hist-probs-status-summary.mjs && node scripts/ops/build-hist-probs-public-projection.mjs && node scripts/ops/triage-hist-probs-errors.mjs && node scripts/hist-probs/classify-hist-errors.mjs && node scripts/hist-probs/audit-current-state.mjs'"

set +e
python3 "$REPO_ROOT/scripts/nas/measure-command.py" \
  --cwd "$REPO_ROOT" \
  --stdout "$STDOUT_LOG" \
  --stderr "$STDERR_LOG" \
  --json "$MEASURE_JSON" \
  --resources-ndjson "$RUN_ROOT/resources.ndjson" \
  --sample-interval-sec "${RV_HIST_PROBS_WEEKLY_SAMPLE_INTERVAL_SEC:-30}" \
  --timeout-sec "${RV_HIST_PROBS_WEEKLY_TIMEOUT_SEC:-86400}" \
  --set-env "REPO_ROOT=$REPO_ROOT" \
  --set-env "OPS_ROOT=$NAS_OPS_ROOT" \
  --set-env "QUANT_ROOT=$NAS_QUANT_ROOT" \
  --set-env "NODE_OPTIONS=--max-old-space-size=${RV_HIST_PROBS_WEEKLY_HEAP_MB:-4096}" \
  --command "$cmd"
status="$?"
set -e

python3 - "$RESULT_JSON" "$MEASURE_JSON" "$RUN_STAMP" "$status" <<'PY'
import json
import os
import sys
from datetime import datetime

result_path, measure_path, stamp, status_raw = sys.argv[1:5]
try:
    measure = json.load(open(measure_path, "r", encoding="utf-8"))
except Exception:
    measure = {}
status = int(status_raw)
payload = {
    "schema": "rv.hist_probs_weekly_full_result.v1",
    "run_stamp": stamp,
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "status": "success" if status == 0 else "failed",
    "exit_code": status,
    "duration_sec": measure.get("duration_sec"),
    "peak_rss_mb": measure.get("peak_rss_mb"),
    "avg_rss_mb": measure.get("avg_rss_mb"),
    "timed_out": measure.get("timed_out"),
}
os.makedirs(os.path.dirname(result_path), exist_ok=True)
with open(result_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY

echo "hist_probs_weekly_result=$RESULT_JSON exit_code=$status"
exit "$status"
