# A2 Changes — OPS gate policy + single verdict

## New policy
- **Added** `public/data/policies/ops-gates.json` (gate policy + env overrides).
  - Reason: provide deterministic gating rules and preview overrides (UI trace INFO, pipeline/freshness NOT_EXPECTED).

## Summary API
- **Updated** `functions/api/mission-control/summary.js`:
  - Added policy fetch and fallback (`/data/policies/ops-gates.json`) and computed `gates` in response.
  - `meta.status` now reflects **gate overall** (GREEN/ YELLOW/ RED → ok/degraded/error).
  - Evidence: `functions/api/mission-control/summary.js:1227-1250`, `1778-1842`.

## OPS UI
- **Updated** `public/ops/index.html`:
  - Added **System verdict** card and **4 gate cards** (CORE_PRODUCT, DATA_FRESHNESS, PIPELINE_COVERAGE, OBSERVABILITY).
  - Moved detailed tables + truth chains under **Evidence & drilldown** (details) section.
  - UI now renders gate data from `data.gates` and sets `#ops-bridge` based on gate overall.
  - Evidence: `public/ops/index.html:205-237`, `636-651`, `780-819`.

## Contracts / tests
- **Updated** `scripts/ops/rv_contract_asserts.jq`: mission-control asserts now require `data.gates.overall.status`.
- **Updated** `scripts/ops/rv_verify_truth_summary.mjs`: verify `data.gates` structure.
- **Updated** Playwright tests: `tests/e2e/ops.spec.mjs` now checks gate cards instead of truth-chain sections.
- **Updated** Tier-3 ops UI test: `scripts/ops/test-ops-ui.mjs` validates gate cards (no truth-chain dependency).

