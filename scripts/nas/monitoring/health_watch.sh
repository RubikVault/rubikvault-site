#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_monitoring_dirs
acquire_monitoring_lock collector || exit 0

SNAPSHOT_DIR="$(mktemp -d "$TMP_DIR/health-watch.XXXXXX")"
cleanup() {
  rm -rf "$SNAPSHOT_DIR" >/dev/null 2>&1 || true
  release_monitoring_lock
}
trap cleanup EXIT

collect_snapshot "$SNAPSHOT_DIR" watch
append_snapshot_events "$SNAPSHOT_DIR"
append_snapshot_process_log "$SNAPSHOT_DIR"

run_node_script "$MONITORING_SCRIPT_DIR/ingest_snapshot.mjs" \
  --monitoring-root "$MONITORING_ROOT" \
  --snapshot-dir "$SNAPSHOT_DIR" \
  --auto-daily-report-if-missing \
  --auto-daily-report-after-hour 9 \
  --history-retention-days "$HISTORY_RETENTION_DAYS"

publish_web_root

CURRENT_STATUS="$(snapshot_value "$SNAPSHOT_DIR" overall_status)"
CURRENT_SUMMARY="$(snapshot_value "$SNAPSHOT_DIR" summary)"
CURRENT_HOST="$(snapshot_value "$SNAPSHOT_DIR" hostname)"
CURRENT_TS="$(snapshot_value "$SNAPSHOT_DIR" generated_at)"

if [[ "$ALERTS_ENABLED" == "1" ]] && should_send_crit_alert "$CURRENT_STATUS"; then
  send_telegram_alert "NAS CRIT ${CURRENT_HOST} ${CURRENT_TS} ${CURRENT_SUMMARY}"
fi
