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

# P3: SUPERVISOR_STOP guard — never silent. If the legacy stop-file is present, emit a
# critical journal entry and either auto-migrate (after 48h) or exit with a non-zero
# code that makes the failure visible in the DSM task log + dashboard-sync. Previously
# the legacy launcher run-pipeline-master-supervisor-node20.sh swallowed it via
# `exec sleep 2147483647`, so a stale STOP file blocked the pipeline silently for days.
SUPERVISOR_STOP_PATH="$REPO_ROOT/mirrors/ops/pipeline-master/SUPERVISOR_STOP"
if [[ -f "$SUPERVISOR_STOP_PATH" ]]; then
  stop_age_hours="$(python3 -c "import os,sys,time; p=sys.argv[1]; print(round((time.time()-os.path.getmtime(p))/3600,2)) if os.path.exists(p) else print(0)" "$SUPERVISOR_STOP_PATH" 2>/dev/null || echo 0)"
  stop_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$NAS_NIGHT_PIPELINE_ROOT/journal" "$NAS_NIGHT_PIPELINE_ROOT/scheduled" 2>/dev/null || true
  printf '{"event":"supervisor_stop_active","severity":"critical","stop_path":"%s","age_hours":%s,"detected_at":"%s","lane":"%s"}\n' \
    "$SUPERVISOR_STOP_PATH" "$stop_age_hours" "$stop_iso" "${ACTIVE_LANE:-unknown}" \
    >> "$NAS_NIGHT_PIPELINE_ROOT/journal/supervisor-stop-events.ndjson"
  if (( $(printf '%s\n' "$stop_age_hours" | python3 -c "import sys; v=float(sys.stdin.read().strip() or 0); print(1 if v>=48 else 0)") == 1 )); then
    expired_path="${SUPERVISOR_STOP_PATH}.auto-expired-$(date -u +%Y%m%d)"
    mv "$SUPERVISOR_STOP_PATH" "$expired_path" 2>/dev/null || true
    echo "supervisor_stop_auto_migrated age_hours=$stop_age_hours migrated_to=$expired_path" >&2
  else
    echo "supervisor_stop_active_block age_hours=$stop_age_hours path=$SUPERVISOR_STOP_PATH" >&2
    exit 19
  fi
fi

CAMPAIGN_STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
PIPELINE_ROOT="$NAS_NIGHT_PIPELINE_ROOT"
CAMPAIGN_DIR="$PIPELINE_ROOT/runs/$CAMPAIGN_STAMP"
LOG_DIR="$CAMPAIGN_DIR/logs"
STATUS_JSON="$CAMPAIGN_DIR/status.json"
LATEST_JSON="$PIPELINE_ROOT/latest.json"
HEARTBEAT_JSON="$REPO_ROOT/mirrors/ops/pipeline-master/supervisor-heartbeat.json"
MEASURE_SCRIPT="$REPO_ROOT/scripts/nas/measure-command.py"
HIST_PROBS_STATE_JSON="$PIPELINE_ROOT/state/hist-probs-profile.json"
COVERAGE_REPORT_PATH="$REPO_ROOT/public/data/universe/v7/reports/history_coverage_report.json"
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

if [[ "$ACTIVE_LANE" == "data-plane" && "$START_STEP" == "q1_delta_ingest" && "${RV_ALLOW_Q1_WITHOUT_MARKET_REFRESH:-0}" != "1" ]]; then
  coverage_gate="$(python3 - "$COVERAGE_REPORT_PATH" "$TARGET_MARKET_DATE" "${RV_HISTORY_COVERAGE_MIN_FRESH_TARGETABLE_PCT:-83}" <<'PY'
import json
import os
import sys
path = sys.argv[1]
target_market_date = str(sys.argv[2] or "")[:10]
try:
    min_fresh_pct = float(sys.argv[3])
except Exception:
    min_fresh_pct = 83.0
if not os.path.exists(path):
    print(f"promote reason=history_coverage_missing coverage_target=none target_market_date={target_market_date} fresh_of_targetable_pct=0 min_fresh_of_targetable_pct={min_fresh_pct}")
    raise SystemExit(0)
try:
    doc = json.load(open(path, "r", encoding="utf-8"))
except Exception as exc:
    print(f"promote reason=history_coverage_unreadable error={type(exc).__name__} coverage_target=none target_market_date={target_market_date} fresh_of_targetable_pct=0 min_fresh_of_targetable_pct={min_fresh_pct}")
    raise SystemExit(0)
coverage_target = str(doc.get("target_market_date") or "")[:10]
counts = doc.get("counts") if isinstance(doc.get("counts"), dict) else {}
percentages = doc.get("percentages") if isinstance(doc.get("percentages"), dict) else {}
try:
    fresh_pct = float(percentages.get("fresh_of_targetable_pct"))
except Exception:
    targetable = float(counts.get("bars_ge_200") or 0)
    fresh = float(counts.get("fresh_ge_200") or 0)
    fresh_pct = (fresh / targetable * 100.0) if targetable > 0 else 0.0
fresh = int(counts.get("fresh_ge_200") or 0)
targetable = int(counts.get("bars_ge_200") or 0)
if not coverage_target or coverage_target < target_market_date:
    print(f"promote reason=history_coverage_target_stale coverage_target={coverage_target or 'none'} target_market_date={target_market_date} fresh_of_targetable_pct={fresh_pct:.2f} fresh_targetable={fresh} targetable={targetable} min_fresh_of_targetable_pct={min_fresh_pct:.2f}")
elif targetable > 0 and fresh_pct < min_fresh_pct:
    print(f"promote reason=history_coverage_freshness_low coverage_target={coverage_target} target_market_date={target_market_date} fresh_of_targetable_pct={fresh_pct:.2f} fresh_targetable={fresh} targetable={targetable} min_fresh_of_targetable_pct={min_fresh_pct:.2f}")
else:
    print(f"ok coverage_target={coverage_target} target_market_date={target_market_date} fresh_of_targetable_pct={fresh_pct:.2f} fresh_targetable={fresh} targetable={targetable} min_fresh_of_targetable_pct={min_fresh_pct:.2f}")
PY
)"
  if [[ "$coverage_gate" == promote* ]]; then
    echo "promote_start_step=market_data_refresh $coverage_gate" >&2
    START_STEP="market_data_refresh"
  fi
fi

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

eodhd_budget_json() {
  python3 - "$RV_EODHD_ENV_FILE" <<'PY'
import json
import os
import sys
import urllib.request
from datetime import date

env_file = sys.argv[1]
keys = ("EODHD_API_TOKEN", "EODHD_API_KEY")
values = {key: os.environ.get(key, "").strip() for key in keys}
if os.path.exists(env_file):
    for raw in open(env_file, "r", encoding="utf-8"):
        raw = raw.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        if key in keys and not values.get(key):
            values[key] = value.strip().strip('"').strip("'")
token = values.get("EODHD_API_TOKEN") or values.get("EODHD_API_KEY")
if not token:
    raise SystemExit("missing_eodhd_token")
with urllib.request.urlopen(f"https://eodhd.com/api/user?api_token={token}&fmt=json", timeout=20) as resp:
    doc = json.load(resp)
api_requests = int(doc.get("apiRequests") or 0)
daily_limit = int(doc.get("dailyRateLimit") or 0)
extra_limit = int(doc.get("extraLimit") or 0)
api_date = str(doc.get("apiRequestsDate") or "")
today = date.today().isoformat()
daily_remaining = max(0, daily_limit - api_requests) if api_date == today else daily_limit
available = max(0, daily_remaining + max(0, extra_limit))
print(json.dumps({
    "apiRequests": api_requests,
    "apiRequestsDate": api_date,
    "dailyRateLimit": daily_limit,
    "extraLimit": extra_limit,
    "dailyRemaining": daily_remaining,
    "available": available,
}, sort_keys=True))
PY
}

purge_stale_market_refresh_state() {
  # Räume tote Worker-Locks im parallel_targeted_refresh_runs/-Friedhof älter als 3h.
  # Nur NAS-relevant; main job lock + state JSONs werden vom Python-Skript via
  # --reset-state-on-start nach erfolgreichem acquire_job_lock entfernt.
  local workers_dir="${NIGHT_REPO_ROOT:-$REPO_ROOT}/mirrors/universe-v7/state/parallel_targeted_refresh_runs"
  if [[ -d "$workers_dir" ]]; then
    find "$workers_dir" -type f -name '*.lock' -mmin +180 -delete 2>/dev/null || true
  fi
}

assert_eodhd_budget() {
  local required_calls="$1"
  local budget
  if ! budget="$(eodhd_budget_json)"; then
    echo "eodhd_budget_check_failed=unavailable" >&2
    return 16
  fi
  local available api_date daily_remaining extra_limit
  available="$(printf '%s' "$budget" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("available") or 0))')"
  api_date="$(printf '%s' "$budget" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("apiRequestsDate") or "")')"
  daily_remaining="$(printf '%s' "$budget" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("dailyRemaining") or 0))')"
  extra_limit="$(printf '%s' "$budget" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("extraLimit") or 0))')"
  if (( available < required_calls )); then
    echo "eodhd_budget_too_low available=$available required=$required_calls apiRequestsDate=$api_date dailyRemaining=$daily_remaining extraLimit=$extra_limit" >&2
    return 17
  fi
  echo "eodhd_budget_ok available=$available required=$required_calls apiRequestsDate=$api_date dailyRemaining=$daily_remaining extraLimit=$extra_limit" >&2
  return 0
}

hist_probs_skip_existing_value() {
  if [[ "${RV_FORCE_HIST_PROBS_REBUILD:-0}" == "1" ]]; then
    printf '%s\n' "0"
  else
    printf '%s\n' "${RV_HIST_PROBS_SKIP_EXISTING:-1}"
  fi
}

assert_release_coverage_current() {
  python3 - "$COVERAGE_REPORT_PATH" "$TARGET_MARKET_DATE" <<'PY'
import json
import os
import sys

path, target = sys.argv[1:3]
if not os.path.exists(path):
    print(f"history_coverage_missing path={path}")
    raise SystemExit(13)
try:
    doc = json.load(open(path, "r", encoding="utf-8"))
except Exception as exc:
    print(f"history_coverage_unreadable path={path} error={type(exc).__name__}")
    raise SystemExit(13)
coverage_target = str(doc.get("target_market_date") or "")[:10]
if coverage_target != str(target)[:10]:
    print(f"history_coverage_target_mismatch coverage_target={coverage_target or 'missing'} target_market_date={target}")
    raise SystemExit(13)
print(f"history_coverage_ok coverage_target={coverage_target} target_market_date={target}")
PY
}

step_resource_class() {
  case "$1" in
    hist_probs|hist_probs_catchup|snapshot|learning_daily|decision_core_shadow)
      printf '%s\n' "heavy"
      ;;
    build_global_scope|forecast_daily|build_fundamentals|quantlab_daily_report|breakout_v12|scientific_summary|decision_module_scorecard|decision_core_outcome_bootstrap|v1_audit|cutover_readiness|etf_diagnostic|page_core_bundle|public_history_shards|hist_probs_v2_shadow|classifier_audit)
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
    lock_policy_report) printf '%s\n' 120 ;;
    build_global_scope) printf '%s\n' 1800 ;;
    provider_health_preflight) printf '%s\n' 120 ;;
    market_data_refresh) printf '%s\n' "${RV_MARKET_REFRESH_TIMEOUT_SEC:-28800}" ;;
    q1_delta_ingest) printf '%s\n' "${RV_Q1_DELTA_INGEST_TIMEOUT_SEC:-21600}" ;;
    q1_delta_proof_report) printf '%s\n' 300 ;;
    build_fundamentals) printf '%s\n' 3600 ;;
    quantlab_daily_report) printf '%s\n' 1800 ;;
    breakout_v12) printf '%s\n' "${RV_BREAKOUT_V12_TIMEOUT_SEC:-3600}" ;;
    scientific_summary) printf '%s\n' 1800 ;;
    forecast_daily) printf '%s\n' "${RV_FORECAST_DAILY_TIMEOUT_SEC:-21600}" ;;
    hist_probs) printf '%s\n' "${RV_HIST_PROBS_TIMEOUT_SEC:-21600}" ;;
    hist_probs_catchup) printf '%s\n' "${RV_HIST_PROBS_CATCHUP_TIMEOUT_SEC:-57600}" ;;
    hist_probs_v2_shadow) printf '%s\n' "${RV_HIST_PROBS_V2_TIMEOUT_SEC:-900}" ;;
    snapshot) printf '%s\n' 5400 ;;
    page_core_bundle) printf '%s\n' 3600 ;;
    public_history_shards) printf '%s\n' "${RV_PUBLIC_HISTORY_SHARDS_TIMEOUT_SEC:-5400}" ;;
    page_core_smoke) printf '%s\n' 2400 ;;
    etf_diagnostic) printf '%s\n' 1800 ;;
    learning_daily) printf '%s\n' 5400 ;;
    decision_module_scorecard) printf '%s\n' 600 ;;
    decision_core_outcome_bootstrap) printf '%s\n' 600 ;;
    v1_audit) printf '%s\n' 1800 ;;
    cutover_readiness) printf '%s\n' 1800 ;;
    stage1_ops_pack) printf '%s\n' 1800 ;;
    system_status_report|data_freshness_report|pipeline_epoch|generate_meta_dashboard_data) printf '%s\n' 1800 ;;
    runtime_preflight|stock_ui_integrity_audit|classifier_audit) printf '%s\n' 1800 ;;
    resource_budget_report) printf '%s\n' 300 ;;
    stock_analyzer_universe_audit) printf '%s\n' 5400 ;;
    ui_field_truth_report) printf '%s\n' 2400 ;;
    final_integrity_seal) printf '%s\n' 1800 ;;
    build_deploy_bundle) printf '%s\n' 1800 ;;
    pre_deploy_smoke) printf '%s\n' 120 ;;
    dp8_market) printf '%s\n' "${RV_DP8_MARKET_TIMEOUT_SEC:-3600}" ;;
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
    hist_probs_catchup)
      printf '%s\n' "${RV_HIST_PROBS_CATCHUP_HEAP_MB:-3072}"
      ;;
    snapshot)
      printf '%s\n' "${RV_SNAPSHOT_HEAP_MB:-8192}"
      ;;
    decision_core_shadow)
      printf '%s\n' "${RV_DECISION_CORE_HEAP_MB:-8192}"
      ;;
    learning_daily|v1_audit|cutover_readiness|stock_analyzer_universe_audit|ui_field_truth_report|page_core_bundle|page_core_smoke|final_integrity_seal|hist_probs_v2_shadow|classifier_audit)
      printf '%s\n' 1536
      ;;
    build_global_scope)
      printf '%s\n' 1024
      ;;
    forecast_daily)
      printf '%s\n' "${RV_FORECAST_DAILY_HEAP_MB:-3072}"
      ;;
    build_fundamentals|quantlab_daily_report|breakout_v12|scientific_summary|etf_diagnostic|signal_performance_report)
      printf '%s\n' 512
      ;;
    dp8_market)
      printf '%s\n' "${RV_DP8_MARKET_HEAP_MB:-1536}"
      ;;
    wrangler_deploy)
      printf '%s\n' "${RV_WRANGLER_DEPLOY_HEAP_MB:-2048}"
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

step_io_heavy() {
  case "$1" in
    market_data_refresh|q1_delta_ingest|breakout_v12|snapshot|build_deploy_bundle|page_core_bundle)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

perf_wrapped_command() {
  local step_id="$1"
  local raw_command="$2"
  if [[ "${RV_PERF_WRAPPER:-1}" == "0" ]]; then
    printf '%s\n' "$raw_command"
    return 0
  fi

  local command="$raw_command"
  local quoted_command
  printf -v quoted_command '%q' "$command"
  command="bash -lc $quoted_command"

  local prefix=""
  local nice_value="${RV_PERF_NICE:-10}"
  if [[ "$nice_value" =~ ^-?[0-9]+$ ]] && command -v nice >/dev/null 2>&1; then
    prefix="nice -n $nice_value $prefix"
  fi

  local ionice_prefix="${RV_PERF_IONICE:-ionice -c2 -n7}"
  if step_io_heavy "$step_id" && [[ -n "$ionice_prefix" ]] && command -v ionice >/dev/null 2>&1; then
    prefix="$ionice_prefix $prefix"
  fi

  printf '%s%s\n' "$prefix" "$command"
}

step_command() {
  case "$1" in
    safe_code_sync)
      printf '%s\n' "bash scripts/nas/safe-code-sync.sh"
      ;;
    code_manifest_guard)
      printf '%s\n' "node scripts/nas/verify-code-manifest.mjs"
      ;;
    lock_policy_report)
      printf '%s\n' "node scripts/ops/audit-nas-locks.mjs --root '$NAS_LOCK_ROOT' --output '${NAS_OPS_ROOT:-$REPO_ROOT/var/private}/pipeline-artifacts/nas-lock-audit-latest.json'"
      ;;
    build_global_scope)
      # pack-manifest.global goes to RV_GLOBAL_MANIFEST_DIR, not public/
      printf '%s\n' "node scripts/universe-v7/build-global-scope.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/universe-v7/rebuild-search-exact-from-registry.mjs && node scripts/universe-v7/build-index-memberships.mjs && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes '$GLOBAL_ASSET_CLASSES'"
      ;;
    provider_health_preflight)
      printf '%s\n' "node scripts/ops/provider-health-preflight.mjs --env-file '$RV_EODHD_ENV_FILE' --min-available-calls '${RV_MARKET_REFRESH_MIN_EODHD_AVAILABLE_CALLS:-10000}' --output '${NAS_OPS_ROOT:-$REPO_ROOT/var/private}/pipeline-artifacts/provider-health-latest.json'"
      ;;
    market_data_refresh)
      # pack-manifest.global goes to RV_GLOBAL_MANIFEST_DIR via env var (set in nas-env.sh)
      printf '%s\n' "python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file '$RV_EODHD_ENV_FILE' --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date '$TARGET_MARKET_DATE' --to-date '$TARGET_MARKET_DATE' --bulk-last-day --bulk-exchange-cost '${RV_EODHD_BULK_EXCHANGE_COST:-100}' --exchange-checkpoint-path '${NAS_OPS_ROOT:-$REPO_ROOT/var/private}/pipeline-artifacts/market-refresh-exchange-checkpoint.json' --resume-exchange-checkpoint --global-lock-path '$NAS_LOCK_ROOT/eodhd.lock' --max-eodhd-calls '${RV_MARKET_REFRESH_MAX_EODHD_CALLS:-0}' --max-retries '${RV_MARKET_REFRESH_MAX_RETRIES:-1}' --timeout-sec '${RV_MARKET_REFRESH_TIMEOUT_PER_REQUEST_SEC:-60}' --flush-every '${RV_MARKET_REFRESH_FLUSH_EVERY:-250}' --concurrency '$MARKET_REFRESH_CONCURRENCY' --progress-every '$MARKET_REFRESH_PROGRESS_EVERY' --write-mode '${RV_HISTORY_WRITE_MODE:-merge}' --reset-state-on-start --bulk-min-yield-ratio '${RV_EODHD_BULK_MIN_YIELD_RATIO:-0}' --bulk-min-rows-matched '${RV_EODHD_BULK_MIN_ROWS_MATCHED:-25000}' --hard-daily-cap-calls '${RV_EODHD_HARD_DAILY_CAP:-90000}' && node scripts/ops/apply-history-touch-report-to-registry.mjs --scan-existing-packs && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/ops/report-history-coverage.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' --target-market-date '$TARGET_MARKET_DATE'"
      ;;
    q1_delta_ingest)
      printf '%s\n' "${RV_Q1_PYTHON_BIN:-python3} scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date '$TARGET_MARKET_DATE' --workers '${RV_Q1_WORKERS:-1}'"
      ;;
    q1_delta_proof_report)
      printf '%s\n' "node scripts/ops/build-q1-delta-proof-report.mjs --quant-root '$NAS_QUANT_ROOT' --output '${NAS_OPS_ROOT:-$REPO_ROOT/var/private}/pipeline-artifacts/q1-delta-proof-latest.json'"
      ;;
    build_fundamentals)
      if [ "${RV_FUNDAMENTALS_METADATA_ONLY:-0}" = "1" ] || [ "${RV_PROVIDER_BUDGET_MODE:-}" = "degraded" ] || [ "${RV_FUNDAMENTALS_PROVIDER_FETCHES:-0}" != "1" ]; then
        printf '%s\n' "flock '$NAS_LOCK_ROOT/eodhd.lock' -c \"node scripts/build-fundamentals.mjs --metadata-only --asset-classes '$GLOBAL_ASSET_CLASSES'\""
      else
        printf '%s\n' "flock '$NAS_LOCK_ROOT/eodhd.lock' -c \"node scripts/build-fundamentals.mjs --force --asset-classes '$GLOBAL_ASSET_CLASSES'\""
      fi
      ;;
    quantlab_daily_report)
      printf '%s\n' "node scripts/quantlab/build_quantlab_v4_daily_report.mjs"
      ;;
    breakout_v12)
      printf '%s\n' "POLARS_MAX_THREADS='${POLARS_MAX_THREADS:-2}' OMP_NUM_THREADS='${OMP_NUM_THREADS:-2}' DUCKDB_THREADS='${DUCKDB_THREADS:-2}' node scripts/breakout/run-breakout-nightly-safe.mjs --as-of='$TARGET_MARKET_DATE' --max-assets='${RV_BREAKOUT_MAX_ASSETS:-5000}' && node scripts/breakout-v12/verify-production-ready.mjs --as-of='$TARGET_MARKET_DATE'"
      ;;
    scientific_summary)
      printf '%s\n' "node scripts/build-scientific-summary.mjs"
      ;;
    forecast_daily)
      printf '%s\n' "FORECAST_SKIP_MATURED_EVAL=1 FORECAST_RSS_BUDGET_MB='${RV_FORECAST_RSS_BUDGET_MB:-4096}' node scripts/forecast/run_daily.mjs --date='$TARGET_MARKET_DATE'"
      ;;
    hist_probs)
      local hist_skip_existing
      hist_skip_existing="$(hist_probs_skip_existing_value)"
      printf '%s\n' "set +e; HIST_PROBS_WORKERS='${RV_HIST_PROBS_WORKERS:-3}' HIST_PROBS_WORKER_BATCH_SIZE='${RV_HIST_PROBS_WORKER_BATCH_SIZE:-50}' HIST_PROBS_SKIP_EXISTING='$hist_skip_existing' HIST_PROBS_WRITE_MODE='${RV_HIST_PROBS_WRITE_MODE:-bucket_only}' HIST_PROBS_TIER='${RV_HIST_PROBS_TIER:-all}' HIST_PROBS_MAX_TICKERS='${RV_HIST_PROBS_MAX_TICKERS:-0}' HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS='${RV_HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS:-2}' HIST_PROBS_RSS_BUDGET_MB='${RV_HIST_PROBS_RSS_BUDGET_MB:-7168}' HIST_PROBS_RESPECT_CHECKPOINT_VERSION='${RV_HIST_PROBS_RESPECT_CHECKPOINT_VERSION:-1}' HIST_PROBS_FAIL_ON_SOFT_ERRORS='${RV_HIST_PROBS_FAIL_ON_SOFT_ERRORS:-0}' HIST_PROBS_MIN_COVERAGE_RATIO='${RV_HIST_PROBS_MIN_COVERAGE_RATIO:-0.95}' HIST_PROBS_DEFER_IF_REMAINING_OVER='${RV_HIST_PROBS_DEFER_IF_REMAINING_OVER:-10000}' HIST_PROBS_ALLOW_DEFER_SUCCESS='${RV_HIST_PROBS_ALLOW_DEFER_SUCCESS:-1}' node scripts/ops/nas-hist-probs-worker-guard.mjs --mode '${RV_HIST_PROBS_TIER:-all}' -- node run-hist-probs-turbo.mjs --asset-classes '$GLOBAL_ASSET_CLASSES'; hist_status=\$?; post_status=0; node scripts/ops/build-hist-probs-status-summary.mjs || post_status=\$?; node scripts/ops/build-hist-probs-public-projection.mjs || post_status=\$?; node scripts/ops/triage-hist-probs-errors.mjs || post_status=\$?; node scripts/hist-probs/classify-hist-errors.mjs || post_status=\$?; node scripts/hist-probs/audit-current-state.mjs || post_status=\$?; if [ \"\$hist_status\" -ne 0 ]; then exit \"\$hist_status\"; fi; exit \"\$post_status\""
      ;;
    hist_probs_catchup)
      # Catchup is intentionally non-blocking: SIGTERM/mem-pressure must not abort the night.
      # Cap nightly workload to MAX_TICKERS (default 1500) so a single run never spans hours
      # AND the hist-worker-guard's hard-pressure mode (workers=1, batch=25) gets the chance
      # to keep RSS under control — skip-existing + checkpoint-store (already in turbo.mjs)
      # let the next nightly continue from where this one stopped.
      # ALLOW_DEFER_SUCCESS=1: if turbo decides to defer (queue too large), exit 0 instead of 23.
      printf '%s\n' "set +e; if [ \"\${RV_HIST_PROBS_CATCHUP_REGION_AWARE:-1}\" = \"1\" ]; then HIST_PROBS_WORKERS='${RV_HIST_PROBS_CATCHUP_WORKERS:-2}' HIST_PROBS_WORKER_BATCH_SIZE='${RV_HIST_PROBS_CATCHUP_BATCH_SIZE:-25}' HIST_PROBS_SKIP_EXISTING='1' HIST_PROBS_WRITE_MODE='bucket_only' HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS='${RV_HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS:-2}' HIST_PROBS_RSS_BUDGET_MB='${RV_HIST_PROBS_CATCHUP_RSS_BUDGET_MB:-4096}' HIST_PROBS_RESPECT_CHECKPOINT_VERSION='1' HIST_PROBS_FAIL_ON_SOFT_ERRORS='0' HIST_PROBS_MIN_COVERAGE_RATIO='0' node scripts/hist-probs/run-region-aware-catchup.mjs --target-market-date '$TARGET_MARKET_DATE' --per-region '${RV_HIST_PROBS_CATCHUP_PER_REGION:-500}' --max-total '${RV_HIST_PROBS_CATCHUP_MAX_TICKERS:-1500}' --execute; hist_status=\$?; else HIST_PROBS_WORKERS='${RV_HIST_PROBS_CATCHUP_WORKERS:-2}' HIST_PROBS_WORKER_BATCH_SIZE='${RV_HIST_PROBS_CATCHUP_BATCH_SIZE:-25}' HIST_PROBS_SKIP_EXISTING='1' HIST_PROBS_WRITE_MODE='bucket_only' HIST_PROBS_TIER='all' HIST_PROBS_MAX_TICKERS='${RV_HIST_PROBS_CATCHUP_MAX_TICKERS:-1500}' HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS='${RV_HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS:-2}' HIST_PROBS_RSS_BUDGET_MB='${RV_HIST_PROBS_CATCHUP_RSS_BUDGET_MB:-3072}' HIST_PROBS_RESPECT_CHECKPOINT_VERSION='1' HIST_PROBS_FAIL_ON_SOFT_ERRORS='0' HIST_PROBS_MIN_COVERAGE_RATIO='${RV_HIST_PROBS_CATCHUP_MIN_COVERAGE_RATIO:-0.95}' HIST_PROBS_DEFER_IF_REMAINING_OVER='0' HIST_PROBS_ALLOW_DEFER_SUCCESS='${RV_HIST_PROBS_CATCHUP_ALLOW_DEFER_SUCCESS:-1}' node scripts/ops/nas-hist-probs-worker-guard.mjs --mode all -- node run-hist-probs-turbo.mjs --asset-classes '$GLOBAL_ASSET_CLASSES'; hist_status=\$?; post_status=0; node scripts/ops/build-hist-probs-status-summary.mjs || post_status=\$?; node scripts/ops/build-hist-probs-public-projection.mjs || post_status=\$?; node scripts/ops/triage-hist-probs-errors.mjs || post_status=\$?; node scripts/hist-probs/classify-hist-errors.mjs || post_status=\$?; node scripts/hist-probs/audit-current-state.mjs || post_status=\$?; if [ \"\$post_status\" -ne 0 ]; then hist_status=\"\$post_status\"; fi; fi; if [ \"\$hist_status\" -ne 0 ]; then exit \"\$hist_status\"; fi; exit 0"
      ;;
    hist_probs_v2_shadow)
      printf '%s\n' "node scripts/hist-probs-v2/run-daily-shadow-step.mjs --date='$TARGET_MARKET_DATE' --max-assets='${RV_HIST_PROBS_V2_MAX_ASSETS:-300}' --error-assets='${RV_HIST_PROBS_V2_ERROR_ASSETS:-200}' --timeout-ms='${RV_HIST_PROBS_V2_TIMEOUT_MS:-600000}'"
      ;;
    decision_core_shadow)
      printf '%s\n' "node scripts/decision-core/build-minimal-decision-bundles.mjs --mode shadow --target-market-date '$TARGET_MARKET_DATE' --replace && node scripts/decision-core/validate-decision-bundles.mjs --root public/data/decision-core/shadow --target-market-date '$TARGET_MARKET_DATE' && node scripts/decision-core/shadow-diff-logger.mjs --target-market-date '$TARGET_MARKET_DATE' && node scripts/validate/stock-decision-core-ui-fixtures.mjs && { node scripts/decision-core/update-shadow-day-ledger.mjs --target-market-date '$TARGET_MARKET_DATE' || { ledger_status=\$?; if [ \"\${RV_DECISION_CORE_SHADOW_LEDGER_HARD_GATE:-0}\" = \"1\" ]; then exit \"\$ledger_status\"; fi; echo \"decision_core_shadow_ledger_warn exit_code=\$ledger_status\" >&2; exit 0; }; }"
      ;;
    decision_core_outcome_bootstrap)
      printf '%s\n' "node scripts/decision-core/build-outcome-store-bootstrap.mjs --root=public/data/decision-core/shadow --target-market-date '$TARGET_MARKET_DATE'"
      ;;
    snapshot)
      printf '%s\n' "if [ \"\${RV_DECISION_CORE_SOURCE:-legacy}\" = \"core\" ]; then node scripts/decision-core/build-minimal-decision-bundles.mjs --mode production --target-market-date '$TARGET_MARKET_DATE' --replace && node scripts/decision-core/validate-decision-bundles.mjs --root public/data/decision-core/core --target-market-date '$TARGET_MARKET_DATE' && ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1 BEST_SETUPS_DECISION_SOURCE=decision-core node scripts/build-best-setups-v4.mjs && node scripts/decision-core/build-buy-breadth-proof.mjs --target-market-date '$TARGET_MARKET_DATE'; else node scripts/ops/build-full-universe-decisions.mjs --target-market-date '$TARGET_MARKET_DATE' --replace && ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1 node scripts/build-best-setups-v4.mjs; fi"
      ;;
    page_core_bundle)
      printf '%s\n' "RV_DECISION_CORE_SOURCE='\${RV_DECISION_CORE_SOURCE:-legacy}' NODE_OPTIONS='--max-old-space-size=${RV_PAGE_CORE_HEAP_MB:-8192}' node scripts/ops/build-page-core-bundle.mjs --target-market-date '$TARGET_MARKET_DATE' --replace --incremental && node scripts/ops/build-stock-analyzer-provider-exceptions.mjs --target-market-date '$TARGET_MARKET_DATE' && node scripts/ops/build-stock-analyzer-ui-state-summary.mjs --latest public/data/page-core/candidates/latest.candidate.json && node scripts/universe-v7/rebuild-search-exact-from-registry.mjs && node scripts/universe-v7/verify-search-registry-sync.mjs && node scripts/ops/retention-page-core-bundles.mjs"
      ;;
    classifier_audit)
      printf '%s\n' "node scripts/audit/classifier/run-all.mjs --verbose"
      ;;
    public_history_shards)
      printf '%s\n' "NODE_OPTIONS='--max-old-space-size=${RV_PUBLIC_HISTORY_SHARDS_HEAP_MB:-4096}' node scripts/ops/build-public-history-shards.mjs --manifest '$RV_GLOBAL_MANIFEST_DIR/pack-manifest.global.json' --target-market-date='$TARGET_MARKET_DATE' --incremental"
      ;;
    stock_ui_integrity_audit)
      printf '%s\n' "node scripts/ops/audit-stock-analyzer-ui-integrity.mjs --base-url='${RV_STOCK_UI_AUDIT_BASE_URL:-${RV_PUBLIC_BASE_URL:-https://rubikvault-site.pages.dev}}' --gate=ui_renderable --min-pass-rate='${RV_STOCK_UI_AUDIT_MIN_PASS_RATE:-0.90}' --min-operational-rate='${RV_STOCK_UI_AUDIT_MIN_OPERATIONAL_RATE:-0.90}' || { audit_status=\$?; if [ \"${RV_STOCK_UI_AUDIT_HARD_GATE:-0}\" = \"1\" ]; then exit \"\$audit_status\"; fi; echo \"stock_ui_integrity_audit_warn_only exit_code=\$audit_status\" >&2; exit 0; }"
      ;;
    etf_diagnostic)
      printf '%s\n' "node scripts/learning/diagnose-best-setups-etf-drop.mjs"
      ;;
    learning_daily)
      printf '%s\n' "node scripts/learning/run-daily-learning-cycle.mjs --date='$TARGET_MARKET_DATE'"
      ;;
    decision_module_scorecard)
      printf '%s\n' "node scripts/ops/build-decision-module-scorecard.mjs"
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
    resource_budget_report)
      printf '%s\n' "node scripts/ops/check-step-resource-budgets.mjs --runs-root '$PIPELINE_ROOT/runs' --campaign '$CAMPAIGN_STAMP' --output '${NAS_OPS_ROOT:-$REPO_ROOT/var/private}/pipeline-artifacts/step-resource-budget-latest.json'"
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
    signal_performance_report)
      printf '%s\n' "node scripts/ops/build-signal-performance-report.mjs --lane='$ACTIVE_LANE'"
      ;;
    dp8_market)
      if [[ "${RV_DP8_MARKET_ENABLED:-0}" == "1" ]]; then
        printf '%s\n' "npm run dp8:market-hub && npm run dp8:market-hub:global && npm run dp8:capital-rotation && node scripts/contracts/validate-v3-artifacts.mjs"
      else
        printf '%s\n' "node -e \"console.log(JSON.stringify({schema:'rv.dp8_market_step.v1',ok:true,skipped:true,reason:'RV_DP8_MARKET_ENABLED_not_1'}))\""
      fi
      ;;
    runtime_preflight)
      printf '%s\n' "ulimit -n 8192 >/dev/null 2>&1 || true; node scripts/ops/runtime-preflight.mjs --ensure-runtime --mode=hard --timeout-ms '${RV_RUNTIME_PREFLIGHT_TIMEOUT_MS:-30000}' --min-fd-limit '${RV_RUNTIME_PREFLIGHT_MIN_FD_LIMIT:-4096}' && jq -e '.ok == true' public/data/ops/runtime-preflight-latest.json >/dev/null"
      ;;
    stock_analyzer_universe_audit)
      # pack-manifest.global goes to RV_GLOBAL_MANIFEST_DIR (NAS_OPS_ROOT/pipeline-artifacts/manifests/)
      # apply-history-touch-report runs first to ensure registry.bars_count is current before the audit.
      # Full pack scanning is data-plane work; keep release-full fast unless explicitly requested.
      # operability rebuild uses --refresh-from-registry so bars_count and targetable denominator are
      # always derived from the freshly-scanned registry rather than stale operability records.
      release_history_scan_arg=""
      if [[ "${RV_RELEASE_FULL_SCAN_EXISTING_PACKS:-0}" == "1" ]]; then
        release_history_scan_arg=" --scan-existing-packs"
      fi
      printf '%s\n' "mkdir -p '${RV_GLOBAL_MANIFEST_DIR:-${NAS_PIPELINE_ARTIFACTS_ROOT:-$NAS_OPS_ROOT/pipeline-artifacts}/manifests}' && node scripts/universe-v7/build-global-scope.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/universe-v7/rebuild-search-exact-from-registry.mjs && node scripts/universe-v7/build-index-memberships.mjs && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes '$GLOBAL_ASSET_CLASSES' && node scripts/ops/apply-history-touch-report-to-registry.mjs --allow-empty${release_history_scan_arg} && node scripts/ops/report-history-coverage.mjs --asset-classes '$GLOBAL_ASSET_CLASSES' --target-market-date '$TARGET_MARKET_DATE' && node scripts/ops/build-stock-analyzer-universe-audit.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --asset-classes '$GLOBAL_ASSET_CLASSES' --max-tickers 0 --live-sample-size 0 --concurrency '${RV_STOCK_ANALYZER_AUDIT_CONCURRENCY:-12}' --timeout-ms '${RV_STOCK_ANALYZER_AUDIT_TIMEOUT_MS:-30000}' && if [ -f public/data/ops/stock-analyzer-operability-latest.json ]; then node scripts/ops/build-stock-analyzer-operability.mjs --refresh-from-registry --registry-path public/data/universe/v7/registry/registry.ndjson.gz; else echo '{\"ok\":true,\"skipped\":\"stock_analyzer_operability_full_report_missing\"}'; fi"
      ;;
    ui_field_truth_report)
      if [[ "${RV_ALLOW_LOCAL_RUNTIME_GATES:-0}" == "1" ]]; then
        printf '%s\n' "node scripts/ops/build-ui-field-truth-report.mjs --base-url http://127.0.0.1:8788 --date='$TARGET_MARKET_DATE' --timeout-ms '${RV_UI_TRUTH_TIMEOUT_MS:-30000}'"
      else
        printf '%s\n' "node scripts/ops/build-ui-field-truth-report.mjs --page-core-only --page-core-latest-path public/data/page-core/candidates/latest.candidate.json --date='$TARGET_MARKET_DATE' --timeout-ms '${RV_UI_TRUTH_TIMEOUT_MS:-30000}'"
      fi
      ;;
    page_core_smoke)
      printf '%s\n' "node scripts/ops/build-ui-field-truth-report.mjs --page-core-only --page-core-latest-path public/data/page-core/candidates/latest.candidate.json --date='$TARGET_MARKET_DATE' --timeout-ms '${RV_UI_TRUTH_TIMEOUT_MS:-30000}'"
      ;;
    final_integrity_seal)
      printf '%s\n' "node scripts/ops/build-pipeline-runtime-report.mjs && node scripts/ops/build-hist-probs-status-summary.mjs && node scripts/ops/final-integrity-seal.mjs --target-market-date '$TARGET_MARKET_DATE' && node scripts/ops/sync-release-state-from-final-seal.mjs"
      ;;
    build_deploy_bundle)
      printf '%s\n' "node scripts/ops/build-deploy-bundle.mjs --strict"
      ;;
    pre_deploy_smoke)
      # P8: hard pre-deploy smoke matrix on the on-disk bundle. If a required
      # runtime artifact is missing or unparseable, fail BEFORE wrangler_deploy
      # so a broken candidate cannot be published. Reads the bundle root
      # (dist/pages-prod) directly — no live HTTP needed at this stage.
      printf '%s\n' "node -e \"const fs=require('node:fs');const path=require('node:path');const root=path.join(process.cwd(),'dist','pages-prod');function need(rel,key){const p=path.join(root,rel);if(!fs.existsSync(p)){console.error('pre_deploy_smoke_fail missing='+rel);process.exit(50)};let d;try{d=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){console.error('pre_deploy_smoke_fail unparseable='+rel+' err='+e.message);process.exit(51)};if(key&&!(key in d)){console.error('pre_deploy_smoke_fail missing_key='+key+' in='+rel);process.exit(52)}return d}const status=need('data/public-status.json','ui_green');const breakout=need('data/breakout/manifests/latest.json');const pageCore=need('data/page-core/latest.json','snapshot_id');console.log('pre_deploy_smoke_ok ui_green='+status.ui_green+' release_ready='+status.release_ready+' page_core_snapshot='+pageCore.snapshot_id+' target='+(status.target_market_date||'null'));process.exit(0);\""
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
  command="$(perf_wrapped_command "$step_id" "$command")"
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

  if [[ "$step_id" == "market_data_refresh" ]]; then
    purge_stale_market_refresh_state
    if ! assert_eodhd_budget "${RV_MARKET_REFRESH_MIN_EODHD_AVAILABLE_CALLS:-10000}"; then
      write_guard_blocked_result "$result_json" "$step_id" "eodhd_budget_below_floor" "$resource_class" "$heap_mb" "$mem_before_kb" "$swap_before_kb"
      write_status "guard_blocked" "eodhd_budget_below_floor" "$step_id"
      return 17
    fi
  fi

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
  if [[ "${RV_STEP_RESOURCE_SAMPLES:-1}" == "1" ]]; then
    measure_args+=(--resources-ndjson "$step_dir/resources.ndjson")
    measure_args+=(--sample-interval-sec "${RV_STEP_RESOURCE_SAMPLE_INTERVAL_SEC:-10}")
  fi

  case "$step_id" in
    build_global_scope|provider_health_preflight|q1_delta_proof_report|hist_probs|hist_probs_catchup|hist_probs_v2_shadow|snapshot|page_core_bundle|classifier_audit|public_history_shards|learning_daily|decision_module_scorecard|decision_core_outcome_bootstrap|forecast_daily|build_fundamentals|quantlab_daily_report|breakout_v12|scientific_summary|v1_audit|cutover_readiness|etf_diagnostic|stage1_ops_pack|system_status_report|resource_budget_report|data_freshness_report|pipeline_epoch|generate_meta_dashboard_data|signal_performance_report|dp8_market|runtime_preflight|stock_analyzer_universe_audit|ui_field_truth_report|stock_ui_integrity_audit|page_core_smoke|final_integrity_seal|build_deploy_bundle|pre_deploy_smoke|wrangler_deploy|code_manifest_guard|lock_policy_report)
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

  # P5: per-step retry for transient errors. Conservative — only retry steps
  # whose failure modes are typically network/cache-flake (CF propagation,
  # GitHub tarball, manifest fetch). Heavy data steps are NOT retried because
  # mid-run partial state would compound the problem.
  local max_retries=0
  case "$step_id" in
    safe_code_sync|code_manifest_guard|wrangler_deploy|smoke_release|stock_ui_integrity_audit)
      max_retries="${RV_TRANSIENT_RETRIES:-1}"
      ;;
  esac

  local cmd_status=1
  local attempt=0
  while (( attempt <= max_retries )); do
    set +e
    "${measure_args[@]}" --command "$command"
    cmd_status="$?"
    set -e
    # Retry only for step_timeout (124), explicit transient signal, or generic 1
    # for the whitelisted steps above. Guard exits (10,11,17,19) and OOM kill
    # (137) are NEVER retried — they signal real resource/budget/state issues.
    if (( cmd_status == 0 )); then break; fi
    if (( attempt >= max_retries )); then break; fi
    case "$cmd_status" in
      124|1)
        attempt=$((attempt + 1))
        sleep "$(( 30 * attempt ))"
        echo "[run_step] transient exit=$cmd_status step=$step_id retry=$attempt/$max_retries" >&2
        ;;
      *) break ;;
    esac
  done

  if [[ "$step_id" == "q1_delta_ingest" ]]; then
    nas_release_global_lock "q1-writer"
  fi

  write_step_result "$result_json" "$measure_json" "$step_id" "$resource_class" "$heap_mb" ""
  if [[ "$step_id" == "hist_probs" || "$step_id" == "hist_probs_catchup" ]]; then
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
    local steps=(
      safe_code_sync \
      code_manifest_guard \
      lock_policy_report \
      build_global_scope \
      provider_health_preflight \
      market_data_refresh \
      q1_delta_ingest \
      q1_delta_proof_report \
      build_fundamentals \
      quantlab_daily_report \
      breakout_v12 \
      scientific_summary \
      forecast_daily \
      hist_probs
    )
    if [[ "${RV_INCLUDE_HIST_PROBS_CATCHUP:-1}" == "1" ]]; then
      steps+=(hist_probs_catchup)
    fi
    steps+=( \
      hist_probs_v2_shadow \
      decision_core_shadow \
      decision_core_outcome_bootstrap \
      snapshot \
      page_core_bundle \
      classifier_audit \
      public_history_shards \
      etf_diagnostic \
      learning_daily \
      decision_module_scorecard \
      v1_audit \
      cutover_readiness \
      stage1_ops_pack \
      data_freshness_report \
      system_status_report \
      resource_budget_report \
      pipeline_epoch \
      generate_meta_dashboard_data \
      signal_performance_report \
      dp8_market
    )
    printf '%s\n' "${steps[@]}"
  else
    printf '%s\n' \
      code_manifest_guard \
      lock_policy_report \
      stock_analyzer_universe_audit \
      data_freshness_report \
      system_status_report \
      resource_budget_report \
      pipeline_epoch \
      page_core_smoke \
      classifier_audit \
      final_integrity_seal \
      system_status_report \
      generate_meta_dashboard_data \
      signal_performance_report \
      build_deploy_bundle \
      pre_deploy_smoke \
      wrangler_deploy \
      stock_ui_integrity_audit
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

if [[ "$ACTIVE_LANE" == "release-full" ]]; then
  set +e
  coverage_status="$(assert_release_coverage_current 2>&1)"
  coverage_code="$?"
  set -e
  if [[ "$coverage_code" -ne 0 ]]; then
    write_status "blocked" "history_coverage_not_current" ""
    echo "release_full_blocked=$coverage_status" >&2
    exit "$coverage_code"
  fi
  echo "$coverage_status" >&2
fi

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
  set +e
  run_step "$step_id"
  step_status="$?"
  set -e
  if [[ "$step_status" -ne 0 ]]; then
    if [[ "$step_id" == "stock_ui_integrity_audit" && "${RV_STOCK_UI_AUDIT_HARD_GATE:-0}" == "1" ]]; then
      echo "stock_ui_integrity_audit_hard_gate_failed exit_code=$step_status" >&2
      exit "$step_status"
    fi
    # P10: optional-step list. These are decision-only modules per W10/W11 split —
    # their failure must NOT kill the lane because UI-renderable doesn't depend on
    # them. Tonight 2026-05-05 hist_probs deferred (exit 23) and lost the entire
    # data-plane lane + release-full + wrangler_deploy. Treat the same family as
    # breakout_v12: log degraded, continue.
    OPTIONAL_STEPS_LIST="${RV_OPTIONAL_STEPS:-breakout_v12 hist_probs hist_probs_catchup hist_probs_v2_shadow scientific_summary etf_diagnostic dp8_market stock_ui_integrity_audit}"
    if [[ " $OPTIONAL_STEPS_LIST " == *" $step_id "* ]]; then
      echo "optional_step_degraded=$step_id exit_code=$step_status latest_unchanged=1" >&2
      write_status "running" "optional_step_degraded" "$step_id"
      continue
    fi
    exit "$step_status"
  fi
done < <(lane_steps)

if [[ -n "$START_STEP" && "$start_step_seen" -eq 0 ]]; then
  echo "invalid_start_step=$START_STEP lane=$ACTIVE_LANE" >&2
  write_status "failed" "invalid_start_step" "$START_STEP"
  exit 2
fi

write_status "completed" "lane_finished" ""
