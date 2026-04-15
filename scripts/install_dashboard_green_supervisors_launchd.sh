#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_NOW=0
UNINSTALL=0
UID_VALUE="$(id -u)"

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

ARGS=()
if [[ "$RUN_NOW" -eq 1 ]]; then
  ARGS+=(--run-now)
fi
if [[ "$UNINSTALL" -eq 1 ]]; then
  ARGS=(--uninstall)
fi

for label in \
  com.rubikvault.dashboard-green.watch \
  com.rubikvault.night.supervisor \
  com.rubikvault.stock-analyzer.overnight-autopilot
do
  legacy_plist="$HOME/Library/LaunchAgents/${label}.plist"
  launchctl bootout "gui/${UID_VALUE}" "$legacy_plist" >/dev/null 2>&1 || true
  if [[ "$UNINSTALL" -ne 1 ]]; then
    rm -f "$legacy_plist"
  fi
done

"$REPO_ROOT/scripts/install_pipeline_master_launchd.sh" "${ARGS[@]+"${ARGS[@]}"}"
"$REPO_ROOT/scripts/install_quantlab_catchup_supervisor_launchd.sh" "${ARGS[@]+"${ARGS[@]}"}"
"$REPO_ROOT/scripts/quantlab/install_quantlab_self_heal_launchd.sh" "${ARGS[@]+"${ARGS[@]}"}"
"$REPO_ROOT/scripts/quantlab/install_quantlab_q1panel_stagea_daily_launchd.sh" "${ARGS[@]+"${ARGS[@]}"}"

echo "Dashboard green supervisor stack updated."
