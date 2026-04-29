#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

ACTIVE_LANE="${RV_PIPELINE_LANE:-data-plane}"
GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"
MARKET_REFRESH_CONCURRENCY="${RV_MARKET_REFRESH_CONCURRENCY:-12}"
MARKET_REFRESH_PROGRESS_EVERY="${RV_MARKET_REFRESH_PROGRESS_EVERY:-500}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
START_STEP="${RV_PIPELINE_START_STEP:-}"
for arg in "$@"; do
  case "$arg" in
    --lane=*)
      ACTIVE_LANE="${arg#*=}"
      ;;
    --branch=*)
      TARGET_BRANCH="${arg#*=}"
      ;;
    --start-step=*)
      START_STEP="${arg#*=}"
      ;;
  esac
done

case "$ACTIVE_LANE" in
  data-plane|release-full) ;;
  *)
    echo "invalid_lane=$ACTIVE_LANE" >&2
    exit 2
    ;;
esac

nas_ensure_runtime_roots

CAMPAIGN_STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
PIPELINE_ROOT="$NAS_NIGHT_PIPELINE_ROOT"
CAMPAIGN_DIR="$PIPELINE_ROOT/runs/$CAMPAIGN_STAMP"
LOG_DIR="$CAMPAIGN_DIR/logs"
STATUS_JSON="$CAMPAIGN_DIR/status.json"
LATEST_JSON="$PIPELINE_ROOT/latest.json"
HEARTBEAT_JSON="$REPO_ROOT/mirrors/ops/pipeline-master/supervisor-heartbeat.json"
MEASURE_SCRIPT="$REPO_ROOT/scripts/nas/measure-command.py"
HIST_PROBS_STATE_JSON="$PIPELINE_ROOT/state/hist-probs-profile.json"
TARGET_MARKET_DATE="${TARGET_MARKET_DATE:-$(python3 - <<'PY'
import os
import subprocess
from datetime import datetime, timedelta

env = dict(os.environ)
env["TZ"] = "America/New_York"
raw = subprocess.check_output(["date", "+%Y-%m-%d %H"], env=env, text=True).strip()
ny = datetime.strptime(raw, "%Y-%m-%d %H")
candidate = ny.date()
if ny.weekday() >= 5 or ny.hour < 18:
    candidate -= timedelta(days=1)
while candidate.weekday() >= 5:
    candidate -= timedelta(days=1)
print(candidate.isoformat())
PY
)}"

mkdir -p "$CAMPAIGN_DIR" "$LOG_DIR" "$(dirname "$HIST_PROBS_STATE_JSON")"

write_status() {
  local status="$1"
  local note="${2:-}"
  local current_step="${3:-}"
  python3 - "$STATUS_JSON" "$LATEST_JSON" "$HEARTBEAT_JSON" "$CAMPAIGN_STAMP" "$ACTIVE_LANE" "$TARGET_MARKET_DATE" "$status" "$note" "$current_step" "$$" <<'PY'
import json
import os
import sys
from datetime import datetime

status_path, latest_path, heartbeat_path, stamp, lane, target_market_date, status, note, current_step, pid = sys.argv[1:11]
now = datetime.utcnow().isoformat() + "Z"
existing = {}
if os.path.exists(status_path):
    try:
        with open(status_path, "r", encoding="utf-8") as fh:
            existing = json.load(fh)
    except Exception:
        existing = {}
doc = {
    "schema_version": "nas.night.pipeline.status.v1",
    "campaign_stamp": stamp,
    "evaluation_lane": lane,
    "target_market_date": target_market_date,
    "started_at": existing.get("started_at") or now,
    "updated_at": now,
    "last_status": status,
    "note": note or None,
    "current_step": current_step or None,
    "current_pid": int(pid),
    "completed_steps": existing.get("completed_steps", []),
    "failed_step": existing.get("failed_step"),
  }
if status == "completed":
    doc["finished_at"] = now
if existing.get("failed_step"):
    doc["failed_step"] = existing["failed_step"]
if status == "failed" and current_step:
    doc["failed_step"] = current_step
os.makedirs(os.path.dirname(status_path), exist_ok=True)
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
os.makedirs(os.path.dirname(latest_path), exist_ok=True)
with open(latest_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
heartbeat = {
    "schema": "rv.supervisor_heartbeat.v1",
    "source": "rv-nas-night-supervisor",
    "run_id": f"{lane}-{stamp}",
    "campaign_stamp": stamp,
    "lane": lane,
    "target_market_date": target_market_date,
    "active_step": current_step or None,
    "last_seen": now,
    "pid": int(pid),
    "status": status,
    "note": note or None,
}
os.makedirs(os.path.dirname(heartbeat_path), exist_ok=True)
with open(heartbeat_path, "w", encoding="utf-8") as fh:
    json.dump(heartbeat, fh, indent=2)
    fh.write("\n")
PY
}

append_completed_step() {
  local step_id="$1"
  python3 - "$STATUS_JSON" "$LATEST_JSON" "$step_id" <<'PY'
import json
import os
import sys

status_path, latest_path, step_id = sys.argv[1:4]
for path in (status_path, latest_path):
    if not os.path.exists(path):
        continue
    doc = json.load(open(path, "r", encoding="utf-8"))
    completed = list(doc.get("completed_steps") or [])
    if step_id not in completed:
        completed.append(step_id)
    doc["completed_steps"] = completed
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
PY
}

quarantine_dev_runtime_once() {
  local marker="$NAS_RUNTIME_ROOT/.dev-runtime-quarantine-complete"
  if [[ -f "$marker" ]]; then
    return 0
  fi
  if [[ -d "$NAS_DEV_ROOT/runtime" ]]; then
    local has_content
    has_content="$(find "$NAS_DEV_ROOT/runtime" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)"
    if [[ -n "$has_content" ]]; then
      local quarantine_dir="$NAS_RUNTIME_ROOT/_quarantine/dev-runtime-$CAMPAIGN_STAMP"
      mkdir -p "$(dirname "$quarantine_dir")"
      mv "$NAS_DEV_ROOT/runtime" "$quarantine_dir"
      mkdir -p "$NAS_DEV_ROOT/runtime"
    fi
  fi
  printf '%s\n' "$(nas_now_utc)" > "$marker"
}

assert_no_competing_lanes() {
  nas_assert_global_lock_clear "open-probe"
  nas_assert_global_lock_clear "native-matrix"
  nas_assert_global_lock_clear "q1-writer"
}

step_resource_class() {
  case "$1" in
    hist_probs|snapshot|learning_daily)
      printf '%s\n' "heavy"
      ;;
    build_global_scope|forecast_daily|build_fundamentals|quantlab_daily_report|scientific_summary|v1_audit|cutover_readiness|etf_diagnostic)
      printf '%s\n' "medium"
      ;;
    *)
      printf '%s\n' "light"
      ;;
  esac
}

step_timeout_sec() {
  case "$1" in
    safe_code_sync) printf '%s\n' 600 ;;
    build_global_scope) printf '%s\n' 1800 ;;
    market_data_refresh) printf '%s\n' "${RV_MARKET_REFRESH_TIMEOUT_SEC:-28800}" ;;
    q1_delta_ingest) printf '%s\n' "${RV_Q1_DELTA_INGEST_TIMEOUT_SEC:-21600}" ;;
    build_fundamentals) printf '%s\n' 3600 ;;
    quantlab_daily_report) printf '%s\n' 1800 ;;
    scientific_summary) printf '%s\n' 1800 ;;
    forecast_daily) printf '%s\n' "${RV_FORECAST_DAILY_TIMEOUT_SEC:-21600}" ;;
    hist_probs) printf '%s\n' "${RV_HIST_PROBS_TIMEOUT_SEC:-7200}" ;;
    snapshot) printf '%s\n' 5400 ;;
    etf_diagnostic) printf '%s\n' 1800 ;;
    learning_daily) printf '%s\n' 5400 ;;
    v1_audit) printf '%s\n' 1800 ;;
    cutover_readiness) printf '%s\n' 1800 ;;
    stage1_ops_pack) printf '%s\n' 1800 ;;
    system_status_report|data_freshness_report|pipeline_epoch|generate_meta_dashboard_data) printf '%s\n' 1800 ;;
    runtime_preflight) printf '%s\n' 1800 ;;
    stock_analyzer_universe_audit) printf '%s\n' 5400 ;;
    ui_field_truth_report) printf '%s\n' 2400 ;;
    final_integrity_seal) printf '%s\n' 1800 ;;
    build_deploy_bundle) printf '%s\n' 1800 ;;
    wrangler_deploy) printf '%s\n' 3600 ;;
    *) printf '%s\n' 1800 ;;
  esac
}

hist_probs_heap_mb() {
  python3 - "$HIST_PROBS_STATE_JSON" <<'PY'
import json
import os
import sys
path = sys.argv[1]
env_override = os.environ.get("RV_HIST_PROBS_HEAP_MB")
if env_override:
    try:
        value = int(env_override)
    except Exception:
        value = None
    if value in {4096, 6144}:
        print(value)
        raise SystemExit(0)
default = 6144
if not os.path.exists(path):
    print(default)
    raise SystemExit(0)
try:
    doc = json.load(open(path, "r", encoding="utf-8"))
except Exception:
    print(default)
    raise SystemExit(0)
value = int(doc.get("current_heap_mb") or default)
print(value if value in {4096, 6144} else default)
PY
}

step_heap_mb() {
  case "$1" in
    hist_probs)
      hist_probs_heap_mb
      ;;
    snapshot|learning_daily|v1_audit|cutover_readiness|stock_analyzer_universe_audit|ui_field_truth_report|final_integrity_seal)
      printf '%s\n' 1536
      ;;
    build_global_scope)
      printf '%s\n' 1024
      ;;
    forecast_daily)
      printf '%s\n' "${RV_FORECAST_DAILY_HEAP_MB:-1536}"
      ;;
    build_fundamentals|quantlab_daily_report|scientific_summary|etf_diagnostic)
      printf '%s\n' 512
      ;;
    *)
      printf '%s\n' 384
      ;;
  esac
}

step_min_mem_kb() {
  case "$(step_resource_class "$1")" in
    heavy) printf '%s\n' 2048000 ;;
    medium) printf '%s\n' 1024000 ;;
    *) printf '%s\n' 512000 ;;
  esac
}

step_max_swap_kb() {
  case "$(step_resource_class "$1")" in
    heavy) printf '%s\n' 3072000 ;;
    medium) printf '%s\n' 4096000 ;;
    *) printf '%s\n' 5120000 ;;
  esac
}

step_command() {
  case "$1" in
    safe_code_sync)
      printf '%s\n' "bash scripts/nas/safe-code-sync.sh"
      ;;
    build_global_scope)
      # pack-manifest.global goes to RV_GLOBAL_MANIFEST_DIR, not public/
      printf '%s\n' "node scripts/universe-v7/build-global-scope.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes '$GLOBAL_ASSET_CLASSES'"
      ;;
    market_data_refresh)
      # pack-manifest.global goes to RV_GLOBAL_MANIFEST_DIR via env var (set in nas-env.sh)
      printf '%s\n' "python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file '$RV_EODHD_ENV_FILE' --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date '$TARGET_MARKET_DATE' --to-date '$TARGET_MARKET_DATE' --bulk-last-day --bulk-exchange-cost '${RV_EODHD_BULK_EXCHANGE_COST:-100}' --global-lock-path '$NAS_LOCK_ROOT/eodhd.lock' --max-eodhd-calls '${RV_MARKET_REFRESH_MAX_EODHD_CALLS:-0}' --max-retries '${RV_MARKET_REFRESH_MAX_RETRIES:-1}' --timeout-sec '${RV_MARKET_REFRESH_TIMEOUT_PER_REQUEST_SEC:-60}' --flush-every '${RV_MARKET_REFRESH_FLUSH_EVERY:-250}' --concurrency '$MARKET_REFRESH_CONCURRENCY' --progress-every '$MARKET_REFRESH_PROGRESS_EVERY' && node scripts/ops/apply-history-touch-report-to-registry.mjs --scan-existing-packs && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes '$GLOBAL_ASSET_CLASSES'"
      ;;
    q1_delta_ingest)
      printf '%s\n' "${RV_Q1_PYTHON_BIN:-python3} scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date '$TARGET_MARKET_DATE'"
      ;;
    build_fundamentals)
      if [ "${RV_FUNDAMENTALS_METADATA_ONLY:-0}" = "1" ]; then
        printf '%s\n' "flock '$NAS_LOCK_ROOT/eodhd.lock' -c \"node scripts/build-fundamentals.mjs --metadata-only --asset-classes '$GLOBAL_ASSET_CLASSES'\""
      else
        printf '%s\n' "flock '$NAS_LOCK_ROOT/eodhd.lock' -c \"node scripts/build-fundamentals.mjs --force --asset-classes '$GLOBAL_ASSET_CLASSES'\""
      fi
      ;;
    quantlab_daily_report)
      printf '%s\n' "node scripts/quantlab/build_quantlab_v4_daily_report.mjs"
      ;;
    scientific_summary)
      printf '%s\n' "node scripts/build-scientific-summary.mjs"
      ;;
    forecast_daily)
      printf '%s\n' "FORECAST_SKIP_MATURED_EVAL=1 FORECAST_RSS_BUDGET_MB='${RV_FORECAST_RSS_BUDGET_MB:-4096}' node scripts/forecast/run_daily.mjs --date='$TARGET_MARKET_DATE'"
      ;;
    hist_probs)
      printf '%s\n' "HIST_PROBS_SKIP_EXISTING=1 HIST_PROBS_WRITE_MODE='${RV_HIST_PROBS_WRITE_MODE:-bucket_only}' HIST_PROBS_RSS_BUDGET_MB='${RV_HIST_PROBS_RSS_BUDGET_MB:-7168}' HIST_PROBS_RESPECT_CHECKPOINT_VERSION='${RV_HIST_PROBS_RESPECT_CHECKPOINT_VERSION:-1}' HIST_PROBS_FAIL_ON_SOFT_ERRORS='${RV_HIST_PROBS_FAIL_ON_SOFT_ERRORS:-1}' HIST_PROBS_MIN_COVERAGE_RATIO='${RV_HIST_PROBS_MIN_COVERAGE_RATIO:-0.95}' node scripts/ops/nas-hist-probs-worker-guard.mjs --mode=all --default-workers='${RV_HIST_PROBS_WORKERS:-3}' --max-workers=4 --batch-size='${RV_HIST_PROBS_WORKER_BATCH_SIZE:-50}' -- node run-hist-probs-turbo.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/ops/build-hist-probs-status-summary.mjs"
      ;;
    snapshot)
      printf '%s\n' "node scripts/ops/build-full-universe-decisions.mjs --target-market-date '$TARGET_MARKET_DATE' --replace && ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1 node scripts/build-best-setups-v4.mjs"
      ;;
    etf_diagnostic)
      printf '%s\n' "node scripts/learning/diagnose-best-setups-etf-drop.mjs"
      ;;
    learning_daily)
      printf '%s\n' "node scripts/learning/run-daily-learning-cycle.mjs --date='$TARGET_MARKET_DATE'"
      ;;
    v1_audit)
      printf '%s\n' "node scripts/learning/quantlab-v1/daily-audit-report.mjs"
      ;;
    cutover_readiness)
      printf '%s\n' "node scripts/learning/quantlab-v1/cutover-readiness-report.mjs"
      ;;
    stage1_ops_pack)
      printf '%s\n' "node scripts/ops/build-safety-snapshot.mjs && node scripts/ops/build-mission-control-summary.mjs && node scripts/ops/build-ops-pulse.mjs"
      ;;
    system_status_report)
      printf '%s\n' "node scripts/ops/build-system-status-report.mjs --lane='$ACTIVE_LANE'"
      ;;
    data_freshness_report)
      printf '%s\n' "node scripts/ops/build-data-freshness-report.mjs --lane='$ACTIVE_LANE'"
      ;;
    pipeline_epoch)
      printf '%s\n' "node scripts/ops/build-pipeline-epoch.mjs --lane='$ACTIVE_LANE'"
      ;;
    generate_meta_dashboard_data)
      printf '%s\n' "node scripts/generate_meta_dashboard_data.mjs --lane='$ACTIVE_LANE'"
      ;;
    runtime_preflight)
      printf '%s\n' "ulimit -n 8192 >/dev/null 2>&1 || true; node scripts/ops/runtime-preflight.mjs --ensure-runtime --mode=hard --timeout-ms '${RV_RUNTIME_PREFLIGHT_TIMEOUT_MS:-30000}' --min-fd-limit '${RV_RUNTIME_PREFLIGHT_MIN_FD_LIMIT:-4096}' && jq -e '.ok == true' public/data/ops/runtime-preflight-latest.json >/dev/null"
      ;;
    stock_analyzer_universe_audit)
      # pack-manifest.global goes to RV_GLOBAL_MANIFEST_DIR (NAS_OPS_ROOT/pipeline-artifacts/manifests/)
      # apply-history-touch-report runs first to ensure registry.bars_count is current before the audit.
      # operability rebuild uses --refresh-from-registry so bars_count and targetable denominator are
      # always derived from the live registry; non_tradable_or_delisted assets excluded from targetable.
      printf '%s\n' "mkdir -p '${RV_GLOBAL_MANIFEST_DIR:-${NAS_PIPELINE_ARTIFACTS_ROOT:-$NAS_OPS_ROOT/pipeline-artifacts}/manifests}' && node scripts/universe-v7/build-global-scope.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/ops/apply-history-touch-report-to-registry.mjs --scan-existing-packs && node scripts/ops/build-stock-analyzer-universe-audit.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --asset-classes '$GLOBAL_ASSET_CLASSES' --max-tickers 0 --live-sample-size 0 --concurrency '${RV_STOCK_ANALYZER_AUDIT_CONCURRENCY:-12}' --timeout-ms '${RV_STOCK_ANALYZER_AUDIT_TIMEOUT_MS:-30000}' && if [ -f public/data/ops/stock-analyzer-operability-latest.json ]; then node scripts/ops/build-stock-analyzer-operability.mjs --refresh-from-registry --registry-path public/data/universe/v7/registry/registry.ndjson.gz; else echo '{\"ok\":true,\"skipped\":\"stock_analyzer_operability_full_report_missing\"}'; fi"
      ;;
    ui_field_truth_report)
      printf '%s\n' "if [ \"\${RV_ALLOW_LOCAL_RUNTIME_GATES:-0}\" = \"1\" ]; then node scripts/ops/build-ui-field-truth-report.mjs --base-url http://127.0.0.1:8788 --date='$TARGET_MARKET_DATE' --timeout-ms '${RV_UI_TRUTH_TIMEOUT_MS:-30000}'; else echo 'local runtime smoke disabled for automated NAS release; set RV_ALLOW_LOCAL_RUNTIME_GATES=1 to run ui_field_truth_report' >&2; exit 2; fi"
      ;;
    final_integrity_seal)
      printf '%s\n' "node scripts/ops/build-pipeline-runtime-report.mjs && node scripts/ops/build-full-universe-decisions.mjs --target-market-date '$TARGET_MARKET_DATE' --replace && node scripts/ops/final-integrity-seal.mjs --target-market-date '$TARGET_MARKET_DATE' && node scripts/ops/sync-release-state-from-final-seal.mjs"
      ;;
    build_deploy_bundle)
      printf '%s\n' "node scripts/ops/build-deploy-bundle.mjs"
      ;;
    wrangler_deploy)
      printf '%s\n' "node scripts/ops/release-gate-check.mjs"
      ;;
    *)
      echo "unknown_step=$1" >&2
      return 2
      ;;
  esac
}

write_guard_blocked_result() {
  local result_json="$1"
  local step_id="$2"
  local reason="$3"
  local resource_class="$4"
  local heap_mb="$5"
  local mem_before_kb="$6"
  local swap_before_kb="$7"
  python3 - "$result_json" "$CAMPAIGN_STAMP" "$ACTIVE_LANE" "$step_id" "$reason" "$resource_class" "$heap_mb" "$mem_before_kb" "$swap_before_kb" <<'PY'
import json
import os
import sys
from datetime import datetime

path, stamp, lane, step_id, reason, resource_class, heap_mb, mem_before_kb, swap_before_kb = sys.argv[1:10]
doc = {
    "schema_version": "nas.night.pipeline.result.v1",
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "campaign_stamp": stamp,
    "evaluation_lane": lane,
    "step_id": step_id,
    "status": "guard_blocked",
    "guard_reason": reason,
    "resource_class": resource_class,
    "heap_mb": int(heap_mb),
    "duration_sec": 0,
    "peak_rss_mb": None,
    "avg_rss_mb": None,
    "mem_available_before_mb": round(int(mem_before_kb) / 1024, 2),
    "mem_available_after_mb": round(int(mem_before_kb) / 1024, 2),
    "swap_used_before_mb": round(int(swap_before_kb) / 1024, 2),
    "swap_used_after_mb": round(int(swap_before_kb) / 1024, 2),
    "swap_delta_mb": 0,
}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

write_step_result() {
  local result_json="$1"
  local measure_json="$2"
  local step_id="$3"
  local resource_class="$4"
  local heap_mb="$5"
  local guard_reason="$6"
  python3 - "$result_json" "$measure_json" "$CAMPAIGN_STAMP" "$ACTIVE_LANE" "$step_id" "$resource_class" "$heap_mb" "$guard_reason" <<'PY'
import json
import os
import sys
from datetime import datetime

result_path, measure_path, stamp, lane, step_id, resource_class, heap_mb, guard_reason = sys.argv[1:9]
measure = {}
if os.path.exists(measure_path):
    measure = json.load(open(measure_path, "r", encoding="utf-8"))
status = "success"
if measure.get("timed_out") or int(measure.get("exit_code") or 0) == 124:
    status = "timed_out"
elif int(measure.get("exit_code") or 0) != 0:
    status = "failed"
doc = {
    "schema_version": "nas.night.pipeline.result.v1",
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "campaign_stamp": stamp,
    "evaluation_lane": lane,
    "step_id": step_id,
    "status": status,
    "guard_reason": guard_reason or None,
    "resource_class": resource_class,
    "heap_mb": int(heap_mb),
    "command_exit_code": measure.get("exit_code"),
    "timed_out": bool(measure.get("timed_out")),
    "duration_sec": measure.get("duration_sec"),
    "peak_rss_mb": measure.get("peak_rss_mb"),
    "avg_rss_mb": measure.get("avg_rss_mb"),
    "peak_pcpu": measure.get("peak_pcpu"),
    "cpu_window": measure.get("cpu_window"),
    "mem_available_before_mb": round(((measure.get("mem_before") or {}).get("MemAvailable_kb") or 0) / 1024, 2) if (measure.get("mem_before") or {}).get("MemAvailable_kb") is not None else None,
    "mem_available_after_mb": round(((measure.get("mem_after") or {}).get("MemAvailable_kb") or 0) / 1024, 2) if (measure.get("mem_after") or {}).get("MemAvailable_kb") is not None else None,
    "swap_used_before_mb": round((((measure.get("mem_before") or {}).get("SwapTotal_kb") or 0) - ((measure.get("mem_before") or {}).get("SwapFree_kb") or 0)) / 1024, 2) if (measure.get("mem_before") or {}).get("SwapTotal_kb") is not None else None,
    "swap_used_after_mb": round((((measure.get("mem_after") or {}).get("SwapTotal_kb") or 0) - ((measure.get("mem_after") or {}).get("SwapFree_kb") or 0)) / 1024, 2) if (measure.get("mem_after") or {}).get("SwapTotal_kb") is not None else None,
}
if doc["swap_used_before_mb"] is not None and doc["swap_used_after_mb"] is not None:
    doc["swap_delta_mb"] = round(doc["swap_used_after_mb"] - doc["swap_used_before_mb"], 2)
else:
    doc["swap_delta_mb"] = None
os.makedirs(os.path.dirname(result_path), exist_ok=True)
with open(result_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

update_hist_probs_profile() {
  local result_json="$1"
  python3 - "$HIST_PROBS_STATE_JSON" "$result_json" "$CAMPAIGN_STAMP" "$ACTIVE_LANE" <<'PY'
import json
import os
import sys
from datetime import datetime

state_path, result_path, stamp, lane = sys.argv[1:5]
state = {"current_heap_mb": 6144, "stable_nights": 0}
if os.path.exists(state_path):
    try:
        state = json.load(open(state_path, "r", encoding="utf-8"))
    except Exception:
        state = {"current_heap_mb": 6144, "stable_nights": 0}
try:
    result = json.load(open(result_path, "r", encoding="utf-8"))
except Exception:
    result = {}

stable = (
    lane == "data-plane"
    and result.get("status") == "success"
    and not result.get("timed_out")
    and (result.get("swap_used_after_mb") is not None and float(result["swap_used_after_mb"]) <= 3000)
)

if stable:
    state["stable_nights"] = int(state.get("stable_nights") or 0) + 1
    if int(state["stable_nights"]) >= 7:
        state["current_heap_mb"] = 4096
    else:
        state["current_heap_mb"] = 6144
else:
    state["stable_nights"] = 0
    state["current_heap_mb"] = 6144

state["last_campaign_stamp"] = stamp
state["last_updated_at"] = datetime.utcnow().isoformat() + "Z"
os.makedirs(os.path.dirname(state_path), exist_ok=True)
with open(state_path, "w", encoding="utf-8") as fh:
    json.dump(state, fh, indent=2)
    fh.write("\n")
PY
}

run_step() {
  local step_id="$1"
  local step_dir="$CAMPAIGN_DIR/$step_id"
  local stdout_log="$step_dir/stdout.log"
  local stderr_log="$step_dir/stderr.log"
  local measure_json="$step_dir/measure.json"
  local result_json="$step_dir/result.json"
  local command
  command="$(step_command "$step_id")"
  local resource_class
  resource_class="$(step_resource_class "$step_id")"
  local heap_mb
  heap_mb="$(step_heap_mb "$step_id")"
  local min_mem_kb
  min_mem_kb="$(step_min_mem_kb "$step_id")"
  local max_swap_kb
  max_swap_kb="$(step_max_swap_kb "$step_id")"
  local timeout_sec
  timeout_sec="$(step_timeout_sec "$step_id")"
  local mem_before_kb
  mem_before_kb="$(nas_mem_available_kb)"
  local swap_before_kb
  swap_before_kb="$(nas_swap_used_kb)"

  mkdir -p "$step_dir"
  write_status "running" "step_start" "$step_id"

  if (( mem_before_kb < min_mem_kb )); then
    write_guard_blocked_result "$result_json" "$step_id" "mem_available_below_floor" "$resource_class" "$heap_mb" "$mem_before_kb" "$swap_before_kb"
    write_status "guard_blocked" "mem_available_below_floor" "$step_id"
    return 10
  fi
  if (( swap_before_kb > max_swap_kb )); then
    write_guard_blocked_result "$result_json" "$step_id" "swap_used_above_ceiling" "$resource_class" "$heap_mb" "$mem_before_kb" "$swap_before_kb"
    write_status "guard_blocked" "swap_used_above_ceiling" "$step_id"
    return 11
  fi

  local -a measure_args
  measure_args=(
    python3 "$MEASURE_SCRIPT"
    --cwd "$NAS_DEV_ROOT"
    --stdout "$stdout_log"
    --stderr "$stderr_log"
    --json "$measure_json"
    --timeout-sec "$timeout_sec"
    --set-env "REPO_ROOT=$NAS_DEV_ROOT"
    --set-env "OPS_ROOT=$NAS_OPS_ROOT"
    --set-env "QUANT_ROOT=$NAS_QUANT_ROOT"
    --set-env "RV_PIPELINE_LANE=$ACTIVE_LANE"
    --set-env "RV_GLOBAL_ASSET_CLASSES=$GLOBAL_ASSET_CLASSES"
    --set-env "TARGET_MARKET_DATE=$TARGET_MARKET_DATE"
    --set-env "RV_TARGET_MARKET_DATE=$TARGET_MARKET_DATE"
  )

  case "$step_id" in
    build_global_scope|hist_probs|snapshot|learning_daily|forecast_daily|build_fundamentals|quantlab_daily_report|scientific_summary|v1_audit|cutover_readiness|etf_diagnostic|stage1_ops_pack|system_status_report|data_freshness_report|pipeline_epoch|generate_meta_dashboard_data|runtime_preflight|stock_analyzer_universe_audit|ui_field_truth_report|final_integrity_seal|build_deploy_bundle|wrangler_deploy)
      measure_args+=(--set-env "NODE_OPTIONS=--max-old-space-size=$heap_mb")
      ;;
  esac

  if [[ "$step_id" == "safe_code_sync" ]]; then
    measure_args+=(--set-env "TARGET_BRANCH=$TARGET_BRANCH")
    measure_args+=(--set-env "ALLOW_ACTIVE_NIGHT_PIPELINE_LOCK=1")
  fi

  if [[ "$step_id" == "q1_delta_ingest" ]]; then
    nas_acquire_global_lock "q1-writer"
  fi

  set +e
  "${measure_args[@]}" --command "$command"
  local cmd_status="$?"
  set -e

  if [[ "$step_id" == "q1_delta_ingest" ]]; then
    nas_release_global_lock "q1-writer"
  fi

  write_step_result "$result_json" "$measure_json" "$step_id" "$resource_class" "$heap_mb" ""
  if [[ "$step_id" == "hist_probs" ]]; then
    update_hist_probs_profile "$result_json"
  fi

  if [[ "$cmd_status" -ne 0 ]]; then
    write_status "failed" "step_failed" "$step_id"
    return "$cmd_status"
  fi

  append_completed_step "$step_id"
  write_status "running" "step_ok" "$step_id"
  return 0
}

lane_steps() {
  if [[ "$ACTIVE_LANE" == "data-plane" ]]; then
    printf '%s\n' \
      safe_code_sync \
      build_global_scope \
      market_data_refresh \
      q1_delta_ingest \
      build_fundamentals \
      quantlab_daily_report \
      scientific_summary \
      forecast_daily \
      hist_probs \
      snapshot \
      etf_diagnostic \
      learning_daily \
      v1_audit \
      cutover_readiness \
      stage1_ops_pack \
      data_freshness_report \
      system_status_report \
      pipeline_epoch \
      generate_meta_dashboard_data
  else
    printf '%s\n' \
      stock_analyzer_universe_audit \
      data_freshness_report \
      system_status_report \
      pipeline_epoch \
      final_integrity_seal \
      system_status_report \
      generate_meta_dashboard_data \
      build_deploy_bundle \
      wrangler_deploy
  fi
}

trap 'nas_release_global_lock "night-pipeline"' EXIT
nas_acquire_global_lock "night-pipeline"
assert_no_competing_lanes

if [[ -n "$(nas_detect_q1_writer_conflict)" ]]; then
  write_status "blocked" "q1_writer_conflict" ""
  echo "night_pipeline_blocked=q1_writer_conflict" >&2
  exit 12
fi

quarantine_dev_runtime_once
bash "$REPO_ROOT/scripts/nas/preflight-env.sh" --lane="$ACTIVE_LANE"

write_status "running" "campaign_started" ""

start_step_seen=1
if [[ -n "$START_STEP" ]]; then
  start_step_seen=0
fi

while IFS= read -r step_id; do
  [[ -n "$step_id" ]] || continue
  if [[ "$start_step_seen" -eq 0 ]]; then
    if [[ "$step_id" == "$START_STEP" ]]; then
      start_step_seen=1
    else
      continue
    fi
  fi
  if ! run_step "$step_id"; then
    exit "$?"
  fi
done < <(lane_steps)

if [[ -n "$START_STEP" && "$start_step_seen" -eq 0 ]]; then
  echo "invalid_start_step=$START_STEP lane=$ACTIVE_LANE" >&2
  write_status "failed" "invalid_start_step" "$START_STEP"
  exit 2
fi

write_status "completed" "lane_finished" ""
