#!/bin/bash
# Start the dashboard-green recovery supervisor on NAS.
# Designed to be called from Synology DSM Task Scheduler (daily, e.g. 03:00).
# Prerequisites:
#   - Node.js ≥20 installed (e.g. via nvm or Synology Package Center)
#   - Python3 + pyarrow installed for q1_delta_ingest
#   - QuantLabHot at /volume1/homes/neoboy/QuantLabHot/
#   - This repo at /volume1/homes/neoboy/Dev/rubikvault-site/

set -e
REPO_DIR="/volume1/homes/neoboy/Dev/rubikvault-site"
LOG_DIR="$REPO_DIR/logs/dashboard_v7"
NVM_DIR="$HOME/.nvm"

# Load nvm if present
if [ -s "$NVM_DIR/nvm.sh" ]; then
  source "$NVM_DIR/nvm.sh"
fi

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

# Sync latest code before starting
bash scripts/ops/nas-sync.sh

# Check Python + pyarrow
if ! python3 -c "import pyarrow" 2>/dev/null; then
  echo "[nas-start] WARNING: pyarrow not available — q1_delta_ingest will fail"
  echo "[nas-start] Install: pip3 install pyarrow"
fi

# Start supervisor (detached, logs to file)
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
LOG_FILE="$LOG_DIR/supervisor-$TIMESTAMP.log"
echo "[nas-start] Starting supervisor at $TIMESTAMP → $LOG_FILE"
nohup node scripts/ops/run-dashboard-green-recovery.mjs >> "$LOG_FILE" 2>&1 &
echo "[nas-start] PID $! — monitor: tail -f $LOG_FILE"
