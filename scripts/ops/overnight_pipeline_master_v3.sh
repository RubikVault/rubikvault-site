#!/usr/bin/env bash
# RubikVault — Full-Stack Pipeline Orchestrator v3.0
# Goal: Sequential & Parallel execution of Stage B-H after Phase 0 completion.
# Constraints: Zero-Modification of functional scripts.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="mirrors/ops/logs"
mkdir -p "$LOG_DIR"
MASTER_LOG="$LOG_DIR/pipeline_v3_$(date +%Y%m%dT%H%M%SZ).log"

echo "🚀 [PIPELINE-V3] Starting Full-Stack Master Orchestrator at $(date)" | tee -a "$MASTER_LOG"

# --- Function to check if Phase 0 is done ---
is_phase0_done() {
    local v7_alive=$(pgrep -f "run_overnight_autopilot.sh")
    local backfill_alive=$(pgrep -f "backfill-stock-analyzer-history.mjs")
    local forc_alive=$(pgrep -f "calibrate_forecast.mjs")
    local sci_alive=$(pgrep -f "generate-analysis.mjs")
    
    if [[ -z "$v7_alive" && -z "$backfill_alive" && -z "$forc_alive" && -z "$sci_alive" ]]; then
        return 0
    fi
    return 1
}

# --- Phase 0: Wait for Completion ---
echo "⏳ [PIPELINE-V3] Phase 0: Waiting for V7, Backfill, Scientific, and Forecast..." | tee -a "$MASTER_LOG"
while ! is_phase0_done; do
    echo "💤 [$(date +%T)] Phase 0 active. Sleeping 15 minutes..." | tee -a "$MASTER_LOG"
    sleep 900
done
echo "✅ [PIPELINE-V3] Phase 0 finished." | tee -a "$MASTER_LOG"

# --- Phase B: Market Context & Global Hub ---
echo "📈 [PIPELINE-V3] Phase B: Updating Global Market Hub & Elliott Patterns..." | tee -a "$MASTER_LOG"
nice -n 15 node scripts/dp8/global-market-hub.v3.mjs >> "$LOG_DIR/market_hub_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V3] Phase B Complete." | tee -a "$MASTER_LOG"

# --- Phase C: QuantLab Stage A (Daily Local) ---
echo "🧪 [PIPELINE-V3] Phase C: Running QuantLab Stage A (Materialization)..." | tee -a "$MASTER_LOG"
nice -n 15 /bin/bash scripts/quantlab/run_q1_panel_stage_a_daily_local.sh >> "$LOG_DIR/quantlab_stage_a_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V3] Phase C Complete." | tee -a "$MASTER_LOG"

# --- Phase D: UI Publication (V4 Refresh) ---
echo "🏁 [PIPELINE-V3] Phase D: Refreshing V4 API / UI Assets..." | tee -a "$MASTER_LOG"
nice -n 15 /bin/bash scripts/quantlab/run_quantlab_v4_refresh_api.sh >> "$LOG_DIR/quantlab_v4_refresh_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V3] Phase D Complete." | tee -a "$MASTER_LOG"

# --- Phase E: Intelligence & Strategy Readiness ---
echo "⚖️ [PIPELINE-V3] Phase E: Base Intelligence (Meta-Learner & Parity)..." | tee -a "$MASTER_LOG"
nice -n 15 python3 scripts/fusion_v2/train_meta_learner.py >> "$LOG_DIR/meta_learner_$(date +%Y%m%d).log" 2>&1 &
nice -n 15 node scripts/validate/stock-v4-local-vs-main-5ticker.mjs >> "$LOG_DIR/parity_audit_$(date +%Y%m%d).log" 2>&1 &
wait
echo "✅ [PIPELINE-V3] Phase E Complete." | tee -a "$MASTER_LOG"

# --- Phase F: Advanced Strategy Optimization ---
echo "🧬 [PIPELINE-V3] Phase F: Advanced Optimization (Elite Swarm & Super Grid)..." | tee -a "$MASTER_LOG"
nice -n 18 python3 scripts/fusion_v2/run_6year_elite_swarm.py >> "$LOG_DIR/swarm_opt_$(date +%Y%m%d).log" 2>&1 &
nice -n 18 python3 scripts/fusion_v2/run_6year_super_grid_search.py >> "$LOG_DIR/super_grid_$(date +%Y%m%d).log" 2>&1 &
nice -n 15 python3 scripts/fusion_v2/run_6year_leakage_tests.py >> "$LOG_DIR/leakage_test_$(date +%Y%m%d).log" 2>&1 &
wait
echo "✅ [PIPELINE-V3] Phase F Complete." | tee -a "$MASTER_LOG"

# --- Phase G: Deep Learning Training (V5) ---
echo "🧠 [PIPELINE-V3] Phase G: Deep Learning Training (Agent V5.1)..." | tee -a "$MASTER_LOG"
nice -n 19 python3 scripts/fusion_v5/run_train_agent_v5_1.py >> "$LOG_DIR/v5_training_$(date +%Y%m%d).log" 2>&1
nice -n 15 python3 scripts/fusion_v2/predict_latest_day_votes.py >> "$LOG_DIR/v5_votes_$(date +%Y%m%d).log" 2>&1
echo "✅ [PIPELINE-V3] Phase G Complete." | tee -a "$MASTER_LOG"

# --- Phase H: Final Quality Gate ---
echo "🛡️ [PIPELINE-V3] Phase H: Final Quality Gate (Non-Regression)..." | tee -a "$MASTER_LOG"
nice -n 15 node scripts/validate/stock-analyzer-non-regression-gate.mjs >> "$LOG_DIR/safety_gate_$(date +%Y%m%d).log" 2>&1
echo "🎉 [PIPELINE-V3] Full-Stack Pipeline (Phase 0-H) Fully Complete at $(date)" | tee -a "$MASTER_LOG"
