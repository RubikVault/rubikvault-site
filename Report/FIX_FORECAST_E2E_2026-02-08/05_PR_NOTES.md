# PR Notes — fix(forecast): E2E UI-green via semantic gates + last_good prices/forecast

## What broke
- Forecast UI consumed `/data/forecast/latest.json` and `/data/forecast/system/status.json`, but pipeline was opening circuit due 100% missing price ratio.
- `market-prices/latest.json` could be low-coverage (1 row, no `asof`) and still slip through insufficient semantic checks.

## Why this fix is correct
- It aligns the runtime with UI truth:
  - never-empty forecast path via stale `last_good` fallback
  - semantic minimums on market-prices/forecast/status contracts
- It avoids destructive behavior:
  - no UI path changes
  - no endpoint renames
  - no refactor of unrelated modules

## Quick validation commands
```bash
node scripts/ci/verify-artifacts.mjs
node scripts/forecast/run_daily.mjs --date=2026-02-08
curl -sS https://<preview>/data/snapshots/market-prices/latest.json | jq '{asof:(.asof // .metadata.as_of), rows:(.data|length)}'
curl -sS https://<preview>/data/forecast/latest.json | jq '{asof:.data.asof, rows:(.data.forecasts|length), status:.meta.status}'
curl -sS https://<preview>/data/forecast/system/status.json | jq '{status, circuit_state, reason}'
```

## Expected post-deploy state
- `/forecast` no longer shows `Circuit Open: Missing price data 100.0%`.
- Forecast table has >0 rows (or stale `last_good` with >0 rows).
- CI/monitor now fail loudly if semantic contract regresses.
