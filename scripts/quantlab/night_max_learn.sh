#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

TOTAL_BUDGET_HOURS="${TOTAL_BUDGET_HOURS:-9.5}"
PHASE1_HOURS="${PHASE1_HOURS:-6.0}"
START_EPOCH=$(date +%s)

# Eindeutiger JOB_NAME mit Sekunden-Timestamp (verhindert Job-Ordner-Kollision)
export JOB_NAME="night_max_learn_$(date +%Y%m%d_%H%M%S)"

echo "=== PHASE 1: Q1 Overnight Sweep (max ${PHASE1_HOURS}h) ==="
echo "Job: $JOB_NAME"

# Phase 1: Zurück zum produktiven Pfad (12./13. März: 12/12 Tasks)
# Preflight mit Freshness-Guard ist im safe_light_first Task-Order als Task 1 enthalten
# Backbone als Task 2 läuft automatisch wenn Preflight stale erkennt
THREADS_CAP=1 \
MAX_RSS_GIB=8.3 \
MAX_HOURS="$PHASE1_HOURS" \
WATCH_HOURS="$(echo "$PHASE1_HOURS + 0.5" | bc)" \
TASK_TIMEOUT_MINUTES=80 \
SLEEP_BETWEEN_TASKS_SEC=10 \
STOP_AFTER_CONSECUTIVE_FAILURES=6 \
"$REPO_ROOT/scripts/quantlab/run_overnight_q1_supervised_safe.sh" \
  --feature-store-version v4_q1panel_overnight \
  --panel-days-list 90 \
  --top-liquid-list 2500,3500 \
  --panel-max-assets 5000 \
  --asof-dates-count 4 \
  --task-order safe_light_first \
  --v4-final-profile \
  --phasea-production-mode \
  --redflags-failure-mode warn \
  --stageb-pass-mode strict \
  --stageb-strict-gate-profile hard \
  --stageb-survivors-b-q1-failure-mode warn \
  --oom-downshift-factor 0.50 \
  --oom-downshift-min-top-liquid 2500 \
  --skip-run-portfolio-q1 \
|| echo "Phase 1 exited with rc=$?"

# Restbudget berechnen — Phase 2 nur wenn genug Zeit bleibt
ELAPSED_SEC=$(( $(date +%s) - START_EPOCH ))
ELAPSED_HOURS=$(echo "scale=1; $ELAPSED_SEC / 3600" | bc)
REMAINING_HOURS=$(echo "scale=1; $TOTAL_BUDGET_HOURS - $ELAPSED_HOURS" | bc)
MIN_PHASE2_HOURS="1.0"

if (( $(echo "$REMAINING_HOURS < $MIN_PHASE2_HOURS" | bc -l) )); then
  echo "=== Skipping Phase 2: only ${REMAINING_HOURS}h remaining (need ${MIN_PHASE2_HOURS}h) ==="
  exit 0
fi

echo "=== PHASE 2: Evolutionary Parallel Training (${REMAINING_HOURS}h remaining) ==="

# Skaliere Generations nach Restzeit: ~1 Generation pro 10min bei 2000 Candidates
PHASE2_MINUTES=$(echo "scale=0; $REMAINING_HOURS * 60 / 1" | bc)
GENERATIONS=$(echo "scale=0; $PHASE2_MINUTES / 10" | bc)
GENERATIONS=$(( GENERATIONS > 30 ? 30 : GENERATIONS ))  # Cap bei 30
GENERATIONS=$(( GENERATIONS < 3 ? 3 : GENERATIONS ))     # Min 3

echo "  Generations: $GENERATIONS (based on ${PHASE2_MINUTES}min budget)"

cd "$REPO_ROOT/quantlab"
timeout "${PHASE2_MINUTES}m" \
  uv run python -m quantlab v3 train \
    --parallel \
    --n-candidates 2000 \
    --generations "$GENERATIONS" \
    --max-symbols 200 \
|| echo "Phase 2 exited with rc=$?"

echo "=== Night training complete ($(echo "scale=1; $(( $(date +%s) - START_EPOCH )) / 3600" | bc)h total) ==="
