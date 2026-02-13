=== DIAGNOSIS: ops-daily ===

## Workflow File
.github/workflows/ops-daily.yml

## Script Paths
        run: node scripts/ops/preflight-check.mjs --mode ops-daily
        run: node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100
        run: node scripts/pipeline/build-ndx100-pipeline-truth.mjs
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-ops-daily.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
✅ EXISTS: scripts/ops/preflight-check.mjs
✅ EXISTS: scripts/pipeline/build-marketphase-from-kv.mjs
✅ EXISTS: scripts/pipeline/build-ndx100-pipeline-truth.mjs
✅ EXISTS: scripts/ops/build-safety-snapshot.mjs
✅ EXISTS: scripts/ops/build-ops-daily.mjs
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
  group: ops-daily
  cancel-in-progress: true


## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

## Concurrency
concurrency:
  group: ops-daily
  cancel-in-progress: true

jobs:

## Recent Failure
failed to get run log: log not found
