#!/usr/bin/env bash
set -euo pipefail

STAGE_INPUT="${1:-}"
VARIANT_ID="${2:-baseline_serial}"
STAMP="${3:-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -z "$STAGE_INPUT" ]]; then
  echo "usage: bash scripts/nas/run-native-stage-matrix.sh <stage1|stage2|stage3|scientific_summary|best_setups_v4|daily_audit_report|cutover_readiness_report|etf_diagnostic> <variant_id> [STAMP]" >&2
  exit 2
fi

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OPS_ROOT="${OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
if [[ -f "$OPS_ROOT/tooling/env.sh" ]]; then
  # shellcheck disable=SC1090
  . "$OPS_ROOT/tooling/env.sh"
fi

RUNTIME_ROOT="$OPS_ROOT/runtime/native-matrix"
RUNS_ROOT="$RUNTIME_ROOT/runs"
LOCK_ROOT="$RUNTIME_ROOT/locks"
TMP_ROOT_BASE="$OPS_ROOT/runtime/native-matrix/tmp"
CACHE_ROOT_BASE="$OPS_ROOT/runtime/native-matrix/cache"
BASELINE_ROOT="$OPS_ROOT/datasets/baselines/current"
MEASURE_SCRIPT="$REPO_ROOT/scripts/nas/measure-command.py"
COMPARE_SCRIPT="$REPO_ROOT/scripts/nas/compare-json.mjs"
PROFILE_SCRIPT="$REPO_ROOT/scripts/nas/build-hist-probs-profile-index.mjs"

mkdir -p "$RUNS_ROOT" "$LOCK_ROOT" "$TMP_ROOT_BASE" "$CACHE_ROOT_BASE"

STAGE_ID=""
STAGE_KEY=""
COMMAND=""
PATH_MANIFEST_SOURCE=""
WORK_PATH_MANIFEST_REL=""
BASELINE_STAGE=""
declare -a OUTPUTS=()
ENV_PREFIX=""
TODAY_UTC="$(date -u +%Y-%m-%d)"

case "$STAGE_INPUT" in
  stage1)
    STAGE_ID="stage1"
    STAGE_KEY="stage1"
    COMMAND="node scripts/ops/build-safety-snapshot.mjs && node scripts/ops/build-mission-control-summary.mjs && node scripts/ops/build-ops-pulse.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-1.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-1.paths"
    BASELINE_STAGE="stage1"
    OUTPUTS=("public/data/ops/safety.latest.json" "public/data/ops/summary.latest.json" "public/data/ops/pulse.json")
    ;;
  stage2)
    STAGE_ID="stage2"
    STAGE_KEY="stage2"
    COMMAND="node scripts/generate_meta_dashboard_data.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-2.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-2.paths"
    BASELINE_STAGE="stage2"
    OUTPUTS=("public/dashboard_v6_meta_data.json")
    ;;
  stage3)
    STAGE_ID="stage3"
    STAGE_KEY="stage3"
    COMMAND="QUANT_ROOT='$RUNS_ROOT/$STAGE_KEY/$VARIANT_ID/$STAMP/quant-root' HIST_PROBS_PROFILE_INDEX='tmp/nas-benchmark/hist-probs-profile-index.json' node scripts/ops/build-system-status-report.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-3.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-3.paths"
    BASELINE_STAGE="stage3"
    OUTPUTS=("public/data/reports/system-status-latest.json")
    ;;
  scientific_summary|stage4:scientific_summary)
    STAGE_ID="stage4:scientific_summary"
    STAGE_KEY="stage4-scientific_summary"
    COMMAND="node scripts/build-scientific-summary.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-4.scientific-summary.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-4.scientific-summary.paths"
    BASELINE_STAGE="stage4-scientific_summary"
    OUTPUTS=("public/data/supermodules/scientific-summary.json")
    ;;
  best_setups_v4)
    STAGE_ID="stage4:best_setups_v4"
    STAGE_KEY="stage4-best_setups_v4"
    COMMAND="ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1 node scripts/build-best-setups-v4.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-4.best-setups-v4.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-4.best-setups-v4.paths"
    BASELINE_STAGE="stage4-best_setups_v4"
    OUTPUTS=("public/data/snapshots/best-setups-v4.json")
    ;;
  daily_audit_report)
    STAGE_ID="stage4:daily_audit_report"
    STAGE_KEY="stage4-daily_audit_report"
    COMMAND="node scripts/learning/quantlab-v1/daily-audit-report.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-4.daily-audit-report.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-4.daily-audit-report.paths"
    BASELINE_STAGE="stage4-daily_audit_report"
    OUTPUTS=("public/data/reports/quantlab-v1-latest.json" "mirrors/learning/quantlab-v1/reports/${TODAY_UTC}-internal.json")
    ;;
  cutover_readiness_report)
    STAGE_ID="stage4:cutover_readiness_report"
    STAGE_KEY="stage4-cutover_readiness_report"
    COMMAND="node scripts/learning/quantlab-v1/cutover-readiness-report.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-4.cutover-readiness.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-4.cutover-readiness.paths"
    BASELINE_STAGE="stage4-cutover_readiness_report"
    OUTPUTS=("mirrors/learning/quantlab-v1/reports/cutover-readiness-${TODAY_UTC}.json")
    ;;
  etf_diagnostic)
    STAGE_ID="stage4:etf_diagnostic"
    STAGE_KEY="stage4-etf_diagnostic"
    COMMAND="node scripts/learning/diagnose-best-setups-etf-drop.mjs"
    PATH_MANIFEST_SOURCE="$REPO_ROOT/scripts/nas/inputs/stage-4.etf-diagnostic.paths"
    WORK_PATH_MANIFEST_REL="scripts/nas/inputs/stage-4.etf-diagnostic.paths"
    BASELINE_STAGE="stage4-etf_diagnostic"
    OUTPUTS=("public/data/reports/best-setups-etf-diagnostic-latest.json" "mirrors/learning/reports/best-setups-etf-diagnostic-latest.json")
    ;;
  *)
    echo "unknown_stage=$STAGE_INPUT" >&2
    exit 2
    ;;
esac

RUN_DIR="$RUNS_ROOT/$STAGE_KEY/$VARIANT_ID/$STAMP"
WORK_REPO="$RUN_DIR/repo"
WORK_QUANT_ROOT="$RUN_DIR/quant-root"
WORK_LOG="$RUN_DIR/run.log"
RESULT_JSON="$RUN_DIR/result.json"
MEASURE_JSON="$RUN_DIR/measure.json"
STDOUT_LOG="$RUN_DIR/stdout.log"
STDERR_LOG="$RUN_DIR/stderr.log"
COMPARE_DIR="$RUN_DIR/compare"
FETCH_DIR="$RUN_DIR/output"
BASELINE_STAGE_ROOT="$BASELINE_ROOT/$BASELINE_STAGE"
LOCK_DIR="$LOCK_ROOT/$STAGE_KEY.lock"

mkdir -p "$RUN_DIR" "$COMPARE_DIR" "$FETCH_DIR"
: > "$WORK_LOG"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "stage_lock_busy=$LOCK_DIR" >&2
  exit 90
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

mem_available_kb() {
  awk '/MemAvailable:/ {print $2}' /proc/meminfo
}

swap_used_kb() {
  awk '
    /SwapTotal:/ {total=$2}
    /SwapFree:/ {free=$2}
    END {print total - free}
  ' /proc/meminfo
}

write_service_health() {
  local out_path="$1"
  python3 - "$out_path" <<'PY'
import json
import subprocess
import sys

patterns = {
    "synorelayd": "synorelayd",
    "synology_photos": "synofoto|SynologyPhotos",
    "nginx": "nginx: master|nginx",
    "smb": "smbd -F --no-process-group|smbd",
}
lines = subprocess.check_output(["ps", "-ef"], text=True).splitlines()
doc = {"required": {}}
for name, pattern in patterns.items():
    matches = [line for line in lines if __import__("re").search(pattern, line)]
    doc["required"][name] = {"healthy": bool(matches), "matches": matches[:20]}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

variant_note=""
preflight_min_mem_kb=0
preflight_max_swap_used_kb=99999999
declare -a MEASURE_ENV=()

case "$VARIANT_ID" in
  baseline_serial)
    variant_note="Current baseline without extra runtime caps"
    ;;
  volume1_caches)
    variant_note="All temp and cache roots forced onto /volume1"
    MEASURE_ENV+=("TMPDIR=$TMP_ROOT_BASE/$VARIANT_ID" "XDG_CACHE_HOME=$CACHE_ROOT_BASE/$VARIANT_ID/xdg" "npm_config_cache=$CACHE_ROOT_BASE/$VARIANT_ID/npm" "UV_CACHE_DIR=$CACHE_ROOT_BASE/$VARIANT_ID/uv")
    ;;
  node384)
    variant_note="Volume1 temp/cache roots plus Node 384 MB old-space cap"
    MEASURE_ENV+=("TMPDIR=$TMP_ROOT_BASE/$VARIANT_ID" "XDG_CACHE_HOME=$CACHE_ROOT_BASE/$VARIANT_ID/xdg" "npm_config_cache=$CACHE_ROOT_BASE/$VARIANT_ID/npm" "UV_CACHE_DIR=$CACHE_ROOT_BASE/$VARIANT_ID/uv" "NODE_OPTIONS=--max-old-space-size=384")
    ;;
  node512)
    variant_note="Volume1 temp/cache roots plus Node 512 MB old-space cap"
    MEASURE_ENV+=("TMPDIR=$TMP_ROOT_BASE/$VARIANT_ID" "XDG_CACHE_HOME=$CACHE_ROOT_BASE/$VARIANT_ID/xdg" "npm_config_cache=$CACHE_ROOT_BASE/$VARIANT_ID/npm" "UV_CACHE_DIR=$CACHE_ROOT_BASE/$VARIANT_ID/uv" "NODE_OPTIONS=--max-old-space-size=512")
    ;;
  guarded_serial)
    variant_note="Volume1 temp/cache roots, Node 384 MB cap, strict preflight guard"
    MEASURE_ENV+=("TMPDIR=$TMP_ROOT_BASE/$VARIANT_ID" "XDG_CACHE_HOME=$CACHE_ROOT_BASE/$VARIANT_ID/xdg" "npm_config_cache=$CACHE_ROOT_BASE/$VARIANT_ID/npm" "UV_CACHE_DIR=$CACHE_ROOT_BASE/$VARIANT_ID/uv" "NODE_OPTIONS=--max-old-space-size=384")
    preflight_min_mem_kb=430000
    preflight_max_swap_used_kb=1500000
    ;;
  *)
    echo "unknown_variant=$VARIANT_ID" >&2
    exit 2
    ;;
esac

for env_item in "${MEASURE_ENV[@]}"; do
  key="${env_item%%=*}"
  value="${env_item#*=}"
  mkdir -p "$value" 2>/dev/null || true
  export "$key=$value"
done

MEM_BEFORE_KB="$(mem_available_kb)"
SWAP_BEFORE_KB="$(swap_used_kb)"
if (( MEM_BEFORE_KB < preflight_min_mem_kb )) || (( SWAP_BEFORE_KB > preflight_max_swap_used_kb )); then
  python3 - "$RESULT_JSON" <<PY
import json
import sys
doc = {
    "schema_version": "nas.native.matrix.result.v1",
    "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "stage_id": "$STAGE_ID",
    "variant_id": "$VARIANT_ID",
    "stamp": "$STAMP",
    "status": "guard_blocked",
    "gate": "preflight_guard",
    "variant_note": "$variant_note",
    "mem_available_before_kb": int("$MEM_BEFORE_KB"),
    "swap_used_before_kb": int("$SWAP_BEFORE_KB"),
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\\n")
PY
  printf '%s\n' "$RUN_DIR"
  exit 10
fi

mkdir -p "$WORK_REPO"
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude 'quantlab/.venv' \
  --exclude '.wrangler' \
  --exclude 'tmp' \
  --exclude 'mirrors' \
  --exclude 'public/data' \
  --exclude 'Report' \
  --exclude 'output' \
  --exclude 'data' \
  "$REPO_ROOT/" "$WORK_REPO/" >/dev/null
if [[ -d "$REPO_ROOT/node_modules" && ! -e "$WORK_REPO/node_modules" ]]; then
  ln -s "$REPO_ROOT/node_modules" "$WORK_REPO/node_modules"
fi

mkdir -p "$WORK_REPO/scripts/nas/inputs"
cp "$PATH_MANIFEST_SOURCE" "$RUN_DIR/paths-source.txt"

if [[ "$STAGE_ID" == "stage3" ]]; then
  python3 - "$PATH_MANIFEST_SOURCE" "$WORK_REPO/$WORK_PATH_MANIFEST_REL" <<'PY'
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
else
  cp "$PATH_MANIFEST_SOURCE" "$WORK_REPO/$WORK_PATH_MANIFEST_REL"
fi

while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  [[ "$rel" == \#* ]] && continue
  src="$REPO_ROOT/$rel"
  dst_parent="$WORK_REPO/$(dirname "$rel")"
  if [[ -e "$src" ]]; then
    mkdir -p "$dst_parent"
    rsync -a "$src" "$dst_parent/" >/dev/null
  fi
done < "$WORK_REPO/$WORK_PATH_MANIFEST_REL"

for rel in "${OUTPUTS[@]}"; do
  mkdir -p "$WORK_REPO/$(dirname "$rel")"
done

if [[ "$STAGE_ID" == "stage3" ]]; then
  mkdir -p "$WORK_REPO/tmp/nas-benchmark" "$WORK_QUANT_ROOT/ops/q1_daily_delta_ingest"
  node "$PROFILE_SCRIPT" --dir "$WORK_REPO/public/data/hist-probs" --output "$WORK_REPO/tmp/nas-benchmark/hist-probs-profile-index.json" >/dev/null
  if [[ -f "$BASELINE_STAGE_ROOT/quant-root/ops/q1_daily_delta_ingest/latest_success.json" ]]; then
    rsync -a "$BASELINE_STAGE_ROOT/quant-root/ops/q1_daily_delta_ingest/latest_success.json" "$WORK_QUANT_ROOT/ops/q1_daily_delta_ingest/" >/dev/null
  fi
fi

write_service_health "$RUN_DIR/service-health-before.json"
bash "$REPO_ROOT/scripts/nas/capture-native-system-audit.sh" "$STAMP-$STAGE_KEY-$VARIANT_ID-before" > "$RUN_DIR/system-audit-before.path"

set +e
python3 "$MEASURE_SCRIPT" \
  --cwd "$WORK_REPO" \
  --stdout "$STDOUT_LOG" \
  --stderr "$STDERR_LOG" \
  --json "$MEASURE_JSON" \
  $(printf -- '--set-env %q ' "${MEASURE_ENV[@]}") \
  --command "$COMMAND"
CMD_STATUS="$?"
set -e

write_service_health "$RUN_DIR/service-health-after.json"
bash "$REPO_ROOT/scripts/nas/capture-native-system-audit.sh" "$STAMP-$STAGE_KEY-$VARIANT_ID-after" > "$RUN_DIR/system-audit-after.path"

COMPARE_FAILURES=0
CONTRACT_FAILURES=0
COMPARE_REPORTS=()
for rel in "${OUTPUTS[@]}"; do
  local_out="$WORK_REPO/$rel"
  baseline_out="$BASELINE_STAGE_ROOT/$rel"
  report_name="$(printf '%s' "$rel" | tr '/' '_' | tr '.' '_').compare.json"
  report_path="$COMPARE_DIR/$report_name"
  if [[ ! -f "$local_out" ]]; then
    CONTRACT_FAILURES=$((CONTRACT_FAILURES + 1))
    COMPARE_FAILURES=$((COMPARE_FAILURES + 1))
    python3 - "$report_path" "$local_out" "$baseline_out" <<'PY'
import json
import os
import sys
doc = {
    "schema_version": "nas.compare.placeholder.v1",
    "equal": False,
    "reason": "missing_output",
    "left_exists": os.path.exists(sys.argv[2]),
    "right_exists": os.path.exists(sys.argv[3]),
    "left": sys.argv[2],
    "right": sys.argv[3],
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
  elif ! python3 - "$local_out" <<'PY'
import json
import sys
json.load(open(sys.argv[1], "r", encoding="utf-8"))
PY
  then
    CONTRACT_FAILURES=$((CONTRACT_FAILURES + 1))
    COMPARE_FAILURES=$((COMPARE_FAILURES + 1))
    python3 - "$report_path" "$local_out" "$baseline_out" <<'PY'
import json
import os
import sys
doc = {
    "schema_version": "nas.compare.placeholder.v1",
    "equal": False,
    "reason": "invalid_json_output",
    "left_exists": os.path.exists(sys.argv[2]),
    "right_exists": os.path.exists(sys.argv[3]),
    "left": sys.argv[2],
    "right": sys.argv[3],
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
  elif [[ ! -f "$baseline_out" ]]; then
    python3 - "$report_path" "$local_out" "$baseline_out" <<'PY'
import json
import os
import sys
doc = {
    "schema_version": "nas.compare.placeholder.v1",
    "equal": False,
    "reason": "missing_baseline_for_compare",
    "left_exists": os.path.exists(sys.argv[2]),
    "right_exists": os.path.exists(sys.argv[3]),
    "left": sys.argv[2],
    "right": sys.argv[3],
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
  else
    set +e
    node "$COMPARE_SCRIPT" --left "$baseline_out" --right "$local_out" --report "$report_path" >> "$WORK_LOG" 2>&1
    COMPARE_STATUS="$?"
    set -e
    if [[ "$COMPARE_STATUS" -ne 0 ]]; then
      COMPARE_FAILURES=$((COMPARE_FAILURES + 1))
    fi
  fi
  COMPARE_REPORTS+=("$report_path")
done

MEM_AFTER_KB="$(mem_available_kb)"
SWAP_AFTER_KB="$(swap_used_kb)"
SWAP_DELTA_KB=$((SWAP_AFTER_KB - SWAP_BEFORE_KB))
STATUS_LABEL="success"
GATE="completed"
if [[ "$CMD_STATUS" -ne 0 ]]; then
  STATUS_LABEL="failed"
  GATE="command_failed"
elif [[ "$CONTRACT_FAILURES" -ne 0 ]]; then
  STATUS_LABEL="failed"
  GATE="contract_failed"
elif [[ "$COMPARE_FAILURES" -ne 0 ]]; then
  STATUS_LABEL="success_with_drift"
  GATE="parity_mismatch"
fi

python3 - "$RESULT_JSON" "$MEASURE_JSON" "$RUN_DIR/service-health-before.json" "$RUN_DIR/service-health-after.json" "$COMPARE_DIR" <<PY
import json
import pathlib
import sys

result_path, measure_path, health_before_path, health_after_path, compare_dir = sys.argv[1:6]
measure = json.loads(pathlib.Path(measure_path).read_text(encoding="utf-8"))
health_before = json.loads(pathlib.Path(health_before_path).read_text(encoding="utf-8"))
health_after = json.loads(pathlib.Path(health_after_path).read_text(encoding="utf-8"))
compare_reports = []
all_equal = True
for path in sorted(pathlib.Path(compare_dir).glob("*.json")):
    doc = json.loads(path.read_text(encoding="utf-8"))
    equal = bool(doc.get("equal"))
    all_equal = all_equal and equal
    compare_reports.append({
        "path": str(path),
        "equal": equal,
        "reason": doc.get("reason"),
    })
doc = {
    "schema_version": "nas.native.matrix.result.v1",
    "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "stage_id": "$STAGE_ID",
    "stage_key": "$STAGE_KEY",
    "variant_id": "$VARIANT_ID",
    "variant_note": "$variant_note",
    "stamp": "$STAMP",
    "repo_root": "$REPO_ROOT",
    "work_repo": "$WORK_REPO",
    "baseline_stage_root": "$BASELINE_STAGE_ROOT",
    "status": "$STATUS_LABEL",
    "gate": "$GATE",
    "command_exit_code": int("$CMD_STATUS"),
    "contract_failures": int("$CONTRACT_FAILURES"),
    "compare_failures": int("$COMPARE_FAILURES"),
    "outputs_equal": all_equal,
    "duration_sec": measure.get("duration_sec"),
    "peak_rss_mb": measure.get("peak_rss_mb"),
    "avg_rss_mb": measure.get("avg_rss_mb"),
    "peak_pcpu": measure.get("peak_pcpu"),
    "cpu_window": measure.get("cpu_window"),
    "mem_available_before_mb": round(int("$MEM_BEFORE_KB") / 1024, 2),
    "mem_available_after_mb": round(int("$MEM_AFTER_KB") / 1024, 2),
    "swap_used_before_mb": round(int("$SWAP_BEFORE_KB") / 1024, 2),
    "swap_used_after_mb": round(int("$SWAP_AFTER_KB") / 1024, 2),
    "swap_delta_mb": round(int("$SWAP_DELTA_KB") / 1024, 2),
    "required_services_before": health_before.get("required", {}),
    "required_services_after": health_after.get("required", {}),
    "compare_reports": compare_reports,
}
pathlib.Path(result_path).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
PY

printf '%s\n' "$RUN_DIR"
if [[ "$STATUS_LABEL" == "failed" ]]; then
  exit 1
fi
