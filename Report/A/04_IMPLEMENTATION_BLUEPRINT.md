# 04_IMPLEMENTATION_BLUEPRINT

## Scope
This blueprint is repo-specific, tier-safe, and non-destructive. It maps exact modules to extend/create without breaking existing UI paths.

## P0 — Hard Safety Guards

### P0.1 No-UI-break Shadow Strategy
**Current evidence**
- UI reads hardcoded `/data/...` paths:
  - `public/index.html:285,315,512,1801-1802`
  - `public/scientific.html:671`
  - `public/forecast.html:421,703,707`

**Implement**
1. Add resolver utility: `scripts/data-plane/select-active-version.mjs`.
2. Add global pointer file writer: `scripts/data-plane/write-global-meta.mjs` -> `public/data/_meta/latest.json`.
3. Keep existing v1 outputs untouched; write v2 outputs in `public/data/v2/**`.
4. Add feature flag read in functions layer (not UI hard switch):
   - `functions/api/_shared/data-version.mjs`
   - default = `v1`, optional env override for preview.

**Caveat**
- Do not change `public/*.html` fetch paths until parity proof complete.

### P0.2 UI Runtime External Call Drift Gate
**Current evidence**
- No direct provider URLs in UI source (`rg` no matches).

**Implement**
1. New CI script: `scripts/ci/forbid-provider-urls-in-ui.sh`.
2. Wire in `.github/workflows/ci-gates.yml` after checkout.
3. Fail on provider URL patterns in `public/` and `src/`.

### P0.3 last_good + stale semantics (global)
**Current evidence**
- Forecast already has robust fallback semantics:
  - `scripts/forecast/report_generator.mjs:14-17,411-505`
  - `public/forecast.html:655-680`

**Implement**
1. Extend pattern to global meta pointer (`public/data/_meta/latest.json`).
2. Include fields: `currentVersion,lastGoodVersion,usingFallback,staleSince,reason,runId,commitSha`.
3. Producer workflows update pointer atomically only after quality gate pass.

### P0.4 Publish Quality Gate Artifact
**Current evidence**
- Validator exists: `scripts/ci/verify-artifacts.mjs:1-107`.
- Gate wired: `.github/workflows/ci-gates.yml:121`.

**Implement**
1. New writer: `scripts/ci/build-quality-report.mjs`.
2. Emit `public/data/quality/latest.json` with per-artifact checks.
3. Block publish when critical checks fail; preserve last_good.

### P0.5 EODHD Budget + Rate Controls
**Current evidence**
- Budget module exists: `functions/_shared/provider_budget.js:35-142`.
- EOD builder has retry/backoff and provider chain: `scripts/eod/build-eod-latest.mjs:278-305`.

**Implement**
1. Add workflow-level budget ledger output: `public/data/ops/provider-budget.latest.json`.
2. Extend `build-eod-latest.mjs` to emit call counts per provider endpoint.
3. Add hard gate to prevent over-budget publishes (publish last_good + stale reason).

## P1 — EODHD-supported Products

### P1.1 DP1 EOD Snapshot Builder (reuse)
**Current evidence**
- Workflow + script active: `.github/workflows/eod-latest.yml:89`; `scripts/eod/build-eod-latest.mjs`.

**Implement (minimal)**
1. Add v2 output option to `build-eod-latest.mjs` (`--out public/data/v2`).
2. Preserve existing v1 output for compatibility.
3. Ensure asOf not null in output metadata (currently null in market-prices snapshot state evidence).

### P1.2 DP2 Corporate Actions (new dedicated product)
**Current evidence**
- Bars contain split/dividend fields, but no dedicated active corporate-actions feed.

**Implement**
1. New script: `scripts/eod/build-corporate-actions.mjs`.
2. Outputs:
   - `public/data/v2/corporate-actions/splits/latest.json`
   - `public/data/v2/corporate-actions/dividends/latest.json`
3. Add daily delta + optional bounded backfill mode.

### P1.3 DP5 News Pack (optional additive)
**Current evidence**
- News infra exists but not integrated as scoped data-plane product for 4-feature contract.

**Implement**
1. New script: `scripts/news/build-news-pack.mjs`.
2. Outputs:
   - `public/data/v2/news/top-movers.latest.json`
   - `public/data/v2/news/watchlist.latest.json`
3. Trigger conditions based on movers/anomaly lists; 24h cache and 3-day decay metadata.

### P1.4 Exchanges List Sync (new validator)
**Current evidence**
- No active exchanges-list integration found.

**Implement**
1. New script: `scripts/reference/sync-exchanges-list.mjs`.
2. Output: `public/data/v2/reference/exchanges.latest.json`.
3. Use only for symbol/exchange validation; do not bind runtime UX to it.

## P2 — Derived Products

### P2.1 DP4 Market Pulse
**Current evidence**
- Partial pulse/truth exists:
  - `scripts/pipeline/build-ndx100-pipeline-truth.mjs`
  - `scripts/ops/build-ops-daily.mjs`

**Implement**
1. New deterministic pulse composer: `scripts/pulse/build-market-pulse.mjs`.
2. Output: `public/data/v2/pulse/latest.json`.
3. Inputs: DP1 + optional DP2; no external calls.

### P2.2 FX normalization (conditional)
**Current evidence**
- Canonical universe currently has no exchange/currency fields and appears US-only.

**Implement**
- Defer in this phase; add explicit guard in docs: if non-USD symbols enter canonical universe, FX module becomes required before UI enablement.

### P2.3 Adjusted Series Incremental
**Current evidence**
- `adjClose` exists in bars but no explicit incremental adjusted pipeline contract.

**Implement**
1. New script: `scripts/eod/build-adjusted-series.mjs`.
2. Recompute only symbols affected by new splits/dividends delta.
3. Output: `public/data/v2/eod/adjusted/{symbol}.json` + manifest hash.

## P3 — UI Integration (Additive Only)

### P3.1 Shared data-age/fallback panel
**Implement**
1. New shared client helper: `public/assets/js/data-health-banner.js`.
2. Read source: `public/data/_meta/latest.json` + per-feature meta.
3. Inject into:
   - `public/index.html`
   - `public/elliott.html`
   - `public/scientific.html`
   - `public/forecast.html`

### P3.2 Stock Analyzer
**Current evidence**
- Uses `/api/stock`, `/api/fundamentals`, `/data/universe/all.json`, `/data/snapshots/stock-analysis.json`, `/data/marketphase/index.json`.

**Integrate**
- Add optional pulse/news cards from `v2` paths under feature-flag resolver.
- Do not alter existing core analysis table flow.

### P3.3 Elliott
**Current evidence**
- Uses `/api/elliott-scanner` and underlying `/data/eod/batches/eod.latest.000.json`.

**Integrate**
- Add adjusted/unadjusted toggle only after adjusted-series product is available and parity-tested.

### P3.4 Scientific
**Current evidence**
- Reads `stock-analysis.json` directly.

**Integrate**
- Add metadata display (asOf/build/source) from `_meta` and analysis `_meta`; keep ranking render unchanged.

### P3.5 Forecast trust UI
**Current evidence**
- Strong stale/circuit/last_good handling already present.

**Integrate**
- Add lineage fields (runId/commitSha/budget/fallback reason) into status doc, consumed as additive info.

## P4 — Retention & Cleanup

**Current evidence**
- Cleanup script exists (`scripts/cleanup-daily-snapshots.sh`) but not wired to active workflow.

**Implement**
1. New workflow: `.github/workflows/data-retention.yml`.
2. Dry-run summary first, then delete only non-latest snapshots older than policy.
3. Never delete `latest.json` and active `last_good` artifacts.

## P5 — Migration Strategy (30-day parallel)

1. Run v1 and v2 producers in parallel.
2. Daily diff checks (`jq` structural + count + asOf parity).
3. Publish report to `public/data/quality/latest.json`.
4. Only switch active version pointer after stable window.

## High-risk Caveats in This Repo

1. `universe-refresh` currently depends on EODHD fundamentals (tier conflict).
2. `market-prices/latest.json` active producer is not explicit in active workflows; treat this as a must-close gap before cutover.
3. `eod-latest` and `ops-daily` both write overlapping ops/pipeline paths with different concurrency groups.

## Minimal-diff Implementation Order

1. P0.2 drift gate + P0.4 quality report + P0.3 global pointer (no UI fetch change).
2. Fix universe producer tier conflict.
3. Formalize market-prices producer ownership (single active producer).
4. Add DP2 corporate actions + DP4 pulse.
5. Add UI additive panels under flag.
6. Run 30-day parity, then switch pointer.
