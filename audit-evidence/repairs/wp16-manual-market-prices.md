=== DIAGNOSIS: wp16-manual-market-prices ===

## Workflow File
.github/workflows/wp16-manual-market-prices.yml

## Script Paths
          node scripts/providers/market-prices-v3.mjs
          node scripts/aggregator/finalize.mjs
          node scripts/wp16/guard-market-prices.mjs
✅ EXISTS: scripts/providers/market-prices-v3.mjs
✅ EXISTS: scripts/aggregator/finalize.mjs
✅ EXISTS: scripts/wp16/guard-market-prices.mjs

## Node Version
          node-version: "20"

## Permissions
permissions:
  contents: write

concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true


## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}

## Concurrency
concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true

jobs:

## Recent Failure
failed to get run log: log not found
