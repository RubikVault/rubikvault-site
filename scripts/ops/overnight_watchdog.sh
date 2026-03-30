#!/usr/bin/env bash
# RubikVault — Overnight Process Watchdog v1.1
# Goal: Ensure 4 critical processes run continuously until morning.
# Constraints: Zero-Modification of target script source.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="mirrors/ops/logs"
mkdir -p "$LOG_DIR"
WATCHDOG_LOG="$LOG_DIR/watchdog_$(date +%Y%m%dT%H%M%SZ).log"

# Polling Interval: 30 minutes
SLEEP_INTERVAL=1800

echo "🚀 [WATCHDOG] Starting overnight monitoring at $(date)" | tee -a "$WATCHDOG_LOG"
echo "📍 [WATCHDOG] Root: $REPO_ROOT" | tee -a "$WATCHDOG_LOG"

check_and_restart() {
    local label="$1"
    local pattern="$2"
    local command="$3"
    
    if pgrep -f "$pattern" > /dev/null; then
        echo "✅ [$(date +%T)] $label is running." | tee -a "$WATCHDOG_LOG"
    else
        echo "⚠️ [$(date +%T)] $label NOT detected. Attempting restart..." | tee -a "$WATCHDOG_LOG"
        # Run with low priority (nice -15) to preserve system stability for dev:pages
        LABEL_LOWER=$(echo "$label" | tr '[:upper:]' '[:lower:]')
        nohup nice -n 15 $command >> "$LOG_DIR/${LABEL_LOWER}_restart_$(date +%Y%m%d).log" 2>&1 &
        echo "♻️ [$(date +%T)] $label restarted in background." | tee -a "$WATCHDOG_LOG"
    fi
}

while true; do
    echo "--- [$(date)] Polling Cycle ---" | tee -a "$WATCHDOG_LOG"
    
    # 1. V7 Refresh (Autopilot)
    # Note: autopilot usually has its own loop, but we check if it died.
    check_and_restart "Autopilot_V7" "run_overnight_autopilot.sh" "/bin/bash scripts/stock-analyzer/run_overnight_autopilot.sh"

    # 2. Backfill History
    check_and_restart "Backfill_V4" "backfill-stock-analyzer-history.mjs" "node scripts/learning/backfill-stock-analyzer-history.mjs"

    # 3. Forecast Calibration
    check_and_restart "Forecast_Calib" "calibrate_forecast.mjs" "node scripts/forecast/calibrate_forecast.mjs"

    # 4. Scientific Summary
    check_and_restart "Scientific_Build" "generate-analysis.mjs" "npm run build:scientific-analysis"

    # 5. Phase 2 Master Orchestrator (Wait-Check-Launch)
    check_and_restart "Pipeline_V2" "overnight_pipeline_master.sh" "/bin/bash scripts/ops/overnight_pipeline_master.sh"

    echo "💤 [$(date)] Cycle complete. Sleeping for 30 minutes..." | tee -a "$WATCHDOG_LOG"
    sleep "$SLEEP_INTERVAL"
done
