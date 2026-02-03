# Audit Phase 8: OPS Remediation Plan

## Executive Summary
The forensic audit confirmed a **Critical SSOT Violation**: The UI's "Scientific Analyzer" (MarketPhase) relies on a parallel data path (Stooq-based Mirrors) that is completely independent from the OPS "Pipeline Truth" (Tiingo-based Snapshots). This creates a risk of data divergence where OPS shows "Green" but UI serves stale or conflicting data.

## Remediation Strategy
**Objective**: Unify all data consumption under the `market-prices` Snapshot (Tiingo/TwelveData).

### Step 1: Refactor Generators
*   **Target**: `scripts/marketphase-generate.mjs`
*   **Action**: Modify to read from `public/data/snapshots/market-prices/latest.json` instead of `mirrors/*.json`.
*   **Benefit**: Ensures MarketPhase is built from the same data verified by OPS.

### Step 2: Deprecate Parellel Path
*   **Target**: `scripts/utils/eod-market-symbols.mjs`, `stooq-fetch.mjs`.
*   **Action**: Delete these scripts once Step 1 is verified.
*   **Target**: `mirrors/` directory.
*   **Action**: Delete.

### Step 3: Harden OPS Validation
*   **Target**: `functions/api/mission-control/summary.js`.
*   **Action**: Explicitly check for `marketphase` timestamp vs `market-prices` timestamp to ensure propagation latency is tracked.

## Success Criteria
1.  `marketphase-generate.mjs` has ZERO external API calls.
2.  `mirrors/` directory is empty/removed.
3.  UI and OPS show identical prices for any given symbol.
