#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_monitoring_dirs
acquire_monitoring_lock supervisor || exit 0
trap 'release_monitoring_lock' EXIT

ensure_monitoring_env
publish_web_root

NOW_HOUR="$(date '+%H')"
TODAY_DATE="$(date '+%Y-%m-%d')"
TODAY_REPORT="$REPORTS_DAILY_DIR/${TODAY_DATE}.md"
TODAY_WEEKLY="$REPORTS_WEEKLY_DIR/$(date '+%G-W%V').md"
PUBLIC_TODAY_REPORT="$WEB_REPORTS_DAILY_DIR/${TODAY_DATE}.md"
SUPERVISOR_ALLOWED_HOURS="${SUPERVISOR_ALLOWED_HOURS:-09 13 18}"

if [[ "${SUPERVISOR_FORCE:-0}" != "1" ]]; then
  case " $SUPERVISOR_ALLOWED_HOURS " in
    *" ${NOW_HOUR} "*) ;;
    *) exit 0 ;;
  esac
fi

if [[ ! -f "$HISTORY_CSV" ]]; then
  /bin/bash "$MONITORING_SCRIPT_DIR/health_watch.sh"
fi

if (( 10#${NOW_HOUR} >= 9 )) && [[ ! -f "$TODAY_REPORT" ]]; then
  /bin/bash "$MONITORING_SCRIPT_DIR/daily_health.sh"
fi

if [[ "$(date '+%u')" == "7" ]] && (( 10#${NOW_HOUR} >= 8 )) && [[ ! -f "$TODAY_WEEKLY" ]]; then
  /bin/bash "$MONITORING_SCRIPT_DIR/weekly_report.sh"
fi

if [[ -f "$DAILY_JSON" ]]; then
  REPORT_STATUS="$(run_node_script -e "const fs=require('fs');const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,'utf8'));process.stdout.write(String(j.overall_status||'UNKNOWN'));" "$DAILY_JSON" 2>/dev/null || printf 'UNKNOWN')"
  if [[ "$REPORT_STATUS" == "CRIT" ]]; then
    /bin/bash "$MONITORING_SCRIPT_DIR/health_watch.sh"
  fi
fi

if [[ -n "${WEB_ROOT:-}" ]]; then
  if [[ ! -f "$WEB_ROOT/index.html" || ! -f "$WEB_ROOT/data.js" ]]; then
    publish_web_root
  fi
  if [[ -f "$DASHBOARD_DIR/data.js" ]] && grep -q 'daily: null' "$DASHBOARD_DIR/data.js"; then
    /bin/bash "$MONITORING_SCRIPT_DIR/health_watch.sh"
  fi
  if (( 10#${NOW_HOUR} >= 9 )) && [[ -f "$TODAY_REPORT" && ! -f "$PUBLIC_TODAY_REPORT" ]]; then
    publish_web_root
  fi
  if command -v curl >/dev/null 2>&1; then
    if ! curl -fsS --max-time 8 -H "Host: ${HTTP_ENDPOINT_HOST}" "http://127.0.0.1/monitoring/" >/dev/null 2>&1; then
      publish_web_root
    fi
  fi
fi
