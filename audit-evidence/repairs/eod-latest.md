=== DIAGNOSIS: eod-latest ===

## Workflow File
.github/workflows/eod-latest.yml

## Script Paths
        run: node scripts/ops/preflight-check.mjs --mode eod-latest
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
✅ EXISTS: scripts/ops/preflight-check.mjs
✅ EXISTS: scripts/eod/build-eod-latest.mjs
✅ EXISTS: scripts/ops/build-safety-snapshot.mjs
✅ EXISTS: scripts/ops/build-mission-control-summary.mjs
✅ EXISTS: scripts/ops/build-ops-pulse.mjs
✅ EXISTS: scripts/ops/validate-ops-summary.mjs
✅ EXISTS: scripts/ci/assert-mission-control-gate.mjs

## Node Version
          node-version: "20"
          node-version: "20"

## Permissions
permissions:
  contents: write

concurrency:
  group: eod-latest
  cancel-in-progress: true


## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}
          if [ -n "${{ secrets.TIINGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIINGO_API_KEY }}" >> "$GITHUB_ENV"
          elif [ -n "${{ secrets.TIIANGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIIANGO_API_KEY }}" >> "$GITHUB_ENV"

## Concurrency
concurrency:
  group: eod-latest
  cancel-in-progress: true

jobs:

## Recent Failure
run	UNKNOWN STEP	2026-02-09T22:54:51.1439967Z ##[group]Run set -euo pipefail
run	UNKNOWN STEP	2026-02-09T22:54:51.1440290Z [36;1mset -euo pipefail[0m
run	UNKNOWN STEP	2026-02-09T22:55:26.1392906Z FAIL: expected=100 but fetched=0 (empty artifact generation blocked)
run	UNKNOWN STEP	2026-02-09T22:55:26.1445662Z ##[error]Process completed with exit code 1.
