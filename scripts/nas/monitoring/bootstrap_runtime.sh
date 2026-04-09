#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_monitoring_dirs
acquire_monitoring_lock bootstrap || exit 0
trap 'release_monitoring_lock' EXIT

ensure_monitoring_env

mkdir -p "$MONITORING_ROOT/scripts" "$MONITORING_ROOT/config" "$MONITORING_ROOT/docs"
cp -R "$MONITORING_SCRIPT_DIR/." "$MONITORING_ROOT/scripts/"

if [[ -f "$MONITORING_SCRIPT_DIR/../config/nas-monitoring.env.example" ]]; then
  cp "$MONITORING_SCRIPT_DIR/../config/nas-monitoring.env.example" "$MONITORING_ROOT/config/nas-monitoring.env.example"
fi

if [[ -f "$MONITORING_SCRIPT_DIR/../docs/nas-monitoring-runbook.md" ]]; then
  cp "$MONITORING_SCRIPT_DIR/../docs/nas-monitoring-runbook.md" "$MONITORING_ROOT/docs/nas-monitoring-runbook.md"
fi

publish_web_root
