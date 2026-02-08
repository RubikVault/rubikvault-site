# Fix Implemented

## 1) Forecast ingest fallback to market-prices snapshot
Files:
- `scripts/forecast/snapshot_ingest.mjs:21`
- `scripts/forecast/snapshot_ingest.mjs:107`
- `scripts/forecast/snapshot_ingest.mjs:319`

Change:
- Added `loadMarketPricesSnapshot()` and merged snapshot prices as fallback when EOD batches are missing.
- Missing-ratio now uses merged price map (`batches + market-prices-fallback`).

## 2) Forecast latest contract hardening + non-empty fallback
Files:
- `scripts/forecast/report_generator.mjs:61`
- `scripts/forecast/report_generator.mjs:89`
- `scripts/forecast/report_generator.mjs:438`
- `scripts/forecast/report_generator.mjs:490`
- `scripts/forecast/run_daily.mjs:227`
- `scripts/forecast/run_daily.mjs:270`
- `scripts/forecast/run_daily.mjs:381`

Change:
- Added `data.asof` to latest envelope.
- On quality failure or zero generated forecasts: publish stale `last_good` instead of empty result.
- If no `last_good` exists, seed from `public/data/snapshots/stock-analysis.json` (real repo artifact) to avoid empty UI state.
- `updateLastGood` now refuses to overwrite with zero-forecast envelopes.

## 3) Market-prices generator hardened against low-coverage output
Files:
- `scripts/providers/market-prices-v3.mjs:1264`
- `scripts/providers/market-prices-v3.mjs:1457`
- `scripts/providers/market-prices-v3.mjs:1470`
- `scripts/providers/market-prices-v3.mjs:1564`

Change:
- Enforced coverage floor: `max(config.min, ceil(universe*0.95))`.
- Added fallback chain for insufficient coverage:
  1. previously published `public/data/snapshots/market-prices/latest.json`
  2. `public/data/snapshots/stock-analysis.json` seed
- Added registry path fallback to `functions/api/_shared/registry/providers.v1.json` when `public/data/registry` is missing.

## 4) CI contract gate hardened (semantic invariants)
File:
- `scripts/ci/verify-artifacts.mjs:6`
- `scripts/ci/verify-artifacts.mjs:38`
- `scripts/ci/verify-artifacts.mjs:58`
- `scripts/ci/verify-artifacts.mjs:74`

Change:
- Gate now fails if:
  - market-prices rows/asof/schema invalid (`>=517` required)
  - forecast latest has no rows or null `asof`
  - status lacks required consistency (reason when circuit-open)

## 5) Prod monitor hardened (JSON + semantic checks)
File:
- `.github/workflows/monitor-prod.yml:12`
- `.github/workflows/monitor-prod.yml:40`
- `.github/workflows/monitor-prod.yml:49`
- `.github/workflows/monitor-prod.yml:57`

Change:
- Added jq availability step.
- Added semantic assertions for market-prices, forecast latest, and forecast status endpoints.
- Staleness warning logic kept.

## 6) WP16 guard hardened for non-empty contract
File:
- `scripts/wp16/guard-market-prices.mjs:5`
- `scripts/wp16/guard-market-prices.mjs:29`
- `scripts/wp16/guard-market-prices.mjs:31`

Change:
- Guard now enforces `asof` and minimum coverage threshold (`RV_MIN_MARKET_PRICE_ROWS`, default 517).
- Allows approved fallback sources (`stooq`, `last_good`, `stock-analysis-seed`) and still blocks stub/null provider.

## 7) CI blockers resolved (determinism + schema validation)
Files:
- `public/data/forecast/models/registry.json`
- `schemas/snapshot-envelope.schema.json`

Change:
- Added required forecast registry file for `validate:forecast-registry` in CI determinism workflow.
- Extended snapshot envelope schema to allow optional top-level `meta`, matching current producer output.
