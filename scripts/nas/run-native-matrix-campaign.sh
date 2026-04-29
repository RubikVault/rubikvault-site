#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

CAMPAIGN_STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
CAMPAIGN_DIR="$OPS_ROOT/runtime/native-matrix/campaigns/$CAMPAIGN_STAMP"
CAMPAIGN_LOG="$CAMPAIGN_DIR/campaign.log"
STATUS_JSON="$CAMPAIGN_DIR/status.json"
LOCK_DIR="$OPS_ROOT/runtime/native-matrix/locks/native-campaign.lock"
END_LOCAL_DATE="${END_LOCAL_DATE:-}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-20}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
MAX_CYCLES="${MAX_CYCLES:-40}"
SLEEP_BETWEEN_RUNS_SEC="${SLEEP_BETWEEN_RUNS_SEC:-20}"
SLEEP_BETWEEN_CYCLES_SEC="${SLEEP_BETWEEN_CYCLES_SEC:-180}"

MAIN_VARIANTS=(baseline_serial volume1_caches node384 node512 guarded_serial)
MAIN_STAGES=(stage1 stage2 stage3 scientific_summary)
PROBE_STAGES=(best_setups_v4 daily_audit_report cutover_readiness_report etf_diagnostic)

mkdir -p "$CAMPAIGN_DIR" "$(dirname "$LOCK_DIR")"
: > "$CAMPAIGN_LOG"
nas_ensure_runtime_roots
nas_assert_global_lock_clear "night-pipeline"
nas_assert_global_lock_clear "open-probe"
if [[ -n "$(nas_detect_q1_writer_conflict)" ]]; then
  echo "native_matrix_campaign_blocked=q1_writer_conflict" >&2
  exit 91
fi
if [[ "${NAS_NATIVE_MATRIX_GLOBAL_LOCK_HELD:-0}" != "1" ]]; then
  nas_acquire_global_lock "native-matrix"
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "native_campaign_lock_busy=$LOCK_DIR" >&2
  exit 90
fi
trap 'rm -rf "$LOCK_DIR"; if [[ "${NAS_NATIVE_MATRIX_GLOBAL_LOCK_HELD:-0}" != "1" ]]; then nas_release_global_lock "native-matrix"; fi' EXIT

target_end_iso() {
  python3 - "$END_LOCAL_DATE" "$END_LOCAL_HOUR" "$END_LOCAL_MINUTE" <<'PY'
from datetime import datetime, timedelta
import sys

date_arg, hh, mm = sys.argv[1:4]
now = datetime.now().astimezone()
if date_arg:
    year, month, day = [int(part) for part in date_arg.split("-")]
    end = now.replace(year=year, month=month, day=day, hour=int(hh), minute=int(mm), second=0, microsecond=0)
else:
    end = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    if end <= now:
        end = end + timedelta(days=1)
print(end.isoformat())
PY
}

TARGET_END_LOCAL="$(target_end_iso)"
CAMPAIGN_PID="$$"

python3 - "$STATUS_JSON" "$CAMPAIGN_STAMP" "$TARGET_END_LOCAL" "$CAMPAIGN_PID" <<'PY'
import json
import os
import sys

out_path, stamp, target_end, campaign_pid = sys.argv[1:5]
doc = {
    "schema_version": "nas.native.matrix.campaign.status.v1",
    "campaign_stamp": stamp,
    "started_at": __import__("datetime").datetime.now().astimezone().isoformat(),
    "target_end_local": target_end,
    "current_pid": int(campaign_pid),
    "last_heartbeat_at": __import__("datetime").datetime.now().astimezone().isoformat(),
    "cycles_completed": 0,
    "runs_completed": 0,
    "runs_failed": 0,
    "last_stage": None,
    "last_variant": None,
    "last_status": "running",
}
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

should_continue() {
  python3 - "$STATUS_JSON" "$MAX_CYCLES" <<'PY'
import json
import sys
from datetime import datetime

status_path, max_cycles = sys.argv[1:3]
doc = json.load(open(status_path, "r", encoding="utf-8"))
now = datetime.now().astimezone()
end = datetime.fromisoformat(doc["target_end_local"])
ok = now < end and int(doc["cycles_completed"]) < int(max_cycles)
print("yes" if ok else "no")
PY
}

update_status() {
  local phase="$1"
  local stage="${2:-}"
  local variant="${3:-}"
  local ok="${4:-yes}"
  python3 - "$STATUS_JSON" "$phase" "$stage" "$variant" "$ok" "$CAMPAIGN_PID" <<'PY'
import json
import sys

status_path, phase, stage, variant, ok, campaign_pid = sys.argv[1:7]
doc = json.load(open(status_path, "r", encoding="utf-8"))
doc["last_status"] = phase
doc["last_stage"] = stage or None
doc["last_variant"] = variant or None
doc["current_pid"] = int(campaign_pid)
doc["last_heartbeat_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
doc["runs_completed"] = int(doc.get("runs_completed", 0)) + 1
if ok != "yes":
    doc["runs_failed"] = int(doc.get("runs_failed", 0)) + 1
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

advance_cycle() {
  local cycle="$1"
  python3 - "$STATUS_JSON" "$cycle" "$CAMPAIGN_PID" <<'PY'
import json
import sys

status_path, cycle, campaign_pid = sys.argv[1:4]
doc = json.load(open(status_path, "r", encoding="utf-8"))
doc["cycles_completed"] = int(cycle)
doc["current_pid"] = int(campaign_pid)
doc["last_heartbeat_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

cycle=0
probe_index=0
while [[ "$(should_continue)" == "yes" ]]; do
  cycle=$((cycle + 1))
  variant_index=$(( (cycle - 1) % ${#MAIN_VARIANTS[@]} ))
  variant="${MAIN_VARIANTS[$variant_index]}"
  printf 'cycle=%s variant=%s at=%s\n' "$cycle" "$variant" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"

  bash "$REPO_ROOT/scripts/nas/capture-native-system-audit.sh" "${CAMPAIGN_STAMP}-cycle${cycle}-before" >> "$CAMPAIGN_LOG" 2>&1 || true
  bash "$REPO_ROOT/scripts/nas/capture-native-service-census.sh" "${CAMPAIGN_STAMP}-cycle${cycle}-before" >> "$CAMPAIGN_LOG" 2>&1 || true

  for stage in "${MAIN_STAGES[@]}"; do
    printf 'run stage=%s variant=%s start=%s\n' "$stage" "$variant" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"
    set +e
    bash "$REPO_ROOT/scripts/nas/run-native-stage-matrix.sh" "$stage" "$variant" "${CAMPAIGN_STAMP}-c${cycle}-${stage//:/-}-${variant}" >> "$CAMPAIGN_LOG" 2>&1
    run_status="$?"
    set -e
    if [[ "$run_status" -eq 0 ]]; then
      update_status "running" "$stage" "$variant" "yes"
    else
      update_status "running" "$stage" "$variant" "no"
    fi
    sleep "$SLEEP_BETWEEN_RUNS_SEC"
  done

  if (( cycle % 2 == 0 )); then
    probe_stage="${PROBE_STAGES[$probe_index]}"
    probe_index=$(( (probe_index + 1) % ${#PROBE_STAGES[@]} ))
    printf 'probe stage=%s variant=%s start=%s\n' "$probe_stage" "guarded_serial" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"
    set +e
    bash "$REPO_ROOT/scripts/nas/run-native-stage-matrix.sh" "$probe_stage" "guarded_serial" "${CAMPAIGN_STAMP}-c${cycle}-${probe_stage}-guarded" >> "$CAMPAIGN_LOG" 2>&1
    run_status="$?"
    set -e
    if [[ "$run_status" -eq 0 ]]; then
      update_status "running" "$probe_stage" "guarded_serial" "yes"
    else
      update_status "running" "$probe_stage" "guarded_serial" "no"
    fi
  fi

  bash "$REPO_ROOT/scripts/nas/capture-native-system-audit.sh" "${CAMPAIGN_STAMP}-cycle${cycle}-after" >> "$CAMPAIGN_LOG" 2>&1 || true
  bash "$REPO_ROOT/scripts/nas/capture-native-service-census.sh" "${CAMPAIGN_STAMP}-cycle${cycle}-after" >> "$CAMPAIGN_LOG" 2>&1 || true
  "$NODE_BIN" "$REPO_ROOT/scripts/nas/build-native-matrix-report.mjs" >> "$CAMPAIGN_LOG" 2>&1 || true
  advance_cycle "$cycle"
  sleep "$SLEEP_BETWEEN_CYCLES_SEC"
done

"$NODE_BIN" "$REPO_ROOT/scripts/nas/build-native-matrix-report.mjs" >> "$CAMPAIGN_LOG" 2>&1 || true

python3 - "$STATUS_JSON" "$CAMPAIGN_PID" <<'PY'
import json
import sys

path, campaign_pid = sys.argv[1:3]
doc = json.load(open(path, "r", encoding="utf-8"))
doc["finished_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
doc["current_pid"] = int(campaign_pid)
doc["last_heartbeat_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
if doc.get("last_status") != "failed":
    doc["last_status"] = "completed"
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

printf '%s\n' "$CAMPAIGN_DIR"
