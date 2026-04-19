#!/usr/bin/env bash
set -euo pipefail

MONITORING_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_ROOT="${MONITORING_ROOT:-/volume1/monitoring}"
MONITORING_ENV_FILE="${MONITORING_ENV_FILE:-$MONITORING_ROOT/config/monitoring.env}"

if [[ -f "$MONITORING_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$MONITORING_ENV_FILE"
fi

export TZ="${TZ:-Europe/Berlin}"
VOLUME_PATH="${VOLUME_PATH:-/volume1}"
WEB_ROOT="${WEB_ROOT:-/volume1/web/monitoring}"
HTTP_ENDPOINT_ENABLED="${HTTP_ENDPOINT_ENABLED:-1}"
HTTP_ENDPOINT_HOST="${HTTP_ENDPOINT_HOST:-192.168.188.21}"
HTTP_ENDPOINT_EXTRA_SERVER_NAMES="${HTTP_ENDPOINT_EXTRA_SERVER_NAMES:-100.98.90.69 neonas.taila2701e.ts.net}"
HTTP_ENDPOINT_SITE_NAME="${HTTP_ENDPOINT_SITE_NAME:-zz-monitoring.conf}"
EMAIL_TO="${EMAIL_TO:-}"
EMAIL_REPORTS_ENABLED="${EMAIL_REPORTS_ENABLED:-1}"
SMTP_FROM="${SMTP_FROM:-nas-monitoring@localhost}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_SECURE="${SMTP_SECURE:-starttls}"
TELEGRAM_ALERTS_ENABLED="${TELEGRAM_ALERTS_ENABLED:-1}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
ALERTS_ENABLED="${ALERTS_ENABLED:-1}"
ALERT_COOLDOWN_SEC="${ALERT_COOLDOWN_SEC:-3600}"
SYSTEM_LOG_FILES="${SYSTEM_LOG_FILES:-/var/log/messages /var/log/kern.log}"
HISTORY_RETENTION_DAYS="${HISTORY_RETENTION_DAYS:-90}"
EVENT_RETENTION_LINES="${EVENT_RETENTION_LINES:-5000}"
PROCESS_RETENTION_LINES="${PROCESS_RETENTION_LINES:-20000}"
CPU_WARN_PER_CORE="${CPU_WARN_PER_CORE:-0.80}"
CPU_CRIT_PER_CORE="${CPU_CRIT_PER_CORE:-1.00}"
CPU_CRIT5_PER_CORE="${CPU_CRIT5_PER_CORE:-1.25}"
RAM_WARN_PCT="${RAM_WARN_PCT:-85}"
RAM_CRIT_PCT="${RAM_CRIT_PCT:-92}"
VOLUME_WARN_PCT="${VOLUME_WARN_PCT:-85}"
VOLUME_CRIT_PCT="${VOLUME_CRIT_PCT:-92}"
DISK_TEMP_WARN_C="${DISK_TEMP_WARN_C:-45}"
DISK_TEMP_CRIT_C="${DISK_TEMP_CRIT_C:-50}"
REPO_ROOTS="${REPO_ROOTS:-/volume1/homes/neoboy/RepoOps/rubikvault-site:/volume1/homes/neoboy/Dev/rubikvault-site:/volume1/homes/neoboy/QuantLabHot}"

DATA_DIR="$MONITORING_ROOT/data"
STATE_DIR="$DATA_DIR/state"
OFFSET_DIR="$STATE_DIR/offsets"
LOCK_DIR="$STATE_DIR/locks"
TMP_DIR="$STATE_DIR/tmp"
LOG_DIR="$MONITORING_ROOT/logs"
CONFIG_DIR="$MONITORING_ROOT/config"
DASHBOARD_DIR="$MONITORING_ROOT/dashboard"
REPO_DASHBOARD_DIR="$MONITORING_SCRIPT_DIR/dashboard"
REPORTS_DAILY_DIR="$MONITORING_ROOT/reports/daily"
REPORTS_WEEKLY_DIR="$MONITORING_ROOT/reports/weekly"
EVENTS_LOG="$DATA_DIR/events.log"
PROCESS_LOG="$DATA_DIR/process.log"
HISTORY_CSV="$DATA_DIR/history.csv"
DAILY_JSON="$DATA_DIR/daily.json"
ALERT_STATE_FILE="$STATE_DIR/alert_state.env"
RUNTIME_LOG="$LOG_DIR/monitoring.log"
WEB_REPORTS_DIR="$WEB_ROOT/reports"
WEB_REPORTS_DAILY_DIR="$WEB_REPORTS_DIR/daily"
WEB_REPORTS_WEEKLY_DIR="$WEB_REPORTS_DIR/weekly"
HTTP_ENDPOINT_CONFIG_DIR="$CONFIG_DIR/nginx"
HTTP_ENDPOINT_CONFIG_PATH="$HTTP_ENDPOINT_CONFIG_DIR/$HTTP_ENDPOINT_SITE_NAME"
HTTP_ENDPOINT_LINK_PATH="/usr/local/etc/nginx/sites-enabled/$HTTP_ENDPOINT_SITE_NAME"

first_executable() {
  local candidate
  for candidate in "$@"; do
    [[ -n "$candidate" ]] || continue
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

NODE_BIN="${NODE_BIN:-}"
SMARTCTL_BIN="${SMARTCTL_BIN:-}"
SENDMAIL_BIN="${SENDMAIL_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(first_executable node /var/packages/Node.js_v20/target/usr/local/bin/node /usr/local/bin/node /volume1/homes/neoboy/RepoOps/rubikvault-site/tooling/bin/node || true)"
fi
if [[ -z "$SMARTCTL_BIN" ]]; then
  SMARTCTL_BIN="$(first_executable smartctl /usr/sbin/smartctl /usr/local/sbin/smartctl || true)"
fi
if [[ -z "$SENDMAIL_BIN" ]]; then
  SENDMAIL_BIN="$(first_executable sendmail /usr/sbin/sendmail /usr/bin/sendmail || true)"
fi

ensure_monitoring_dirs() {
  mkdir -p "$CONFIG_DIR" "$DATA_DIR" "$STATE_DIR" "$OFFSET_DIR" "$LOCK_DIR" "$TMP_DIR" "$LOG_DIR" "$REPORTS_DAILY_DIR" "$REPORTS_WEEKLY_DIR" "$DASHBOARD_DIR"
}

find_monitoring_env_template() {
  local candidate
  for candidate in \
    "$CONFIG_DIR/nas-monitoring.env.example" \
    "$MONITORING_SCRIPT_DIR/../config/nas-monitoring.env.example" \
    "$MONITORING_SCRIPT_DIR/../../config/nas-monitoring.env.example" \
    "$MONITORING_SCRIPT_DIR/../../../config/nas-monitoring.env.example"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_monitoring_env() {
  ensure_monitoring_dirs
  if [[ ! -f "$MONITORING_ENV_FILE" ]]; then
    local template_path
    template_path="$(find_monitoring_env_template || true)"
    if [[ -n "$template_path" ]]; then
      cp "$template_path" "$MONITORING_ENV_FILE"
    fi
  fi
}

ensure_web_root() {
  [[ -n "$WEB_ROOT" ]] || return 1
  mkdir -p "$WEB_ROOT" "$WEB_REPORTS_DAILY_DIR" "$WEB_REPORTS_WEEKLY_DIR"
}

is_root_user() {
  [[ "$(id -u)" == "0" ]]
}

seed_dashboard_assets() {
  ensure_monitoring_dirs
  [[ -d "$REPO_DASHBOARD_DIR" ]] || return 0
  mkdir -p "$DASHBOARD_DIR" "$DASHBOARD_DIR/vendor"
  local asset
  for asset in index.html app.js styles.css; do
    [[ -f "$REPO_DASHBOARD_DIR/$asset" ]] || continue
    cp "$REPO_DASHBOARD_DIR/$asset" "$DASHBOARD_DIR/$asset"
  done
  if [[ -d "$REPO_DASHBOARD_DIR/vendor" ]]; then
    cp -R "$REPO_DASHBOARD_DIR/vendor/." "$DASHBOARD_DIR/vendor/"
  fi
  if [[ ! -f "$DASHBOARD_DIR/data.js" && -f "$REPO_DASHBOARD_DIR/data.js" ]]; then
    cp "$REPO_DASHBOARD_DIR/data.js" "$DASHBOARD_DIR/data.js"
  fi
}

runtime_log() {
  ensure_monitoring_dirs
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$RUNTIME_LOG"
}

sanitize_inline() {
  printf '%s' "$1" | tr '\r\n\t' '   ' | sed 's/|/\//g; s/[[:space:]][[:space:]]*/ /g; s/^ //; s/ $//'
}

truncate_inline() {
  local value
  local max_len="${2:-220}"
  value="$(sanitize_inline "$1")"
  if (( ${#value} > max_len )); then
    value="${value:0:max_len-3}..."
  fi
  printf '%s' "$value"
}

float_ge() {
  awk -v lhs="$1" -v rhs="$2" 'BEGIN { exit !((lhs + 0) >= (rhs + 0)) }'
}

severity_rank() {
  case "${1:-OK}" in
    OK) echo 0 ;;
    WARN) echo 1 ;;
    CRIT) echo 2 ;;
    *) echo 0 ;;
  esac
}

merge_status() {
  local best="OK"
  local current
  for current in "$@"; do
    if (( "$(severity_rank "$current")" > "$(severity_rank "$best")" )); then
      best="$current"
    fi
  done
  printf '%s\n' "$best"
}

score_threshold() {
  local value="$1"
  local warn="$2"
  local crit="$3"
  if float_ge "$value" "$crit"; then
    printf 'CRIT\n'
  elif float_ge "$value" "$warn"; then
    printf 'WARN\n'
  else
    printf 'OK\n'
  fi
}

format_duration() {
  local total="${1:-0}"
  local days hours minutes
  days=$(( total / 86400 ))
  hours=$(( (total % 86400) / 3600 ))
  minutes=$(( (total % 3600) / 60 ))
  if (( days > 0 )); then
    printf '%sd %sh %sm' "$days" "$hours" "$minutes"
  else
    printf '%sh %sm' "$hours" "$minutes"
  fi
}

join_with_plus() {
  local sep=""
  local item
  for item in "$@"; do
    [[ -n "$item" ]] || continue
    printf '%s%s' "$sep" "$item"
    sep=' + '
  done
}

to_state_path() {
  printf '%s\n' "$1" | tr '/.' '__'
}

trim_file_to_lines() {
  local file_path="$1"
  local keep_lines="$2"
  [[ -f "$file_path" ]] || return 0
  local line_count
  line_count="$(wc -l < "$file_path" | tr -d ' ')"
  if [[ -n "$line_count" ]] && (( line_count > keep_lines )); then
    tail -n "$keep_lines" "$file_path" > "${file_path}.trim"
    mv "${file_path}.trim" "$file_path"
  fi
}

run_node_script() {
  [[ -n "$NODE_BIN" ]] || {
    runtime_log "node binary not found"
    return 127
  }
  "$NODE_BIN" "$@"
}

write_if_changed() {
  local destination="$1"
  local tmp_path="$2"
  if [[ -f "$destination" ]] && cmp -s "$destination" "$tmp_path"; then
    rm -f "$tmp_path"
    return 1
  fi
  mv "$tmp_path" "$destination"
  return 0
}

reload_nginx_if_available() {
  if [[ -x /usr/bin/nginx ]]; then
    /usr/bin/nginx -t -c /etc/nginx/nginx.conf.run >/dev/null 2>&1 || /usr/bin/nginx -t >/dev/null 2>&1 || return 1
    kill -HUP "$(cat /run/nginx.pid 2>/dev/null)" >/dev/null 2>&1 || /usr/bin/nginx -s reload >/dev/null 2>&1 || true
    return 0
  fi
  return 1
}

ensure_http_endpoint() {
  [[ "$HTTP_ENDPOINT_ENABLED" == "1" ]] || return 0
  is_root_user || return 0
  ensure_monitoring_env
  ensure_web_root || return 0
  mkdir -p "$HTTP_ENDPOINT_CONFIG_DIR"

  local tmp_path link_target changed=0
  tmp_path="$(mktemp "$TMP_DIR/http-endpoint.XXXXXX")"
  cat > "$tmp_path" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${HTTP_ENDPOINT_HOST} ${HTTP_ENDPOINT_EXTRA_SERVER_NAMES};

    location = /monitoring {
        return 301 /monitoring/;
    }

    location /monitoring/ {
        alias ${WEB_ROOT}/;
        index index.html;
        add_header Cache-Control "no-cache";
    }

    location / {
        return 302 http://\$host:5000/;
    }
}
EOF

  if write_if_changed "$HTTP_ENDPOINT_CONFIG_PATH" "$tmp_path"; then
    changed=1
  fi

  link_target="$(readlink "$HTTP_ENDPOINT_LINK_PATH" 2>/dev/null || true)"
  if [[ "$link_target" != "$HTTP_ENDPOINT_CONFIG_PATH" ]]; then
    rm -f "$HTTP_ENDPOINT_LINK_PATH"
    ln -s "$HTTP_ENDPOINT_CONFIG_PATH" "$HTTP_ENDPOINT_LINK_PATH"
    changed=1
  fi

  if (( changed > 0 )); then
    reload_nginx_if_available || runtime_log "nginx reload skipped"
  fi
}

publish_web_root() {
  ensure_monitoring_env
  seed_dashboard_assets
  ensure_web_root || return 0
  if ! ensure_http_endpoint; then
    runtime_log "http endpoint setup skipped"
  fi
  cp -R "$DASHBOARD_DIR/." "$WEB_ROOT/"
  if [[ -f "$DAILY_JSON" ]]; then
    cp "$DAILY_JSON" "$WEB_ROOT/daily.json"
  fi
  if [[ -f "$HISTORY_CSV" ]]; then
    cp "$HISTORY_CSV" "$WEB_ROOT/history.csv"
  fi
  if [[ -f "$EVENTS_LOG" ]]; then
    cp "$EVENTS_LOG" "$WEB_ROOT/events.log"
  fi
  if [[ -f "$PROCESS_LOG" ]]; then
    cp "$PROCESS_LOG" "$WEB_ROOT/process.log"
  fi
  find "$REPORTS_DAILY_DIR" -maxdepth 1 -type f -name '*.md' -exec cp {} "$WEB_REPORTS_DAILY_DIR/" \; 2>/dev/null || true
  find "$REPORTS_WEEKLY_DIR" -maxdepth 1 -type f -name '*.md' -exec cp {} "$WEB_REPORTS_WEEKLY_DIR/" \; 2>/dev/null || true
}

acquire_monitoring_lock() {
  ensure_monitoring_dirs
  local name="${1:-collector}"
  local dir="$LOCK_DIR/$name.lock"
  local pid

  if mkdir "$dir" 2>/dev/null; then
    printf '%s\n' "$$" > "$dir/pid"
    MONITORING_LOCK_DIR="$dir"
    return 0
  fi

  if [[ -f "$dir/pid" ]]; then
    pid="$(tr -d '[:space:]' < "$dir/pid" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" >/dev/null 2>&1; then
      runtime_log "lock busy: $dir pid=$pid"
      return 1
    fi
  fi

  rm -rf "$dir"
  mkdir "$dir"
  printf '%s\n' "$$" > "$dir/pid"
  MONITORING_LOCK_DIR="$dir"
}

acquire_monitoring_lock_with_wait() {
  local name="${1:-collector}"
  local wait_seconds="${2:-180}"
  local started_at elapsed
  started_at="$(date '+%s')"

  while true; do
    if acquire_monitoring_lock "$name"; then
      return 0
    fi
    elapsed=$(( $(date '+%s') - started_at ))
    if (( elapsed >= wait_seconds )); then
      runtime_log "lock wait timeout: $name after ${wait_seconds}s"
      return 1
    fi
    sleep 5
  done
}

release_monitoring_lock() {
  if [[ -n "${MONITORING_LOCK_DIR:-}" ]]; then
    rm -rf "$MONITORING_LOCK_DIR" >/dev/null 2>&1 || true
  fi
}

parse_syslog_timestamp() {
  local raw="$1"
  local current_year
  current_year="$(date '+%Y')"
  if [[ "$raw" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
    printf '%s\n' "$raw"
    return 0
  fi
  LC_ALL=C date -d "$current_year $raw" '+%Y-%m-%dT%H:%M:%S%z' 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z'
}

log_level_from_line() {
  local line
  line="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  if printf '%s' "$line" | grep -Eq 'critical|fatal|panic|segfault|degraded|failed|failure|i/o error|offline|smart.*(fail|error)|temperature.*(critical|high)|disk.*error|raid.*error'; then
    printf 'CRIT\n'
  elif printf '%s' "$line" | grep -Eq 'warn|warning|recover|resync|check|scrub'; then
    printf 'WARN\n'
  else
    printf 'INFO\n'
  fi
}

is_relevant_log_line() {
  printf '%s' "$1" | grep -Eqi 'warn|warning|error|critical|fatal|fail|degrad|raid|smart|temperature|overheat|md[0-9]|i/o error|offline'
}

normalize_log_line() {
  local line="$1"
  local ts_part message level timestamp
  ts_part="$(printf '%s' "$line" | awk '{print $1" "$2" "$3}')"
  timestamp="$(parse_syslog_timestamp "$ts_part")"
  message="$(printf '%s' "$line" | sed 's/^[A-Z][a-z][a-z][[:space:]]\+[ 0-9][0-9][[:space:]][0-9:]\{8\}[[:space:]]\+//')"
  message="$(truncate_inline "$message" 280)"
  level="$(log_level_from_line "$line")"
  printf '%s | %s | %s\n' "$timestamp" "$level" "$message"
}

capture_incremental_events() {
  local output_path="$1"
  local file_path
  : > "$output_path"
  ensure_monitoring_dirs

  # shellcheck disable=SC2206
  local log_files=( $SYSTEM_LOG_FILES )
  for file_path in "${log_files[@]}"; do
    [[ -f "$file_path" && -r "$file_path" ]] || continue
    while IFS= read -r line; do
      is_relevant_log_line "$line" || continue
      normalize_log_line "$line" >> "$output_path"
    done < <(tail -n 400 "$file_path" 2>/dev/null || true)
  done

  if [[ -s "$output_path" ]]; then
    tail -n 80 "$output_path" | awk '!seen[$0]++' > "${output_path}.uniq"
    mv "${output_path}.uniq" "$output_path"
  fi
}

capture_recent_logs() {
  local output_path="$1"
  local file_path
  printf 'timestamp\tlevel\tmessage\n' > "$output_path"

  # shellcheck disable=SC2206
  local log_files=( $SYSTEM_LOG_FILES )
  for file_path in "${log_files[@]}"; do
    [[ -f "$file_path" && -r "$file_path" ]] || continue
    while IFS= read -r line; do
      is_relevant_log_line "$line" || continue
      normalize_log_line "$line"
    done < <(tail -n 300 "$file_path" 2>/dev/null || true)
  done | tail -n 12 | awk '!seen[$0]++' | while IFS='|' read -r ts level message; do
    printf '%s\t%s\t%s\n' "$(sanitize_inline "$ts")" "$(sanitize_inline "$level")" "$(sanitize_inline "$message")" >> "$output_path"
  done
}

discover_disk_scan() {
  local output_path="$1"
  local line device extra label
  : > "$output_path"

  if [[ -n "$SMARTCTL_BIN" ]] && "$SMARTCTL_BIN" --scan-open >/dev/null 2>&1; then
    while IFS= read -r line; do
      line="${line%%#*}"
      line="$(sanitize_inline "$line")"
      [[ -n "$line" ]] || continue
      device="${line%% *}"
      extra="${line#"$device"}"
      extra="$(sanitize_inline "$extra")"
      label="$(basename "$device")"
      printf '%s\t%s\t%s\n' "$label" "$device" "$extra" >> "$output_path"
    done < <("$SMARTCTL_BIN" --scan-open 2>/dev/null || true)
  fi

  if [[ ! -s "$output_path" ]]; then
    for device in /dev/sata? /dev/sd? /dev/nvme?n?; do
      [[ -e "$device" ]] || continue
      label="$(basename "$device")"
      printf '%s\t%s\t%s\n' "$label" "$device" "" >> "$output_path"
    done
  fi

  if [[ -s "$output_path" ]]; then
    awk -F'\t' '!seen[$1]++' "$output_path" > "${output_path}.uniq"
    mv "${output_path}.uniq" "$output_path"
  fi
}

is_repo_job_process() {
  local command="$1"
  local root
  IFS=':' read -r -a __repo_roots <<< "$REPO_ROOTS"
  for root in "${__repo_roots[@]}"; do
    [[ -n "$root" ]] || continue
    if [[ "$command" == *"$root"* ]]; then
      return 0
    fi
  done
  return 1
}

write_process_tsv() {
  local sort_key="$1"
  local output_path="$2"
  local limit="${3:-5}"
  printf 'pid\tcpu\tram\tclass\tcommand\n' > "$output_path"

  local raw_lines
  if ps -eo pid=,pcpu=,pmem=,args= --sort="-${sort_key}" >/dev/null 2>&1; then
    raw_lines="$(ps -eo pid=,pcpu=,pmem=,args= --sort="-${sort_key}" 2>/dev/null | head -n "$limit" | awk 'NF >= 4 { pid=$1; cpu=$2; ram=$3; $1=$2=$3=""; sub(/^ +/, "", $0); print pid "\t" cpu "\t" ram "\t" $0 }')"
  else
    if [[ "$sort_key" == "pcpu" ]]; then
      raw_lines="$(ps -axo pid=,%cpu=,%mem=,command= -r 2>/dev/null | head -n "$limit" | awk 'NF >= 4 { pid=$1; cpu=$2; ram=$3; $1=$2=$3=""; sub(/^ +/, "", $0); print pid "\t" cpu "\t" ram "\t" $0 }')"
    else
      raw_lines="$(ps -axo pid=,%cpu=,%mem=,command= -m 2>/dev/null | head -n "$limit" | awk 'NF >= 4 { pid=$1; cpu=$2; ram=$3; $1=$2=$3=""; sub(/^ +/, "", $0); print pid "\t" cpu "\t" ram "\t" $0 }')"
    fi
  fi

  while IFS=$'\t' read -r pid cpu ram command; do
    [[ -n "$pid" ]] || continue
    local class="system"
    if is_repo_job_process "$command"; then
      class="repo_job"
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$pid" "$cpu" "$ram" "$class" "$(truncate_inline "$command" 240)" >> "$output_path"
  done <<< "$raw_lines"
}

write_repo_process_tsv() {
  local output_path="$1"
  printf 'pid\tcpu\tram\tclass\tcommand\n' > "$output_path"
  if ps -eo pid=,pcpu=,pmem=,args= >/dev/null 2>&1; then
    ps -eo pid=,pcpu=,pmem=,args= 2>/dev/null | awk 'NF >= 4 { pid=$1; cpu=$2; ram=$3; $1=$2=$3=""; sub(/^ +/, "", $0); print pid "\t" cpu "\t" ram "\t" $0 }' | while IFS=$'\t' read -r pid cpu ram command; do
      is_repo_job_process "$command" || continue
      printf '%s\t%s\t%s\trepo_job\t%s\n' "$pid" "$cpu" "$ram" "$(truncate_inline "$command" 240)" >> "$output_path"
    done
  else
    ps -axo pid=,%cpu=,%mem=,command= 2>/dev/null | awk 'NF >= 4 { pid=$1; cpu=$2; ram=$3; $1=$2=$3=""; sub(/^ +/, "", $0); print pid "\t" cpu "\t" ram "\t" $0 }' | while IFS=$'\t' read -r pid cpu ram command; do
      is_repo_job_process "$command" || continue
      printf '%s\t%s\t%s\trepo_job\t%s\n' "$pid" "$cpu" "$ram" "$(truncate_inline "$command" 240)" >> "$output_path"
    done
  fi
}

build_process_samples() {
  local cpu_path="$1"
  local ram_path="$2"
  local repo_path="$3"
  local output_path="$4"
  printf 'pid\tcpu\tram\tclass\tcommand\n' > "$output_path"
  {
    tail -n +2 "$cpu_path" 2>/dev/null || true
    tail -n +2 "$ram_path" 2>/dev/null || true
    tail -n +2 "$repo_path" 2>/dev/null || true
  } | awk -F'\t' '!seen[$1 FS $5]++ { print $0 }' >> "$output_path"
}

append_snapshot_events() {
  local snapshot_dir="$1"
  local batch_path="$snapshot_dir/events_new.log"
  [[ -s "$batch_path" ]] || return 0
  cat "$batch_path" >> "$EVENTS_LOG"
  trim_file_to_lines "$EVENTS_LOG" "$EVENT_RETENTION_LINES"
}

append_snapshot_process_log() {
  local snapshot_dir="$1"
  local process_samples="$snapshot_dir/process_samples.tsv"
  local generated_at
  generated_at="$(snapshot_value "$snapshot_dir" generated_at)"
  [[ -f "$process_samples" ]] || return 0
  while IFS=$'\t' read -r pid cpu ram class command; do
    [[ "$pid" == "pid" ]] && continue
    [[ -n "$pid" ]] || continue
    printf '%s | %s :: %s | %s | %s\n' "$generated_at" "$class" "$command" "$cpu" "$ram" >> "$PROCESS_LOG"
  done < "$process_samples"
  trim_file_to_lines "$PROCESS_LOG" "$PROCESS_RETENTION_LINES"
}

send_telegram_alert() {
  local message="$1"
  [[ "$TELEGRAM_ALERTS_ENABLED" == "1" ]] || return 0
  [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]] || return 0
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" >/dev/null
}

send_email_report() {
  local subject="$1"
  local body_file="$2"
  [[ "$EMAIL_REPORTS_ENABLED" == "1" ]] || return 0
  [[ -n "$EMAIL_TO" ]] || return 0

  if [[ -n "$SENDMAIL_BIN" ]]; then
    {
      printf 'From: %s\n' "$SMTP_FROM"
      printf 'To: %s\n' "$EMAIL_TO"
      printf 'Subject: %s\n' "$subject"
      printf 'MIME-Version: 1.0\n'
      printf 'Content-Type: text/plain; charset=UTF-8\n'
      printf '\n'
      cat "$body_file"
    } | "$SENDMAIL_BIN" -t
    return 0
  fi

  if [[ -n "$SMTP_HOST" ]]; then
    SMTP_HOST="$SMTP_HOST" SMTP_PORT="$SMTP_PORT" SMTP_USER="$SMTP_USER" SMTP_PASS="$SMTP_PASS" SMTP_FROM="$SMTP_FROM" SMTP_SECURE="$SMTP_SECURE" \
      run_node_script "$MONITORING_SCRIPT_DIR/send_mail.mjs" --to "$EMAIL_TO" --subject "$subject" --body-file "$body_file"
    return 0
  fi

  runtime_log "email skipped: no sendmail and SMTP_HOST missing"
}

load_alert_state() {
  LAST_STATUS="UNKNOWN"
  LAST_ALERT_EPOCH=0
  if [[ -f "$ALERT_STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ALERT_STATE_FILE"
  fi
}

save_alert_state() {
  cat > "$ALERT_STATE_FILE" <<EOF
LAST_STATUS=${LAST_STATUS:-UNKNOWN}
LAST_ALERT_EPOCH=${LAST_ALERT_EPOCH:-0}
EOF
}

should_send_crit_alert() {
  local current_status="$1"
  local now_epoch
  now_epoch="$(date '+%s')"
  load_alert_state

  if [[ "$current_status" != "CRIT" ]]; then
    LAST_STATUS="$current_status"
    save_alert_state
    return 1
  fi

  if [[ "$LAST_STATUS" != "CRIT" ]]; then
    LAST_STATUS="CRIT"
    LAST_ALERT_EPOCH="$now_epoch"
    save_alert_state
    return 0
  fi

  if (( now_epoch - LAST_ALERT_EPOCH >= ALERT_COOLDOWN_SEC )); then
    LAST_STATUS="CRIT"
    LAST_ALERT_EPOCH="$now_epoch"
    save_alert_state
    return 0
  fi

  LAST_STATUS="CRIT"
  save_alert_state
  return 1
}

snapshot_value() {
  local snapshot_dir="$1"
  local key="$2"
  awk -F'=' -v k="$key" '$1 == k { print substr($0, length($1) + 2); exit }' "$snapshot_dir/snapshot.env"
}

write_snapshot_env() {
  local snapshot_dir="$1"
  cat > "$snapshot_dir/snapshot.env" <<EOF
generated_at=$GENERATED_AT
source=$SNAPSHOT_SOURCE
hostname=$HOSTNAME_VALUE
uptime_seconds=$UPTIME_SECONDS
uptime_pretty=$UPTIME_PRETTY
load1=$LOAD1
load5=$LOAD5
load15=$LOAD15
cpu_cores=$CPU_CORES
cpu_status=$CPU_STATUS
ram_total_mb=$RAM_TOTAL_MB
ram_used_mb=$RAM_USED_MB
ram_pct=$RAM_PCT
ram_status=$RAM_STATUS
volume_path=$VOLUME_PATH
volume_used_pct=$VOLUME_USED_PCT
volume_status=$VOLUME_STATUS
raid_status=$RAID_STATUS
raid_summary=$(sanitize_inline "$RAID_SUMMARY")
overall_status=$OVERALL_STATUS
summary=$(sanitize_inline "$SUMMARY_TEXT")
repo_recommendation=$(sanitize_inline "$REPO_RECOMMENDATION")
EOF
}

collect_system_metrics() {
  HOSTNAME_VALUE="$(hostname -s 2>/dev/null || hostname)"
  UPTIME_SECONDS="$(awk '{print int($1)}' /proc/uptime 2>/dev/null || printf '0')"
  UPTIME_PRETTY="$(format_duration "$UPTIME_SECONDS")"
  read -r LOAD1 LOAD5 LOAD15 _ < /proc/loadavg
  CPU_CORES="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '1')"
  local load15_per_core load5_per_core
  load15_per_core="$(awk -v metric="$LOAD15" -v cores="$CPU_CORES" 'BEGIN { if (cores <= 0) cores = 1; printf "%.4f", metric / cores }')"
  load5_per_core="$(awk -v metric="$LOAD5" -v cores="$CPU_CORES" 'BEGIN { if (cores <= 0) cores = 1; printf "%.4f", metric / cores }')"
  if float_ge "$load15_per_core" "$CPU_CRIT_PER_CORE" || float_ge "$load5_per_core" "$CPU_CRIT5_PER_CORE"; then
    CPU_STATUS="CRIT"
  elif float_ge "$load15_per_core" "$CPU_WARN_PER_CORE"; then
    CPU_STATUS="WARN"
  else
    CPU_STATUS="OK"
  fi

  RAM_TOTAL_MB="$(awk '/MemTotal:/ { printf "%.0f", $2 / 1024 }' /proc/meminfo 2>/dev/null || printf '0')"
  local ram_available
  ram_available="$(awk '/MemAvailable:/ { printf "%.0f", $2 / 1024 }' /proc/meminfo 2>/dev/null || printf '0')"
  RAM_USED_MB="$(( RAM_TOTAL_MB - ram_available ))"
  RAM_PCT="$(awk -v total="$RAM_TOTAL_MB" -v used="$RAM_USED_MB" 'BEGIN { if (total <= 0) print 0; else printf "%.1f", (used / total) * 100 }')"
  RAM_STATUS="$(score_threshold "$RAM_PCT" "$RAM_WARN_PCT" "$RAM_CRIT_PCT")"

  local volume_line available_kb
  volume_line="$(df -Pk "$VOLUME_PATH" 2>/dev/null | awk 'NR == 2 { gsub(/%/, "", $5); print $4 "\t" $5 }')"
  available_kb="$(printf '%s' "$volume_line" | awk -F'\t' '{ print $1 }')"
  VOLUME_USED_PCT="$(printf '%s' "$volume_line" | awk -F'\t' '{ print $2 }')"
  VOLUME_USED_PCT="${VOLUME_USED_PCT:-0}"
  VOLUME_STATUS="$(score_threshold "$VOLUME_USED_PCT" "$VOLUME_WARN_PCT" "$VOLUME_CRIT_PCT")"
  VOLUME_AVAILABLE_GB="$(awk -v kb="${available_kb:-0}" 'BEGIN { printf "%.1f", kb / 1048576 }')"

  RAID_STATUS="OK"
  RAID_SUMMARY="mdstat clean"
  if [[ -f /proc/mdstat ]]; then
    local mdstat
    mdstat="$(tr '\n' ' ' < /proc/mdstat | sed 's/[[:space:]][[:space:]]*/ /g; s/^ //; s/ $//')"
    RAID_SUMMARY="$(truncate_inline "$mdstat" 260)"
    if printf '%s' "$mdstat" | grep -Eq '\[[U_]+\]' && printf '%s' "$mdstat" | grep -q '_'; then
      RAID_STATUS="CRIT"
    elif printf '%s' "$mdstat" | grep -Eqi 'degraded|recover|resync|faulty|failed|inactive'; then
      RAID_STATUS="CRIT"
    fi
  fi
}

collect_disk_metrics() {
  local snapshot_dir="$1"
  local scan_path="$snapshot_dir/disk_scan.tsv"
  local disks_path="$snapshot_dir/disks.tsv"
  local label device extra
  local disk_status note smart_output
  DISK_AGG_STATUS="OK"
  DISK_ISSUES=()
  printf 'name\tdevice\ttemperature_c\tsmart_health\treallocated_sectors\tpending_sectors\tstatus\n' > "$disks_path"

  discover_disk_scan "$scan_path"
  if [[ ! -s "$scan_path" ]]; then
    DISK_AGG_STATUS="WARN"
    DISK_ISSUES+=("Disk-Telemetrie fehlt")
    return 0
  fi

  while IFS=$'\t' read -r label device extra; do
    [[ -n "$label" ]] || continue
    local health="unknown"
    local temperature=""
    local reallocated="0"
    local pending="0"
    disk_status="OK"

    if [[ -n "$SMARTCTL_BIN" ]]; then
      # shellcheck disable=SC2206
      local extra_parts=( $extra )
      if smart_output="$("$SMARTCTL_BIN" -H -A "$device" "${extra_parts[@]}" 2>/dev/null || true)"; then
        if printf '%s' "$smart_output" | grep -Eqi 'SMART overall-health self-assessment test result: PASSED|SMART Health Status: OK|SMART Health Status: PASSED'; then
          health="PASSED"
        elif printf '%s' "$smart_output" | grep -Eqi 'SMART overall-health self-assessment test result: FAILED|SMART Health Status: FAIL|SMART support is: Unavailable'; then
          health="FAILED"
        fi

        temperature="$(printf '%s' "$smart_output" | awk '
          /Temperature_Celsius|Airflow_Temperature_Cel|Current Drive Temperature/ {
            for (i = NF; i >= 1; i--) {
              if ($i ~ /^[0-9]+$/) {
                print $i
                exit
              }
            }
          }' | head -n 1)"
        reallocated="$(printf '%s' "$smart_output" | awk '
          /Reallocated_Sector_Ct|Reallocated_Event_Count/ {
            for (i = NF; i >= 1; i--) {
              if ($i ~ /^[0-9]+$/) {
                print $i
                exit
              }
            }
          }' | head -n 1)"
        pending="$(printf '%s' "$smart_output" | awk '
          /Current_Pending_Sector|Pending_Sector/ {
            for (i = NF; i >= 1; i--) {
              if ($i ~ /^[0-9]+$/) {
                print $i
                exit
              }
            }
          }' | head -n 1)"
      fi
    fi

    temperature="${temperature:-}"
    reallocated="${reallocated:-0}"
    pending="${pending:-0}"

    if [[ "$health" == "FAILED" ]] || [[ "$pending" =~ ^[0-9]+$ && "$pending" -gt 0 ]]; then
      disk_status="CRIT"
    fi
    if [[ "$reallocated" =~ ^[0-9]+$ && "$reallocated" -gt 0 ]] && [[ "$disk_status" == "OK" ]]; then
      disk_status="WARN"
    fi
    if [[ -n "$temperature" ]]; then
      if (( temperature >= DISK_TEMP_CRIT_C )); then
        disk_status="CRIT"
      elif (( temperature >= DISK_TEMP_WARN_C )) && [[ "$disk_status" == "OK" ]]; then
        disk_status="WARN"
      fi
    elif [[ "$disk_status" == "OK" ]]; then
      disk_status="WARN"
    fi

    if [[ "$disk_status" != "OK" ]]; then
      if [[ "$health" == "FAILED" ]] || { [[ "$pending" =~ ^[0-9]+$ ]] && (( pending > 0 )); }; then
        DISK_ISSUES+=("Disk $label SMART kritisch")
      elif [[ -n "$temperature" ]]; then
        DISK_ISSUES+=("Disk $label Temperatur erhoeht")
      else
        DISK_ISSUES+=("Disk $label Telemetrie unvollstaendig")
      fi
    fi
    DISK_AGG_STATUS="$(merge_status "$DISK_AGG_STATUS" "$disk_status")"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$label" "$device" "$temperature" "$health" "$reallocated" "$pending" "$disk_status" >> "$disks_path"
  done < "$scan_path"
}

build_summary() {
  local issues=()
  [[ "$CPU_STATUS" == "WARN" || "$CPU_STATUS" == "CRIT" ]] && issues+=("CPU-Last hoch")
  [[ "$RAM_STATUS" == "WARN" || "$RAM_STATUS" == "CRIT" ]] && issues+=("RAM hoch")
  [[ "$VOLUME_STATUS" == "WARN" || "$VOLUME_STATUS" == "CRIT" ]] && issues+=("Volume fast voll")
  [[ "$RAID_STATUS" == "WARN" || "$RAID_STATUS" == "CRIT" ]] && issues+=("RAID pruefen")
  if (( ${#DISK_ISSUES[@]} > 0 )); then
    issues+=("${DISK_ISSUES[@]}")
  fi
  OVERALL_STATUS="$(merge_status "$CPU_STATUS" "$RAM_STATUS" "$VOLUME_STATUS" "$RAID_STATUS" "$DISK_AGG_STATUS")"
  if (( ${#issues[@]} == 0 )); then
    SUMMARY_TEXT="System stabil"
  else
    SUMMARY_TEXT="Auffaellig: $(join_with_plus "${issues[@]}")"
  fi
}

build_repo_recommendation() {
  local repo_samples="$1"
  local labels=()
  local command
  while IFS=$'\t' read -r _ _ _ class command; do
    [[ "$class" == "repo_job" ]] || continue
    labels+=("$(truncate_inline "$command" 72)")
  done < <(tail -n +2 "$repo_samples" 2>/dev/null || true)

  if (( ${#labels[@]} == 0 )); then
    REPO_RECOMMENDATION="Keine direkte Repo-/Job-Last im aktuellen Snapshot."
  else
    REPO_RECOMMENDATION="Aktive Repo-/Job-Prozesse: $(join_with_plus "${labels[@]:0:3}")"
  fi
}

collect_snapshot() {
  local snapshot_dir="$1"
  SNAPSHOT_SOURCE="${2:-watch}"
  ensure_monitoring_dirs
  mkdir -p "$snapshot_dir"
  GENERATED_AT="$(date '+%Y-%m-%dT%H:%M:%S%z')"

  collect_system_metrics
  collect_disk_metrics "$snapshot_dir"
  capture_recent_logs "$snapshot_dir/logs.tsv"
  capture_incremental_events "$snapshot_dir/events_new.log"
  write_process_tsv "pcpu" "$snapshot_dir/top_cpu.tsv" 5
  write_process_tsv "pmem" "$snapshot_dir/top_ram.tsv" 5
  write_repo_process_tsv "$snapshot_dir/repo_processes.tsv"
  build_process_samples "$snapshot_dir/top_cpu.tsv" "$snapshot_dir/top_ram.tsv" "$snapshot_dir/repo_processes.tsv" "$snapshot_dir/process_samples.tsv"
  build_repo_recommendation "$snapshot_dir/process_samples.tsv"
  build_summary
  write_snapshot_env "$snapshot_dir"
}
