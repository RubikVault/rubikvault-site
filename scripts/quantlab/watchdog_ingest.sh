#!/bin/bash
# Watchdog for Ingest & Retraining
cd /Users/michaelpuchowezki/Dev/rubikvault-site
source quantlab/.venv/bin/activate

LOG_FILE="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/watchdog.log"
INGEST_LOG="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/historical_ingest.log"

echo "$(date): Watchdog started." >> "$LOG_FILE"

while true; do
  # Check if ingest process is running (using the script name)
  if ps aux | grep -v grep | grep -q "refresh_v7_history_from_eodhd.py"; then
    echo "$(date): Ingest still running. Waiting 15 minutes..." >> "$LOG_FILE"
    sleep 900
  else
    echo "$(date): Ingest finished or stopped." >> "$LOG_FILE"
    break
  fi
done

echo "$(date): Starting Retraining & Fusion Calculations..." >> "$LOG_FILE"

# 1. Build Feature Store Panel for the full range Node note Node node Node note Node
echo "$(date): Running build_feature_store_q1_panel..." >> "$LOG_FILE"
python scripts/quantlab/build_feature_store_q1_panel.py \
  --quant-root /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab \
  --snapshot-id 2026-03-12_ebe05f4e3c24_q1step2bars_top3500fresh \
  --lookback-calendar-days 420 \
  >> "$LOG_FILE" 2>&1

# 2. Run Continuous Backtest Orchestrator node node Node node Node Node Node
echo "$(date): Running run_fusion_backtest_overlap.mjs..." >> "$LOG_FILE"
node scripts/quantlab/run_fusion_backtest_overlap.mjs >> "$LOG_FILE" 2>&1

echo "$(date): All tasks completed successfully." >> "$LOG_FILE"
echo "FINISHED" > /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/watchdog_finished.txt
