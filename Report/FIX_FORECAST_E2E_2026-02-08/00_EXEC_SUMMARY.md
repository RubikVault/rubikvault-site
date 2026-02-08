# FIX_FORECAST_E2E — Executive Summary (2026-02-08)

## Verdict
- Local contract + pipeline verification is GREEN after patch.
- Deployment URLs (`https://00656f57.rubikvault-site.pages.dev`, `https://rubikvault.com`) were still serving pre-fix artifacts at probe time; post-push deploy verification is required.

## What was broken (baseline evidence)
- Preview `market-prices/latest.json` had only 1 row and no `asof`.
- Preview/prod `forecast/latest.json` had `rows_len=0` and `meta.status=circuit_open` with `Missing price data 100.0%`.
- Evidence in `01_EVIDENCE.md` (curl + jq output).

## What is fixed in repo
- Forecast ingest now falls back to `public/data/snapshots/market-prices/latest.json` (`scripts/forecast/snapshot_ingest.mjs:21`, `scripts/forecast/snapshot_ingest.mjs:107`, `scripts/forecast/snapshot_ingest.mjs:319`).
- Daily pipeline now degrades to `last_good` as `stale` (not empty) and includes `asof` in latest envelope (`scripts/forecast/run_daily.mjs:227`, `scripts/forecast/run_daily.mjs:270`, `scripts/forecast/run_daily.mjs:381`).
- `last_good` auto-seed from `stock-analysis` when missing (`scripts/forecast/report_generator.mjs:18`, `scripts/forecast/report_generator.mjs:89`, `scripts/forecast/report_generator.mjs:438`).
- Market-prices generator hardened:
  - 95% minimum coverage floor (`scripts/providers/market-prices-v3.mjs:1264`).
  - fallback chain: last published snapshot -> stock-analysis seed (`scripts/providers/market-prices-v3.mjs:1457`, `scripts/providers/market-prices-v3.mjs:1470`).
  - emits `asof`/`prices_count` aliases (`scripts/providers/market-prices-v3.mjs:1604`).
- CI semantic contract gate hardened (`scripts/ci/verify-artifacts.mjs:6`, `scripts/ci/verify-artifacts.mjs:38`, `scripts/ci/verify-artifacts.mjs:58`, `scripts/ci/verify-artifacts.mjs:74`).
- Prod monitor hardened to parse JSON + semantic assertions (`.github/workflows/monitor-prod.yml:12`, `.github/workflows/monitor-prod.yml:40`, `.github/workflows/monitor-prod.yml:49`, `.github/workflows/monitor-prod.yml:57`).
- WP16 guard now blocks low-coverage/asof-missing snapshots but allows approved fallback sources (`scripts/wp16/guard-market-prices.mjs:5`, `scripts/wp16/guard-market-prices.mjs:6`, `scripts/wp16/guard-market-prices.mjs:29`, `scripts/wp16/guard-market-prices.mjs:31`).

## Local success evidence
- `node scripts/ci/verify-artifacts.mjs` passes all three critical artifacts (rows/asof/status).
- `npm run test:drop-threshold` and `npm run test:fetch-retry` pass.
- Local pipeline run shows `Loaded prices for 517`, `Missing price data: 0.0%`, then safe stale fallback with non-empty forecasts (`04_VERIFICATION.md`).
