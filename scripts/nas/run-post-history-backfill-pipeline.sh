#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

nas_ensure_runtime_roots

GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"
BACKFILL_STATE_JSON="${BACKFILL_STATE_JSON:-$NAS_RUNTIME_ROOT/history-backfill/latest.json}"
POST_STATE_JSON="$NAS_RUNTIME_ROOT/history-backfill/post-pipeline-latest.json"
STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
LOG_DIR="$NAS_RUNTIME_ROOT/history-backfill"
LOG_FILE="$LOG_DIR/post-backfill-pipeline-$STAMP.log"

mkdir -p "$LOG_DIR"

write_state() {
  local status="$1"
  local note="${2:-}"
  local exit_code="${3:-0}"
  python3 - "$POST_STATE_JSON" "$status" "$note" "$exit_code" "$LOG_FILE" "$BACKFILL_STATE_JSON" "$GLOBAL_ASSET_CLASSES" <<'PY'
import json
import os
import sys
from datetime import datetime

path, status, note, exit_code, log_file, backfill_state, asset_classes = sys.argv[1:8]
doc = {}
if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        doc = {}
now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
doc.update({
    "schema_version": "rv.post_history_backfill_pipeline.v1",
    "updated_at": now,
    "status": status,
    "note": note or None,
    "exit_code": int(exit_code),
    "log_path": log_file,
    "backfill_state_path": backfill_state,
    "asset_classes": asset_classes,
})
doc.setdefault("started_at", now)
if status in {"completed", "failed", "skipped"}:
    doc["finished_at"] = now
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

backfill_pid() {
  python3 - "$BACKFILL_STATE_JSON" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        print(int(json.load(fh).get("pid") or 0))
except Exception:
    print(0)
PY
}

backfill_alive() {
  python3 - "$BACKFILL_STATE_JSON" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        pid = int(json.load(fh).get("pid") or 0)
except Exception:
    sys.exit(1)
if pid <= 0:
    sys.exit(1)
try:
    cmdline = open(f"/proc/{pid}/cmdline", "rb").read().decode("utf-8", "replace")
except Exception:
    sys.exit(1)
if "refresh_v7_history_from_eodhd.py" in cmdline and "full_history_priority_backfill" in cmdline:
    sys.exit(0)
sys.exit(1)
PY
}

report_ok() {
  python3 - "$BACKFILL_STATE_JSON" <<'PY'
import json
import os
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        launch = json.load(fh)
    report_path = launch.get("report_path")
    if not report_path:
        raise RuntimeError("missing_report_path")
    with open(report_path, "r", encoding="utf-8") as fh:
        report = json.load(fh)
except Exception as exc:
    print(f"report_not_ready:{type(exc).__name__}:{exc}")
    sys.exit(1)
status = str(report.get("status") or "")
changed = int(report.get("assets_changed") or 0)
fetched = int(report.get("assets_fetched_with_data") or 0)
allowed = {"ok", "budget_stopped_partial", "provider_blocked_partial"}
if status == "ok" or (status in allowed and (changed > 0 or fetched > 0)):
    print(json.dumps({"status": status, "assets_changed": changed, "assets_fetched_with_data": fetched}))
    sys.exit(0)
print(json.dumps({"status": status, "assets_changed": changed, "assets_fetched_with_data": fetched}))
sys.exit(1)
PY
}

exec >>"$LOG_FILE" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] post_backfill_pipeline_start state=$BACKFILL_STATE_JSON pid=$(backfill_pid)"
write_state "waiting" "backfill_active" 0

while backfill_alive; do
  sleep "${POST_BACKFILL_POLL_SEC:-60}"
done

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] backfill_process_finished"
write_state "running" "validating_backfill_report" 0

if ! report_ok; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] post_backfill_pipeline_skipped=backfill_report_not_ok"
  write_state "skipped" "backfill_report_not_ok" 0
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] applying_history_touch_report"
node scripts/ops/apply-history-touch-report-to-registry.mjs --scan-existing-packs
node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes "$GLOBAL_ASSET_CLASSES"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] running_data_plane_from_q1_delta_ingest"
write_state "running" "data_plane_from_q1_delta_ingest" 0
RV_GLOBAL_ASSET_CLASSES="$GLOBAL_ASSET_CLASSES" bash scripts/nas/rv-nas-night-supervisor.sh --lane=data-plane --start-step=q1_delta_ingest

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] running_release_full"
write_state "running" "release_full" 0
RV_GLOBAL_ASSET_CLASSES="$GLOBAL_ASSET_CLASSES" bash scripts/nas/rv-nas-night-supervisor.sh --lane=release-full

write_state "completed" "post_backfill_pipeline_completed" 0
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] post_backfill_pipeline_completed"
