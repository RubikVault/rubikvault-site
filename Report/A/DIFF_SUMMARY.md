# P0/P1 Hardening — Diff Summary

**Branch:** `codex/workflow-green-finalizer-v12`
**HEAD:** `86565007`
**Merge base:** `origin/main`
**Changed files:** 39

## Changed Files

### Workflows (14)
- `.github/workflows/ci-gates.yml`
- `.github/workflows/e2e-playwright.yml`
- `.github/workflows/eod-latest.yml`
- `.github/workflows/forecast-daily.yml`
- `.github/workflows/forecast-monthly.yml`
- `.github/workflows/forecast-weekly.yml`
- `.github/workflows/monitor-prod.yml`
- `.github/workflows/ops-daily.yml`
- `.github/workflows/refresh-health-assets.yml`
- `.github/workflows/scheduler-kick.yml`
- `.github/workflows/universe-refresh.yml`
- `.github/workflows/v3-finalizer.yml`
- `.github/workflows/v3-scrape-template.yml`
- `.github/workflows/wp16-manual-market-prices.yml`

### Functions (3)
- `functions/api/elliott-scanner.js`
- `functions/api/mission-control/summary.js`
- `functions/data/marketphase/[asset].js`

### Scripts (9)
- `scripts/aggregator/finalize.mjs`
- `scripts/ci/assert-mission-control-gate.mjs`
- `scripts/ci/check-elliott-parity.mjs`
- `scripts/eod/build-eod-latest.mjs`
- `scripts/lib/kv-write.js`
- `scripts/ops/build-ops-daily.mjs`
- `scripts/ops/build-ops-pulse.mjs`
- `scripts/ops/preflight-check.mjs`
- `scripts/providers/market-prices-v3.mjs`

### Providers (2)
- `scripts/providers/market-prices-v3.mjs`
- `scripts/providers/market-stats-v3.mjs`

### Policies (3)
- `policies/cohesion-policy.json`
- `policies/mission-control-severity.json`
- `policies/universe-policy.json`

### Other (8)
- `docs/ops/P0_P1_HARDENING_CONTRACTS.md`
- `playwright.config.mjs`
- `public/data/ops/pulse.json`
- `public/index.html`
- `scripts/refresh-health-assets.mjs`
- `tests/e2e/ops.spec.mjs`
- `Report/PERFECT_PROMPT_TEMPLATE.md`
- `Report/UNIVERSE_CONSISTENCY_AUDIT_2026-02-08.md`
- `Report/UNIVERSE_COVERAGE.md`
