#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QUANT_ROOT="${Q1_QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${Q1_PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
RUNNER="$REPO_ROOT/scripts/quantlab/run_q1_panel_stage_a_daily_local.py"

if [[ "${1:-}" == "--print-only" ]]; then
  PRINT_ONLY=1
  shift
else
  PRINT_ONLY=0
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL: python not executable: $PYTHON_BIN" >&2
  exit 2
fi

if [[ ! -f "$RUNNER" ]]; then
  echo "FATAL: runner not found: $RUNNER" >&2
  exit 2
fi

SNAPSHOT_ID="${Q1_DAILY_SNAPSHOT_ID:-}"
if [[ -z "$SNAPSHOT_ID" ]]; then
  SNAPSHOT_ID="$(
    "$PYTHON_BIN" - <<'PY'
import json
from pathlib import Path

base = Path("/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/snapshots")
cands = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
if not cands:
    raise SystemExit("NO_SNAPSHOTS")

def has_materialized_bars(snap: Path) -> bool:
    try:
        m = json.loads((snap / "snapshot_manifest.json").read_text())
    except Exception:
        return False
    bars_root = (((m.get("artifacts") or {}).get("bars_dataset_root")) or "")
    return bool(bars_root)

# Prefer snapshots that already have a materialized bars dataset and newest mtime.
materialized = [p for p in cands if has_materialized_bars(p)]
pool = materialized or cands
pool.sort(key=lambda p: (p.stat().st_mtime_ns, p.name))
print(pool[-1].name.split("=", 1)[1])
PY
  )"
fi

FEATURE_STORE_VERSION="${Q1_DAILY_FEATURE_STORE_VERSION:-v4_q1panel_fullchunk_daily}"
PANEL_OUTPUT_TAG="${Q1_DAILY_PANEL_OUTPUT_TAG:-panel60_fullchunk_daily}"
ASSET_CLASSES="${Q1_DAILY_ASSET_CLASSES:-stock,etf}"
LOOKBACK_DAYS="${Q1_DAILY_LOOKBACK_DAYS:-420}"
PANEL_DAYS="${Q1_DAILY_PANEL_DAYS:-60}"
PANEL_MAX_ASSETS="${Q1_DAILY_PANEL_MAX_ASSETS:-0}"
MIN_BARS="${Q1_DAILY_MIN_BARS:-200}"
TOP_LIQUID_N="${Q1_DAILY_TOP_LIQUID_N:-20000}"
FOLD_COUNT="${Q1_DAILY_FOLD_COUNT:-3}"
TEST_DAYS="${Q1_DAILY_TEST_DAYS:-5}"
EMBARGO_DAYS="${Q1_DAILY_EMBARGO_DAYS:-2}"
MIN_TRAIN_DAYS="${Q1_DAILY_MIN_TRAIN_DAYS:-8}"
SURVIVORS_MAX="${Q1_DAILY_SURVIVORS_MAX:-24}"
RUN_PHASEA_BACKBONE="${Q1_DAILY_RUN_PHASEA_BACKBONE:-0}"
PHASEA_INCLUDE_TYPES="${Q1_DAILY_PHASEA_INCLUDE_TYPES:-STOCK,ETF}"
PHASEA_INGEST_DATE="${Q1_DAILY_PHASEA_INGEST_DATE:-}"
PHASEA_DELTA_JOB_NAME="${Q1_DAILY_PHASEA_DELTA_JOB_NAME:-}"
PHASEA_FEATURE_STORE_VERSION="${Q1_DAILY_PHASEA_FEATURE_STORE_VERSION:-}"
PHASEA_FEATURE_OUTPUT_TAG="${Q1_DAILY_PHASEA_FEATURE_OUTPUT_TAG:-}"
PHASEA_REAL_DELTA_TEST_MODE="${Q1_DAILY_PHASEA_REAL_DELTA_TEST_MODE:-0}"
PHASEA_REAL_DELTA_MIN_ROWS="${Q1_DAILY_PHASEA_REAL_DELTA_MIN_ROWS:-1}"
PHASEA_REAL_DELTA_LIMIT_PACKS="${Q1_DAILY_PHASEA_REAL_DELTA_LIMIT_PACKS:-2}"
PHASEA_REAL_DELTA_MAX_ROWS="${Q1_DAILY_PHASEA_REAL_DELTA_MAX_ROWS:-100000}"
PHASEA_WARN_MIN_DELTA_ROWS="${Q1_DAILY_PHASEA_WARN_MIN_DELTA_ROWS:-0}"
PHASEA_WARN_MAX_DELTA_ROWS="${Q1_DAILY_PHASEA_WARN_MAX_DELTA_ROWS:-0}"
PHASEA_FAIL_MIN_DELTA_ROWS="${Q1_DAILY_PHASEA_FAIL_MIN_DELTA_ROWS:-0}"
PHASEA_FAIL_MAX_DELTA_ROWS="${Q1_DAILY_PHASEA_FAIL_MAX_DELTA_ROWS:-0}"
PHASEA_OPS_LEDGER_PATH="${Q1_DAILY_PHASEA_OPS_LEDGER_PATH:-}"
PHASEA_OPS_LEDGER_DISABLED="${Q1_DAILY_PHASEA_OPS_LEDGER_DISABLED:-0}"
RUN_STAGEB_Q1="${Q1_DAILY_RUN_STAGEB_Q1:-0}"
RUN_REGISTRY_Q1="${Q1_DAILY_RUN_REGISTRY_Q1:-0}"
STAGEB_Q1_STRICT_SURVIVORS_MAX="${Q1_DAILY_STAGEB_Q1_STRICT_SURVIVORS_MAX:-8}"
REGISTRY_SCORE_EPSILON="${Q1_DAILY_REGISTRY_SCORE_EPSILON:-0.01}"
USE_LEGACY_SHELL_POST_STEPS="${Q1_DAILY_USE_LEGACY_SHELL_POST_STEPS:-0}"

LOG_DIR="$QUANT_ROOT/logs"
mkdir -p "$LOG_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/q1_panel_stagea_daily_local_${TS}.log"
LATEST_LINK="$LOG_DIR/q1_panel_stagea_daily_local.latest.log"

CMD=(
  "$PYTHON_BIN" "$RUNNER"
  --quant-root "$QUANT_ROOT"
  --snapshot-id "$SNAPSHOT_ID"
  --feature-store-version "$FEATURE_STORE_VERSION"
  --panel-output-tag "$PANEL_OUTPUT_TAG"
  --asset-classes "$ASSET_CLASSES"
  --lookback-calendar-days "$LOOKBACK_DAYS"
  --panel-calendar-days "$PANEL_DAYS"
  --panel-max-assets "$PANEL_MAX_ASSETS"
  --min-bars "$MIN_BARS"
  --top-liquid-n "$TOP_LIQUID_N"
  --fold-count "$FOLD_COUNT"
  --test-days "$TEST_DAYS"
  --embargo-days "$EMBARGO_DAYS"
  --min-train-days "$MIN_TRAIN_DAYS"
  --survivors-max "$SURVIVORS_MAX"
)

if [[ "$RUN_PHASEA_BACKBONE" == "1" ]]; then
  CMD+=(
    --run-phasea-backbone
    --phasea-include-types "$PHASEA_INCLUDE_TYPES"
  )
  if [[ -n "$PHASEA_INGEST_DATE" ]]; then
    CMD+=(--phasea-ingest-date "$PHASEA_INGEST_DATE")
  fi
  if [[ -n "$PHASEA_DELTA_JOB_NAME" ]]; then
    CMD+=(--phasea-delta-job-name "$PHASEA_DELTA_JOB_NAME")
  fi
  if [[ -n "$PHASEA_FEATURE_STORE_VERSION" ]]; then
    CMD+=(--phasea-feature-store-version "$PHASEA_FEATURE_STORE_VERSION")
  fi
  if [[ -n "$PHASEA_FEATURE_OUTPUT_TAG" ]]; then
    CMD+=(--phasea-feature-output-tag "$PHASEA_FEATURE_OUTPUT_TAG")
  fi
  if [[ "$PHASEA_REAL_DELTA_TEST_MODE" == "1" ]]; then
    CMD+=(
      --phasea-real-delta-test-mode
      --phasea-real-delta-min-emitted-rows "$PHASEA_REAL_DELTA_MIN_ROWS"
      --phasea-real-delta-limit-packs "$PHASEA_REAL_DELTA_LIMIT_PACKS"
      --phasea-real-delta-max-emitted-rows "$PHASEA_REAL_DELTA_MAX_ROWS"
    )
  fi
  if [[ "$PHASEA_WARN_MIN_DELTA_ROWS" != "0" ]]; then
    CMD+=(--phasea-warn-min-delta-rows "$PHASEA_WARN_MIN_DELTA_ROWS")
  fi
  if [[ "$PHASEA_WARN_MAX_DELTA_ROWS" != "0" ]]; then
    CMD+=(--phasea-warn-max-delta-rows "$PHASEA_WARN_MAX_DELTA_ROWS")
  fi
  if [[ "$PHASEA_FAIL_MIN_DELTA_ROWS" != "0" ]]; then
    CMD+=(--phasea-fail-min-delta-rows "$PHASEA_FAIL_MIN_DELTA_ROWS")
  fi
  if [[ "$PHASEA_FAIL_MAX_DELTA_ROWS" != "0" ]]; then
    CMD+=(--phasea-fail-max-delta-rows "$PHASEA_FAIL_MAX_DELTA_ROWS")
  fi
  if [[ -n "$PHASEA_OPS_LEDGER_PATH" ]]; then
    CMD+=(--phasea-ops-ledger-path "$PHASEA_OPS_LEDGER_PATH")
  fi
  if [[ "$PHASEA_OPS_LEDGER_DISABLED" == "1" ]]; then
    CMD+=(--phasea-ops-ledger-disabled)
  fi
fi

if [[ "$RUN_STAGEB_Q1" == "1" ]]; then
  CMD+=(--run-stageb-q1 --stageb-q1-strict-survivors-max "$STAGEB_Q1_STRICT_SURVIVORS_MAX")
fi
if [[ "$RUN_REGISTRY_Q1" == "1" ]]; then
  CMD+=(--run-registry-q1 --registry-score-epsilon "$REGISTRY_SCORE_EPSILON")
fi

if [[ "$PRINT_ONLY" -eq 1 ]]; then
  printf 'snapshot_id=%s\n' "$SNAPSHOT_ID"
  printf 'log_file=%s\n' "$LOG_FILE"
  printf 'cmd='
  printf '%q ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

{
  echo "[q1-daily-local] started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[q1-daily-local] snapshot_id=$SNAPSHOT_ID"
  echo "[q1-daily-local] quant_root=$QUANT_ROOT"
  echo "[q1-daily-local] feature_store_version=$FEATURE_STORE_VERSION"
  echo "[q1-daily-local] panel_output_tag=$PANEL_OUTPUT_TAG"
  echo "[q1-daily-local] panel_max_assets=$PANEL_MAX_ASSETS top_liquid_n=$TOP_LIQUID_N"
  echo "[q1-daily-local] phasea_backbone=$RUN_PHASEA_BACKBONE phasea_real_delta_test=$PHASEA_REAL_DELTA_TEST_MODE"
  echo "[q1-daily-local] phasea_delta_thresholds warn_min=$PHASEA_WARN_MIN_DELTA_ROWS warn_max=$PHASEA_WARN_MAX_DELTA_ROWS fail_min=$PHASEA_FAIL_MIN_DELTA_ROWS fail_max=$PHASEA_FAIL_MAX_DELTA_ROWS"
  echo "[q1-daily-local] stageb_q1=$RUN_STAGEB_Q1 registry_q1=$RUN_REGISTRY_Q1 legacy_shell_post_steps=$USE_LEGACY_SHELL_POST_STEPS"
  printf '[q1-daily-local] cmd='
  printf '%q ' "${CMD[@]}"
  printf '\n'
} | tee "$LOG_FILE"

set +e
"${CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
RC=${PIPESTATUS[0]}
set -e

if [[ "$RC" -eq 0 && "$USE_LEGACY_SHELL_POST_STEPS" == "1" && "${Q1_DAILY_RUN_STAGEB_PREP:-0}" == "1" ]]; then
  STAGEB_PY="${Q1_STAGEB_PYTHON_BIN:-$PYTHON_BIN}"
  STAGEB_SCRIPT="$REPO_ROOT/scripts/quantlab/prepare_stage_b_q1.py"
  STAGEA_RUN_ID="$(
    "$STAGEB_PY" - <<'PY'
import json
from pathlib import Path
root = Path("/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs")
cands = sorted([p for p in root.iterdir() if p.is_dir() and p.name.startswith("run_id=q1panel_daily_local_")], key=lambda p: p.stat().st_mtime_ns)
if not cands:
    raise SystemExit(1)
status = json.loads((cands[-1] / "q1_panel_stagea_daily_run_status.json").read_text())
refs = status.get("references") or {}
cheap_path = str(refs.get("cheap_gate_report") or "")
run_id = ""
if "/runs/run_id=" in cheap_path:
    frag = cheap_path.split("/runs/run_id=", 1)[1]
    run_id = frag.split("/", 1)[0]
print(run_id)
PY
  )"
  if [[ -n "$STAGEA_RUN_ID" && -f "$STAGEB_SCRIPT" ]]; then
    {
      echo "[q1-daily-local] stage_b_prep=1 stage_a_run_id=$STAGEA_RUN_ID"
      echo "[q1-daily-local] stage_b_cmd=$STAGEB_PY $STAGEB_SCRIPT --quant-root $QUANT_ROOT --stage-a-run-id $STAGEA_RUN_ID"
    } | tee -a "$LOG_FILE"
    set +e
    "$STAGEB_PY" "$STAGEB_SCRIPT" --quant-root "$QUANT_ROOT" --stage-a-run-id "$STAGEA_RUN_ID" 2>&1 | tee -a "$LOG_FILE"
    STAGEB_RC=${PIPESTATUS[0]}
    set -e
    if [[ "$STAGEB_RC" -ne 0 ]]; then
      RC="$STAGEB_RC"
    fi
  else
    echo "[q1-daily-local] stage_b_prep skipped (missing stage_a_run_id or script)" | tee -a "$LOG_FILE"
  fi
fi

if [[ "$RC" -eq 0 && "$USE_LEGACY_SHELL_POST_STEPS" == "1" && "${Q1_DAILY_RUN_STAGEB_Q1:-0}" == "1" ]]; then
  STAGEB_Q1_PY="${Q1_STAGEB_Q1_PYTHON_BIN:-$PYTHON_BIN}"
  STAGEB_Q1_SCRIPT="$REPO_ROOT/scripts/quantlab/run_stage_b_q1.py"
  STAGEA_RUN_ID="$(
    "$STAGEB_Q1_PY" - <<'PY'
import json
from pathlib import Path
root = Path("/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs")
cands = sorted([p for p in root.iterdir() if p.is_dir() and p.name.startswith("run_id=q1panel_daily_local_")], key=lambda p: p.stat().st_mtime_ns)
if not cands:
    raise SystemExit(1)
status = json.loads((cands[-1] / "q1_panel_stagea_daily_run_status.json").read_text())
refs = status.get("references") or {}
cheap_path = str(refs.get("cheap_gate_report") or "")
run_id = ""
if "/runs/run_id=" in cheap_path:
    frag = cheap_path.split("/runs/run_id=", 1)[1]
    run_id = frag.split("/", 1)[0]
print(run_id)
PY
  )"
  if [[ -n "$STAGEA_RUN_ID" && -f "$STAGEB_Q1_SCRIPT" ]]; then
    {
      echo "[q1-daily-local] stage_b_q1=1 stage_a_run_id=$STAGEA_RUN_ID"
      echo "[q1-daily-local] stage_b_q1_cmd=$STAGEB_Q1_PY $STAGEB_Q1_SCRIPT --quant-root $QUANT_ROOT --stage-a-run-id $STAGEA_RUN_ID"
    } | tee -a "$LOG_FILE"
    set +e
    "$STAGEB_Q1_PY" "$STAGEB_Q1_SCRIPT" --quant-root "$QUANT_ROOT" --stage-a-run-id "$STAGEA_RUN_ID" 2>&1 | tee -a "$LOG_FILE"
    STAGEB_Q1_RC=${PIPESTATUS[0]}
    set -e
    if [[ "$STAGEB_Q1_RC" -ne 0 ]]; then
      RC="$STAGEB_Q1_RC"
    fi
  else
    echo "[q1-daily-local] stage_b_q1 skipped (missing stage_a_run_id or script)" | tee -a "$LOG_FILE"
  fi
fi

if [[ "$RC" -eq 0 && "$USE_LEGACY_SHELL_POST_STEPS" == "1" && "${Q1_DAILY_RUN_REGISTRY_Q1:-0}" == "1" ]]; then
  REG_PY="${Q1_REGISTRY_Q1_PYTHON_BIN:-$PYTHON_BIN}"
  REG_SCRIPT="$REPO_ROOT/scripts/quantlab/run_registry_update_q1.py"
  STAGEB_RUN_ID="$(
    "$REG_PY" - <<'PY'
import json
from pathlib import Path
root = Path("/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs")
cands = sorted([p for p in root.iterdir() if p.is_dir() and p.name.startswith("run_id=q1panel_daily_local_")], key=lambda p: p.stat().st_mtime_ns)
if not cands:
    raise SystemExit(1)
status = json.loads((cands[-1] / "q1_panel_stagea_daily_run_status.json").read_text())
refs = status.get("references") or {}
cheap_path = str(refs.get("cheap_gate_report") or "")
stage_a_run_id = ""
if "/runs/run_id=" in cheap_path:
    frag = cheap_path.split("/runs/run_id=", 1)[1]
    stage_a_run_id = frag.split("/", 1)[0]
if not stage_a_run_id:
    raise SystemExit(2)
print(f"q1stageb_{stage_a_run_id}")
PY
  )"
  if [[ -n "$STAGEB_RUN_ID" && -f "$REG_SCRIPT" ]]; then
    {
      echo "[q1-daily-local] registry_q1=1 stage_b_run_id=$STAGEB_RUN_ID"
      echo "[q1-daily-local] registry_q1_cmd=$REG_PY $REG_SCRIPT --quant-root $QUANT_ROOT --stage-b-run-id $STAGEB_RUN_ID"
    } | tee -a "$LOG_FILE"
    set +e
    "$REG_PY" "$REG_SCRIPT" --quant-root "$QUANT_ROOT" --stage-b-run-id "$STAGEB_RUN_ID" 2>&1 | tee -a "$LOG_FILE"
    REG_RC=${PIPESTATUS[0]}
    set -e
    if [[ "$REG_RC" -ne 0 ]]; then
      RC="$REG_RC"
    fi
  else
    echo "[q1-daily-local] registry_q1 skipped (missing stage_b_run_id or script)" | tee -a "$LOG_FILE"
  fi
fi

{
  echo "[q1-daily-local] exit_code=$RC"
  echo "[q1-daily-local] finished_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee -a "$LOG_FILE"

ln -sfn "$LOG_FILE" "$LATEST_LINK"
exit "$RC"
