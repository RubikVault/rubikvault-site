#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="${LABEL:-com.rubikvault.nas.daywatch}"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$ROOT/tmp/nas-launchd"
STDOUT_LOG="$LOG_DIR/day-watch.stdout.log"
STDERR_LOG="$LOG_DIR/day-watch.stderr.log"
GUI_DOMAIN="gui/$(id -u)"

mkdir -p "$PLIST_DIR" "$LOG_DIR" "$ROOT/tmp/nas-locks"
rm -rf "$ROOT/tmp/nas-locks/nas-overnight-supervisor.lock"

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
    <string>$ROOT/scripts/nas/run-overnight-supervisor.sh</string>
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
    <string>600</string>
    <key>STALE_THRESHOLD_SEC</key>
    <string>1500</string>
    <key>END_LOCAL_HOUR</key>
    <string>20</string>
    <key>END_LOCAL_MINUTE</key>
    <string>0</string>
    <key>RETENTION_KEEP_LOCAL_RUNS_PER_STAGE</key>
    <string>1</string>
    <key>RETENTION_TRIM_LOCAL_AFTER_ARCHIVE</key>
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

launchctl bootout "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$GUI_DOMAIN" "$PLIST_PATH"
launchctl kickstart -k "$GUI_DOMAIN/$LABEL"

printf 'label=%s\n' "$LABEL"
printf 'plist=%s\n' "$PLIST_PATH"
printf 'stdout=%s\n' "$STDOUT_LOG"
printf 'stderr=%s\n' "$STDERR_LOG"
