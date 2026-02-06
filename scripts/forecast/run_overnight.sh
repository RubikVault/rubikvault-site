#!/bin/bash
#
# Overnight Training Runner - One-Paste Execution
#
# Usage: bash scripts/forecast/run_overnight.sh
#
# This script:
# 1. Sources EODHD_API_KEY from env or .env.local
# 2. Changes to git root
# 3. Runs the overnight orchestrator
# 4. Tees output to log file
#

set -e

# Find git root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Generate run ID
RUN_ID=$(date +%Y%m%d_%H%M%S)_$(head -c 4 /dev/urandom | xxd -p)

# Create logs directory
mkdir -p mirrors/forecast/ops/logs

LOG_FILE="mirrors/forecast/ops/logs/overnight-${RUN_ID}.log"

echo "═══════════════════════════════════════════════════════════════"
echo "  RUBIKVAULT OVERNIGHT TRAINING"
echo "═══════════════════════════════════════════════════════════════"
echo "  Repo:    $REPO_ROOT"
echo "  Run ID:  $RUN_ID"
echo "  Log:     $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Source environment (ORDER: shell env > .env.local)
if [ -z "$EODHD_API_KEY" ]; then
    if [ -f "$REPO_ROOT/.env.local" ]; then
        echo "Sourcing .env.local..."
        # Only export EODHD_API_KEY, do not echo it
        export $(grep -E '^EODHD_API_KEY=' "$REPO_ROOT/.env.local" | xargs)
    fi
fi

# Verify key is present (DO NOT PRINT IT)
if [ -z "$EODHD_API_KEY" ]; then
    echo ""
    echo "❌ ERROR: EODHD_API_KEY not found"
    echo ""
    echo "Set it via:"
    echo "  1. export EODHD_API_KEY=your_key"
    echo "  2. Add to .env.local: EODHD_API_KEY=your_key"
    echo ""
    exit 1
fi

echo "EODHD_API_KEY: present=true"
echo ""

# Run the orchestrator with tee to log file
node scripts/forecast/run_overnight.mjs "$@" 2>&1 | tee "$LOG_FILE"

# Capture exit code
EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Log saved to: $LOG_FILE"
echo "═══════════════════════════════════════════════════════════════"

exit $EXIT_CODE
