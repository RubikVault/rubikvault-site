#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

HTTP_SERVE_ROOT="${HTTP_SERVE_ROOT:-/volume1/homes/neoboy/monitoring-web}"
HTTP_PORT="${HTTP_PORT:-8765}"
HTTP_SERVER_LOG="${HTTP_SERVER_LOG:-$LOG_DIR/http-server.log}"
DAEMON_STATE_FILE="${DAEMON_STATE_FILE:-$STATE_DIR/user_daemon.state}"

ensure_monitoring_env
ensure_monitoring_dirs
mkdir -p "$HTTP_SERVE_ROOT"

start_http_server() {
  local python_bin
  python_bin="$(first_executable python3 /usr/bin/python3 /usr/local/bin/python3 || true)"
  [[ -n "$python_bin" ]] || return 0
  if pgrep -af "http.server ${HTTP_PORT}" >/dev/null 2>&1; then
    return 0
  fi
  nohup "$python_bin" -m http.server "$HTTP_PORT" --bind 0.0.0.0 --directory "$HTTP_SERVE_ROOT" >> "$HTTP_SERVER_LOG" 2>&1 &
}

load_daemon_state() {
  LAST_WATCH_STAMP=""
  LAST_DAILY_DATE=""
  LAST_WEEKLY_STAMP=""
  LAST_SUPERVISOR_STAMP=""
  if [[ -f "$DAEMON_STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$DAEMON_STATE_FILE"
  fi
}

save_daemon_state() {
  cat > "$DAEMON_STATE_FILE" <<EOF
LAST_WATCH_STAMP=${LAST_WATCH_STAMP:-}
LAST_DAILY_DATE=${LAST_DAILY_DATE:-}
LAST_WEEKLY_STAMP=${LAST_WEEKLY_STAMP:-}
LAST_SUPERVISOR_STAMP=${LAST_SUPERVISOR_STAMP:-}
EOF
}

run_loop() {
  while true; do
    start_http_server
    load_daemon_state

    local current_minute current_hour watch_stamp today_date weekly_stamp supervisor_stamp
    current_minute="$(date '+%M')"
    current_hour="$(date '+%H')"
    watch_stamp="$(date '+%Y-%m-%dT%H:%M')"
    today_date="$(date '+%Y-%m-%d')"
    weekly_stamp="$(date '+%G-W%V')"
    supervisor_stamp="$(date '+%Y-%m-%dT%H')"

    if (( 10#${current_minute} % 5 == 0 )) && [[ "$LAST_WATCH_STAMP" != "$watch_stamp" ]]; then
      /bin/bash "$MONITORING_SCRIPT_DIR/health_watch.sh" >/dev/null 2>&1 || true
      LAST_WATCH_STAMP="$watch_stamp"
    fi

    if [[ "$current_hour" == "09" && "$current_minute" == "00" && "$LAST_DAILY_DATE" != "$today_date" ]]; then
      /bin/bash "$MONITORING_SCRIPT_DIR/daily_health.sh" >/dev/null 2>&1 || true
      LAST_DAILY_DATE="$today_date"
    fi

    if [[ "$(date '+%u')" == "7" && "$current_hour" == "08" && "$current_minute" == "00" && "$LAST_WEEKLY_STAMP" != "$weekly_stamp" ]]; then
      /bin/bash "$MONITORING_SCRIPT_DIR/weekly_report.sh" >/dev/null 2>&1 || true
      LAST_WEEKLY_STAMP="$weekly_stamp"
    fi

    if [[ "$current_minute" == "15" ]] && [[ " 09 13 18 " == *" ${current_hour} "* ]] && [[ "$LAST_SUPERVISOR_STAMP" != "$supervisor_stamp" ]]; then
      SUPERVISOR_FORCE=1 /bin/bash "$MONITORING_SCRIPT_DIR/report_supervisor.sh" >/dev/null 2>&1 || true
      LAST_SUPERVISOR_STAMP="$supervisor_stamp"
    fi

    save_daemon_state
    sleep 55
  done
}

run_loop
