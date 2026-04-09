#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_monitoring_dirs
acquire_monitoring_lock_with_wait collector 300 || exit 0

SNAPSHOT_DIR="$(mktemp -d "$TMP_DIR/daily-health.XXXXXX")"
cleanup() {
  rm -rf "$SNAPSHOT_DIR" >/dev/null 2>&1 || true
  release_monitoring_lock
}
trap cleanup EXIT

REPORT_DATE="$(date '+%Y-%m-%d')"
REPORT_PATH="$REPORTS_DAILY_DIR/${REPORT_DATE}.md"

collect_snapshot "$SNAPSHOT_DIR" daily
append_snapshot_events "$SNAPSHOT_DIR"
append_snapshot_process_log "$SNAPSHOT_DIR"

run_node_script "$MONITORING_SCRIPT_DIR/ingest_snapshot.mjs" \
  --monitoring-root "$MONITORING_ROOT" \
  --snapshot-dir "$SNAPSHOT_DIR" \
  --markdown-path "$REPORT_PATH" \
  --history-retention-days "$HISTORY_RETENTION_DAYS"

publish_web_root

CURRENT_STATUS="$(snapshot_value "$SNAPSHOT_DIR" overall_status)"
CURRENT_SUMMARY="$(snapshot_value "$SNAPSHOT_DIR" summary)"
CURRENT_HOST="$(snapshot_value "$SNAPSHOT_DIR" hostname)"

send_email_report "NAS Daily Health ${REPORT_DATE} [${CURRENT_STATUS}]" "$REPORT_PATH"

if [[ "$CURRENT_STATUS" == "CRIT" ]]; then
  send_telegram_alert "NAS Daily Report CRIT ${CURRENT_HOST} ${REPORT_DATE} ${CURRENT_SUMMARY}"
fi
