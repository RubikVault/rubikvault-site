#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="${LABEL:-com.rubikvault.nas.dashboard-sync}"
SYNC_INTERVAL_SEC="${SYNC_INTERVAL_SEC:-60}"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$ROOT/tmp/nas-launchd"
STDOUT_LOG="$LOG_DIR/dashboard-sync.stdout.log"
STDERR_LOG="$LOG_DIR/dashboard-sync.stderr.log"
GUI_DOMAIN="gui/$(id -u)"
USER_DOMAIN="user/$(id -u)"

mkdir -p "$PLIST_DIR" "$LOG_DIR"

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
    <string>$ROOT/scripts/nas/run-dashboard-sync-supervisor.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>RUNNING_SYNC_INTERVAL_SEC</key>
    <string>60</string>
    <key>RUNNING_FULL_INTERVAL_SEC</key>
    <string>600</string>
    <key>FAILED_SYNC_INTERVAL_SEC</key>
    <string>120</string>
    <key>FAILED_FULL_INTERVAL_SEC</key>
    <string>300</string>
    <key>COMPLETED_SYNC_INTERVAL_SEC</key>
    <string>300</string>
    <key>COMPLETED_FULL_INTERVAL_SEC</key>
    <string>1800</string>
    <key>OFFLINE_SYNC_INTERVAL_SEC</key>
    <string>300</string>
    <key>OFFLINE_FULL_INTERVAL_SEC</key>
    <string>900</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>$SYNC_INTERVAL_SEC</integer>
  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>
</dict>
</plist>
EOF

launchctl bootout "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "$USER_DOMAIN/$LABEL" >/dev/null 2>&1 || true

installed="no"
for domain in "$GUI_DOMAIN" "$USER_DOMAIN"; do
  if launchctl bootstrap "$domain" "$PLIST_PATH" >/dev/null 2>&1; then
    launchctl kickstart -k "$domain/$LABEL" >/dev/null 2>&1 || true
    installed="yes"
    break
  fi
done

if [[ "$installed" != "yes" ]]; then
  echo "ERROR: could not bootstrap $LABEL into launchd" >&2
  exit 1
fi

printf 'label=%s\n' "$LABEL"
printf 'plist=%s\n' "$PLIST_PATH"
printf 'interval_sec=%s\n' "$SYNC_INTERVAL_SEC"
printf 'stdout=%s\n' "$STDOUT_LOG"
printf 'stderr=%s\n' "$STDERR_LOG"
