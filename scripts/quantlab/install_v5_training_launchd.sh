#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST_DIR="$HOME/Library/LaunchAgents"
UID_VALUE="$(id -u)"
RUN_NOW=0
UNINSTALL=0

LABELS=(
  com.rubikvault.quantlab.v5-training.day
  com.rubikvault.quantlab.v5-training.day.keepalive
  com.rubikvault.quantlab.v5-training.night
  com.rubikvault.quantlab.v5-training.night.keepalive
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-now)
      RUN_NOW=1
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$DEST_DIR"

for LABEL in "${LABELS[@]}"; do
  TEMPLATE="$REPO_ROOT/scripts/quantlab/launchd/${LABEL}.plist.template"
  DEST_PLIST="$DEST_DIR/${LABEL}.plist"
  if [[ ! -f "$TEMPLATE" ]]; then
    echo "Missing template: $TEMPLATE" >&2
    exit 2
  fi
  if [[ "$UNINSTALL" -eq 1 ]]; then
    launchctl bootout "gui/${UID_VALUE}" "$DEST_PLIST" >/dev/null 2>&1 || true
    rm -f "$DEST_PLIST"
    continue
  fi
  cp "$TEMPLATE" "$DEST_PLIST"
  launchctl bootout "gui/${UID_VALUE}" "$DEST_PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/${UID_VALUE}" "$DEST_PLIST"
  launchctl enable "gui/${UID_VALUE}/${LABEL}" >/dev/null 2>&1 || true
done

if [[ "$UNINSTALL" -eq 1 ]]; then
  echo "Removed v5 training launch agents"
  exit 0
fi

if [[ "$RUN_NOW" -eq 1 ]]; then
  launchctl kickstart -k "gui/${UID_VALUE}/com.rubikvault.quantlab.v5-training.day.keepalive" >/dev/null 2>&1 || true
  launchctl kickstart -k "gui/${UID_VALUE}/com.rubikvault.quantlab.v5-training.night.keepalive" >/dev/null 2>&1 || true
fi

echo "Installed v5 day/night training launch agents"
