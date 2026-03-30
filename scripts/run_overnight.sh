#!/bin/bash
# overnight_hardening_run.sh
# Runs the 3-phase robustness hardening plan for RubikVault.

LOG_DIR="/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/reports"
mkdir -p "$LOG_DIR"

echo "========================================================="
echo "  [1/3] Starting Phase 1: Hist-Probs Universe Expansion "
echo "========================================================="
date "+%Y-%m-%d %H:%M:%S"
node scripts/lib/hist-probs/run-hist-probs.mjs > "$LOG_DIR/overnight_phase1_histprobs.log" 2>&1
echo "Phase 1 Exit Code: $?"

echo "========================================================="
echo "  [2/3] Starting Phase 2: Discrete Out-Of-Sample Backtest"
echo "========================================================="
date "+%Y-%m-%d %H:%M:%S"
# Using discrete_backtest.py as the primary stable rigorous test. 
python3 scripts/fusion_v2/run_6year_discrete_backtest.py > "$LOG_DIR/overnight_phase2_backtest.log" 2>&1
echo "Phase 2 Exit Code: $?"

echo "========================================================="
echo "  [3/3] Starting Phase 3: Threshold Calibration         "
echo "========================================================="
date "+%Y-%m-%d %H:%M:%S"
node scripts/quantlab/calibrate_fusion_thresholds.mjs > "$LOG_DIR/overnight_phase3_calibration.log" 2>&1
echo "Phase 3 Exit Code: $?"

echo "========================================================="
echo "  OVERNIGHT RUN COMPLETE"
echo "========================================================="
date "+%Y-%m-%d %H:%M:%S"
