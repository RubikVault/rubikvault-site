# Audit Phase 6: Cleanup Candidates

## Classification Codes
*   **[RED]**: High Confidence. Proven parallel path or unused orphan.
*   **[AMBER]**: Medium Confidence. Likely unused but requires runtime trace.
*   **[GREEN]**: Keep. Part of Golden Path.

## Candidates List

### Parallel Data Path (Stooq / Mirrors)
These files support the secondary "Mirrors" data path which violates the SSOT (Market Prices).
*   **[RED]** `scripts/utils/stooq-fetch.mjs` (Direct API fetch, bypassing Tiingo).
*   **[RED]** `scripts/utils/eod-market-mirrors.mjs` (Logic for building parallel mirrors).
*   **[RED]** `scripts/utils/eod-market-symbols.mjs` (Logic for processing Stooq data).
*   **[RED]** `scripts/generate-eod-mirrors.mjs` (Orphaned/Dummy script generating empty files).
*   **[AMBER]** `scripts/marketphase-generate.mjs` (Consumes mirrors; Needs refactor to consume Snapshots instead of Delete, but currently part of the Problem Chain).

### Orphaned Scripts (Likely)
*   **[AMBER]** `scripts/move-repo-out-of-cloud.sh` (Migration artifact).
*   **[AMBER]** `scripts/generate-snapshots.mjs.bak*` (Backup files).
*   **[AMBER]** `scripts/runners/package3/*.lite.js` (Many "lite" runners; verify if used by `marketphase-generate` or `eod-market-mirrors`).

## Impact Analysis
Removing **[RED]** items will break `marketphase-generate.mjs` until it is refactored to use `market-prices` snapshot.
**Recommendation**: Do not delete until Refactor Phase is complete.
