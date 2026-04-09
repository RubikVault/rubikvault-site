#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="${LABEL:-com.rubikvault.nas.nightwatch}"
LEGACY_LABEL="${LEGACY_LABEL:-com.rubikvault.nas.daywatch}"
RUN_WINDOW_DAYS="${RUN_WINDOW_DAYS:-28}"
END_LOCAL_DATE_VALUE="${END_LOCAL_DATE:-$(python3 - "$RUN_WINDOW_DAYS" <<'PY'
from datetime import datetime, timedelta
import sys
days = int(sys.argv[1])
print((datetime.now().astimezone() + timedelta(days=days)).strftime("%Y-%m-%d"))
PY
)}"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$ROOT/tmp/nas-launchd"
STDOUT_LOG="$LOG_DIR/night-watch.stdout.log"
STDERR_LOG="$LOG_DIR/night-watch.stderr.log"
GUI_DOMAIN="gui/$(id -u)"
USER_DOMAIN="user/$(id -u)"
FALLBACK_PID_FILE="$ROOT/tmp/nas-launchd/night-watch.pid"

mkdir -p "$PLIST_DIR" "$LOG_DIR" "$ROOT/tmp/nas-locks"
rm -rf "$ROOT/tmp/nas-locks/nas-night-watch.lock"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/nas/run-night-watch-supervisor.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>CHECK_INTERVAL_SEC</key>
    <string>1800</string>
    <key>STALE_THRESHOLD_SEC</key>
    <string>2700</string>
    <key>END_LOCAL_DATE</key>
    <string>$END_LOCAL_DATE_VALUE</string>
    <key>END_LOCAL_HOUR</key>
    <string>8</string>
    <key>END_LOCAL_MINUTE</key>
    <string>0</string>
    <key>AUTO_DEPLOY</key>
    <string>1</string>
    <key>RUN_REMOTE_WATCHDOG</key>
    <string>1</string>
    <key>RUN_SYSTEM_AUDIT_EACH_CYCLE</key>
    <string>1</string>
    <key>PUBLISH_BENCHMARKS_EACH_CYCLE</key>
    <string>1</string>
    <key>PUBLISH_DOCS_EACH_CYCLE</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>
</dict>
</plist>
EOF

launchctl bootout "$GUI_DOMAIN/$LEGACY_LABEL" >/dev/null 2>&1 || true
launchctl bootout "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "$USER_DOMAIN/$LABEL" >/dev/null 2>&1 || true

launched="no"
for domain in "$GUI_DOMAIN" "$USER_DOMAIN"; do
  if launchctl bootstrap "$domain" "$PLIST_PATH" >/dev/null 2>&1; then
    launchctl kickstart -k "$domain/$LABEL" >/dev/null 2>&1 || true
    launched="yes"
    break
  fi
done

if [[ "$launched" != "yes" ]]; then
  if [[ -f "$FALLBACK_PID_FILE" ]]; then
    old_pid="$(cat "$FALLBACK_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" >/dev/null 2>&1; then
      kill "$old_pid" >/dev/null 2>&1 || true
    fi
    rm -f "$FALLBACK_PID_FILE"
  fi
  (
    export CHECK_INTERVAL_SEC=1800
    export STALE_THRESHOLD_SEC=2700
    export END_LOCAL_DATE="$END_LOCAL_DATE_VALUE"
    export END_LOCAL_HOUR=8
    export END_LOCAL_MINUTE=0
    export AUTO_DEPLOY=1
    export RUN_REMOTE_WATCHDOG=1
    export RUN_SYSTEM_AUDIT_EACH_CYCLE=1
    export PUBLISH_BENCHMARKS_EACH_CYCLE=1
    export PUBLISH_DOCS_EACH_CYCLE=1
    nohup /bin/bash "$ROOT/scripts/nas/run-night-watch-supervisor.sh" >>"$STDOUT_LOG" 2>>"$STDERR_LOG" &
    echo $! > "$FALLBACK_PID_FILE"
  )
fi

printf 'label=%s\n' "$LABEL"
printf 'plist=%s\n' "$PLIST_PATH"
printf 'stdout=%s\n' "$STDOUT_LOG"
printf 'stderr=%s\n' "$STDERR_LOG"
