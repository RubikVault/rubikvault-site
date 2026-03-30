#!/usr/bin/env bash
# RubikVault — Phase 2 Pipeline Orchestrator v1.0
# Goal: Sequential & Parallel execution of Stage B-E after Phase 0 completion.
# Constraints: Zero-Modification of functional scripts.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="mirrors/ops/logs"
mkdir -p "$LOG_DIR"
MASTER_LOG="$LOG_DIR/pipeline_v2_$(date +%Y%m%dT%H%M%SZ).log"

echo "🚀 [PIPELINE-V2] Starting Master Orchestrator at $(date)" | tee -a "$MASTER_LOG"

# --- Phase 0: Wait for Completion ---
echo "⏳ [PIPELINE-V2] Phase 0: Waiting for V7, Backfill, Scientific, and Forecast to finish..." | tee -a "$MASTER_LOG"

while true; do
    # Patterns for the core 4 scripts
    V7_ALIVE=$(pgrep -f "run_overnight_autopilot.sh")
    BACKFILL_ALIVE=$(pgrep -f "backfill-stock-analyzer-history.mjs")
    FORC_ALIVE=$(pgrep -f "calibrate_forecast.mjs")
    SCI_ALIVE=$(pgrep -f "generate-analysis.mjs")
    
    if [[ -z "$V7_ALIVE" && -z "$BACKFILL_ALIVE" && -z "$FORC_ALIVE" && -z "$SCI_ALIVE" ]]; then
        echo "✅ [PIPELINE-V2] All Phase 0 processes finished." | tee -a "$MASTER_LOG"
        break
    fi
    echo "💤 [$(date +%T)] Phase 0 active. Sleeping 15 minutes..." | tee -a "$MASTER_LOG"
    sleep 900
done

# --- Phase B: Market Context & Global Hub ---
echo "📈 [PIPELINE-V2] Phase B: Updating Global Market Hub..." | tee -a "$MASTER_LOG"
# Using nice -n 15 for stability
nice -n 15 node scripts/dp8/global-market-hub.v3.mjs >> "$LOG_DIR/market_hub_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V2] Phase B Complete." | tee -a "$MASTER_LOG"

# --- Phase C: QuantLab Stage A (Daily Local) ---
echo "🧪 [PIPELINE-V2] Phase C: Running QuantLab Stage A (Daily Local)..." | tee -a "$MASTER_LOG"
nice -n 15 /bin/bash scripts/quantlab/run_q1_panel_stage_a_daily_local.sh >> "$LOG_DIR/quantlab_stage_a_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V2] Phase C Complete." | tee -a "$MASTER_LOG"

# --- Phase D: UI Publication (V4 Refresh) ---
echo "🏁 [PIPELINE-V2] Phase D: Refreshing V4 API / UI Assets..." | tee -a "$MASTER_LOG"
nice -n 15 /bin/bash scripts/quantlab/run_quantlab_v4_refresh_api.sh >> "$LOG_DIR/quantlab_v4_refresh_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V2] Phase D Complete." | tee -a "$MASTER_LOG"

# --- Phase E: Strategy & Validation ---
echo "⚖️ [PIPELINE-V2] Phase E: Running Meta-Learner Training & Parity Audit..." | tee -a "$MASTER_LOG"
# Running in parallel as they are independent
nice -n 15 python3 scripts/fusion_v2/train_meta_learner.py >> "$LOG_DIR/meta_learner_$(date +%Y%m%d).log" 2>&1 &
nice -n 15 node scripts/validate/stock-v4-local-vs-main-5ticker.mjs >> "$LOG_DIR/parity_audit_$(date +%Y%m%d).log" 2>&1 &

wait
echo "🎉 [PIPELINE-V2] Phase 2 Pipeline Fully Complete at $(date)" | tee -a "$MASTER_LOG"
