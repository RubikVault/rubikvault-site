=== DIAGNOSIS: v3-scrape-template ===

## Workflow File
.github/workflows/v3-scrape-template.yml

## Script Paths
          node scripts/providers/market-prices-v3.mjs
          node scripts/providers/market-stats-v3.mjs
          node scripts/aggregator/finalize.mjs
✅ EXISTS: scripts/providers/market-prices-v3.mjs
✅ EXISTS: scripts/providers/market-stats-v3.mjs
✅ EXISTS: scripts/aggregator/finalize.mjs

## Node Version
          node-version: "20"
          node-version: "20"
          node-version: "20"

## Permissions
    permissions:
      contents: read
      actions: read
    
    strategy:
      matrix: ${{ fromJson(needs.prepare.outputs.matrix) }}
      fail-fast: false  # Continue even if one module fails

## Secrets Used
          POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
          ALPHAVANTAGE_API_KEY: ${{ secrets.ALPHAVANTAGE_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          TWELVEDATA_API_KEY: ${{ secrets.TWELVEDATA_API_KEY }}

## Concurrency
❌ NOT SET

## Recent Failure
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8605090Z ##[group]Run set -euo pipefail
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8605688Z [36;1mset -euo pipefail[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8619154Z [36;1m    error: (.error // null)[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8620767Z [36;1m  echo "MISSING: $ARTIFACTS_DIR/market-prices/snapshot.json"[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8780529Z ls: cannot access '/home/runner/work/_temp/artifacts': No such file or directory
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8794562Z MISSING: /home/runner/work/_temp/artifacts/market-prices/snapshot.json
prepare	UNKNOWN STEP	2026-02-09T23:05:30.6131010Z Error: Cannot find module './public/data/registry/modules.json'
prepare	UNKNOWN STEP	2026-02-09T23:05:30.6158005Z ##[error]Process completed with exit code 1.
