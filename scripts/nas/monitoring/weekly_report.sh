#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_monitoring_dirs
acquire_monitoring_lock_with_wait collector 300 || exit 0

SNAPSHOT_DIR="$(mktemp -d "$TMP_DIR/weekly-health.XXXXXX")"
cleanup() {
  rm -rf "$SNAPSHOT_DIR" >/dev/null 2>&1 || true
  release_monitoring_lock
}
trap cleanup EXIT

WEEK_STAMP="$(date '+%G-W%V')"
REPORT_PATH="$REPORTS_WEEKLY_DIR/${WEEK_STAMP}.md"

collect_snapshot "$SNAPSHOT_DIR" weekly
append_snapshot_events "$SNAPSHOT_DIR"
append_snapshot_process_log "$SNAPSHOT_DIR"

run_node_script "$MONITORING_SCRIPT_DIR/ingest_snapshot.mjs" \
  --monitoring-root "$MONITORING_ROOT" \
  --snapshot-dir "$SNAPSHOT_DIR" \
  --history-retention-days "$HISTORY_RETENTION_DAYS"

run_node_script "$MONITORING_SCRIPT_DIR/build_weekly_report.mjs" \
  --monitoring-root "$MONITORING_ROOT" \
  --output "$REPORT_PATH"

publish_web_root

send_email_report "NAS Weekly Trend ${WEEK_STAMP}" "$REPORT_PATH"
