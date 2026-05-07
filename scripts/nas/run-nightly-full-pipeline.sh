#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

usage() {
  cat <<'EOF'
Usage: run-nightly-full-pipeline.sh

Runs the NAS full nightly chain: data-plane, then release-full.
No arguments are accepted.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown_arg=$arg"
      usage
      exit 64
      ;;
  esac
done

# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

nas_ensure_runtime_roots

GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"
STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SCHEDULE_LOG_DIR="$NAS_NIGHT_PIPELINE_ROOT/scheduled"
SCHEDULE_STATE_JSON="$SCHEDULE_LOG_DIR/nightly-full-latest.json"
SCHEDULE_LOG="$SCHEDULE_LOG_DIR/nightly-full-$STAMP.log"

mkdir -p "$SCHEDULE_LOG_DIR"

write_scheduler_state() {
  local status="$1"
  local lane="${2:-}"
  local exit_code="${3:-0}"
  python3 - "$SCHEDULE_STATE_JSON" "$STAMP" "$status" "$lane" "$exit_code" "$SCHEDULE_LOG" "$GLOBAL_ASSET_CLASSES" <<'PY'
import json
import os
import sys
from datetime import datetime

path, stamp, status, lane, exit_code, log_path, asset_classes = sys.argv[1:8]
doc = {}
if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        doc = {}
now = datetime.utcnow().isoformat() + "Z"
doc.update({
    "schema_version": "nas.nightly_full_pipeline.schedule.v1",
    "campaign_stamp": stamp,
    "updated_at": now,
    "status": status,
    "current_lane": lane or None,
    "exit_code": int(exit_code),
    "log_path": log_path,
    "asset_classes": asset_classes,
})
if not doc.get("started_at"):
    doc["started_at"] = now
if status in {"completed", "failed"}:
    doc["finished_at"] = now
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

run_lane() {
  local lane="$1"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] lane_start=$lane asset_classes=$GLOBAL_ASSET_CLASSES"
  write_scheduler_state "running" "$lane" 0
  set +e
  RV_GLOBAL_ASSET_CLASSES="$GLOBAL_ASSET_CLASSES" \
    bash "$REPO_ROOT/scripts/nas/rv-nas-night-supervisor.sh" --lane="$lane"
  local status="$?"
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] lane_failed=$lane exit_code=$status"
    write_scheduler_state "failed" "$lane" "$status"
    return "$status"
  fi
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] lane_completed=$lane"
  return 0
}

exec >>"$SCHEDULE_LOG" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] nightly_full_start repo=$REPO_ROOT"
write_scheduler_state "running" "" 0
run_lane "data-plane"
run_lane "release-full"
write_scheduler_state "completed" "" 0
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] nightly_full_completed"
