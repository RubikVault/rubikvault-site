# Forensic Audit v5.0: Executive Summary

## Overview
A comprehensive forensic audit of the `rubikvault-site` repository was conducted to trace Golden Paths, identify SSOT violations, and map the attack surface.

## Key Findings

### 1. Critical SSOT Violation (Parallel Data Path)
*   **Finding**: The UI's "Scientific Analyzer" (MarketPhase) relies on **Stooq** data fetched via a secondary path (`stooq-fetch.mjs` -> `mirrors/`). The OPS dashboard ("Pipeline Truth") relies on **Tiingo/TwelveData** snapshots (`market-prices`).
*   **Risk**: OPS Green status is deceptive. The UI may display different prices or signals than what the OPS pipeline validates.
*   **Remediation**: Re-route `marketphase-generate.mjs` to consume the `market-prices` snapshot. Delete `mirrors/` and `stooq-fetch.mjs`.

### 2. Snapshot Alignment (Fragile)
*   **Finding**: `functions/api/stock.js` (UI API) and `functions/api/mission-control/summary.js` (OPS) currently align on `market-prices/latest.json`, but OPS uses a hardcoded path while UI uses a fallback list.
*   **Risk**: Low.
*   **Remediation**: Unify snapshot path constants in a shared module.

### 3. Cleanup Candidates
*   **Identified**: 4 Primary "Red" scripts supporting the Stooq parallel path.
*   **Action**: Scheduled for deletion post-refactor.

## Artifacts Generated
*   `00-inventory.md`: Repository Map.
*   `01-golden-path-ui.md`: UI Critical Path.
*   `01.5-ui-surface.json`: Critical File Allowlist.
*   `02-artifact-registry.json`: Data Asset Inventory.
*   `03-ops-golden-path.md`: OPS Trace.
*   `03-ops-mismatch.json`: Alignment Report.
*   `04-ssot-violations.md`: Detailed Violation Analysis.
*   `05-cleanup-candidates.md`: Files to Delete.
*   `08-ops-remediation-plan.md`: Fix Strategy.

## Conclusion
The repository has a clean core (Tiingo/TwelveData pipeline) but suffers from a legacy or parallel "Mirror" system (Stooq) that powers significant UI features. Remediation is straightforward but critical for data integrity.
