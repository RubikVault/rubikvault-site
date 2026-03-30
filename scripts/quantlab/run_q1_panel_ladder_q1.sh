#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

QUANT_ROOT="${QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
FEATURE_STORE_VERSION="${FEATURE_STORE_VERSION:-v4_q1panel_micro}"
ASSET_CLASSES="${ASSET_CLASSES:-stock,etf}"
LOOKBACK_CAL_DAYS="${LOOKBACK_CAL_DAYS:-420}"
PANEL_CAL_DAYS="${PANEL_CAL_DAYS:-60}"
PANEL_MAX_ASSETS="${PANEL_MAX_ASSETS:-3000}"
MIN_BARS="${MIN_BARS:-200}"
TOP_LIQUID_LIST="${TOP_LIQUID_LIST:-500,1000,2000,3000}"
ASOF_END_DATE="${ASOF_END_DATE:-2026-02-17}"
REDFLAGS_FAILURE_MODE="${REDFLAGS_FAILURE_MODE:-warn}"
STOP_ON_FAIL="${STOP_ON_FAIL:-1}"
STAGEB_MIN_SURVIVORS_B_Q1="${STAGEB_MIN_SURVIVORS_B_Q1:-1}"
STAGEB_SURVIVORS_B_Q1_FAILURE_MODE="${STAGEB_SURVIVORS_B_Q1_FAILURE_MODE:-hard}"
STAGEB_CPCV_LIGHT_MIN_PATHS_TOTAL="${STAGEB_CPCV_LIGHT_MIN_PATHS_TOTAL:-3}"
STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATHS="${STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATHS:-3}"
STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATH_RATIO="${STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATH_RATIO:-0.50}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL: python not executable: $PYTHON_BIN" >&2
  exit 2
fi

if [[ -z "${SNAPSHOT_ID:-}" ]]; then
  latest_snapshot="$(ls -1dt "$QUANT_ROOT"/data/snapshots/snapshot_id=* 2>/dev/null | head -n 1 || true)"
  if [[ -z "$latest_snapshot" ]]; then
    echo "FATAL: no snapshot found under $QUANT_ROOT/data/snapshots" >&2
    exit 2
  fi
  SNAPSHOT_ID="${latest_snapshot##*=}"
fi

ts="$(date +%Y%m%d_%H%M%S)"
JOB_DIR="$QUANT_ROOT/jobs/q1_panel_ladder_$ts"
mkdir -p "$JOB_DIR"
LOG_FILE="$JOB_DIR/ladder.log"
SUMMARY_FILE="$JOB_DIR/summary.tsv"
echo -e "top_liquid\trc\trun_id\tstatus_path\torchestrator_report\tok" > "$SUMMARY_FILE"

echo "[q1-ladder] job_dir=$JOB_DIR" | tee -a "$LOG_FILE"
echo "[q1-ladder] snapshot_id=$SNAPSHOT_ID feature_store=$FEATURE_STORE_VERSION panel_max_assets=$PANEL_MAX_ASSETS tops=$TOP_LIQUID_LIST" | tee -a "$LOG_FILE"

IFS=',' read -r -a tops <<< "$TOP_LIQUID_LIST"
overall_rc=0
for top in "${tops[@]}"; do
  top="$(echo "$top" | xargs)"
  [[ -n "$top" ]] || continue
  tag="ladder_p${PANEL_CAL_DAYS}_top${top}_${ts}"
  echo "[q1-ladder] START top=$top tag=$tag" | tee -a "$LOG_FILE"

  out="$("$PYTHON_BIN" scripts/quantlab/run_q1_panel_stage_a_daily_local.py \
    --quant-root "$QUANT_ROOT" \
    --snapshot-id "$SNAPSHOT_ID" \
    --feature-store-version "$FEATURE_STORE_VERSION" \
    --panel-output-tag "$tag" \
    --asset-classes "$ASSET_CLASSES" \
    --lookback-calendar-days "$LOOKBACK_CAL_DAYS" \
    --panel-calendar-days "$PANEL_CAL_DAYS" \
    --panel-max-assets "$PANEL_MAX_ASSETS" \
    --min-bars "$MIN_BARS" \
    --top-liquid-n "$top" \
    --fold-count 3 \
    --test-days 5 \
    --embargo-days 2 \
    --min-train-days 8 \
    --survivors-max 24 \
    --asof-end-date "$ASOF_END_DATE" \
    --run-stageb-q1 \
    --run-registry-q1 \
    --run-redflags-q1 \
    --redflags-failure-mode "$REDFLAGS_FAILURE_MODE" \
    --stageb-min-survivors-b-q1 "$STAGEB_MIN_SURVIVORS_B_Q1" \
    --stageb-survivors-b-q1-failure-mode "$STAGEB_SURVIVORS_B_Q1_FAILURE_MODE" \
    --stageb-cpcv-light-min-effective-paths "$STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATHS" \
    --stageb-cpcv-light-min-effective-path-ratio "$STAGEB_CPCV_LIGHT_MIN_EFFECTIVE_PATH_RATIO" \
    --stageb-cpcv-light-min-paths-total "$STAGEB_CPCV_LIGHT_MIN_PATHS_TOTAL" 2>&1)"
  rc=$?
  echo "$out" | tee -a "$LOG_FILE"

  run_id="$(echo "$out" | awk -F= '/^run_id=/{print $2}' | tail -n1)"
  status_path="$(echo "$out" | awk -F= '/^status=/{print $2}' | tail -n1)"
  orch="$(echo "$out" | awk -F= '/^orchestrator_report=/{print $2}' | tail -n1)"
  ok="$(echo "$out" | awk -F= '/^ok=/{print $2}' | tail -n1)"
  echo -e "${top}\t${rc}\t${run_id}\t${status_path}\t${orch}\t${ok}" >> "$SUMMARY_FILE"
  echo "[q1-ladder] END top=$top rc=$rc ok=${ok:-unknown}" | tee -a "$LOG_FILE"

  if [[ "$rc" -ne 0 ]]; then
    overall_rc=$rc
    if [[ "$STOP_ON_FAIL" == "1" ]]; then
      echo "[q1-ladder] STOP_ON_FAIL=1; stopping after top=$top" | tee -a "$LOG_FILE"
      break
    fi
  fi
done

echo "[q1-ladder] done rc=$overall_rc summary=$SUMMARY_FILE" | tee -a "$LOG_FILE"
exit "$overall_rc"
