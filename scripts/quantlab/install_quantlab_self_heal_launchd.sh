#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="com.rubikvault.quantlab.self-heal"
TEMPLATE="$REPO_ROOT/scripts/quantlab/launchd/${LABEL}.plist.template"
DEST_DIR="$HOME/Library/LaunchAgents"
DEST_PLIST="$DEST_DIR/${LABEL}.plist"
UID_VALUE="$(id -u)"
UNINSTALL=0
RUN_NOW=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    --run-now)
      RUN_NOW=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$DEST_DIR"

if [[ "$UNINSTALL" -eq 1 ]]; then
  launchctl bootout "gui/${UID_VALUE}" "$DEST_PLIST" >/dev/null 2>&1 || true
  rm -f "$DEST_PLIST"
  echo "Removed $DEST_PLIST"
  exit 0
fi

cp "$TEMPLATE" "$DEST_PLIST"
launchctl bootout "gui/${UID_VALUE}" "$DEST_PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${UID_VALUE}" "$DEST_PLIST"
launchctl enable "gui/${UID_VALUE}/${LABEL}" >/dev/null 2>&1 || true
if [[ "$RUN_NOW" -eq 1 ]]; then
  launchctl kickstart -k "gui/${UID_VALUE}/${LABEL}"
fi

echo "Installed $LABEL at $DEST_PLIST"
echo "Schedule: every 2 hours, plus at login"
