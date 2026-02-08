# Verification

## Local deterministic checks

### A) Forecast pipeline run (post-fix)
Command:
```bash
node scripts/forecast/run_daily.mjs --date=2026-02-08 | rg "Loaded prices for|Missing price data|Data quality OK|Generated [0-9]+ forecasts|Pipeline degraded"
```
Output:
```text
[Ingest] Loaded prices for 517 tickers (batches=0, market-prices-fallback=517)
Missing price data: 0.0%
✓ Data quality OK
Generated 0 forecasts
Pipeline degraded. Published last_good.
```
Interpretation:
- DQ no longer trips on missing EOD batches.
- Forecast publish is non-empty degraded mode (`stale`) via `last_good` instead of empty/circuit-open outage.

### B) Critical artifact semantic gate
Command:
```bash
node scripts/ci/verify-artifacts.mjs
```
Output:
```text
market-prices: rows=517 record_count=517 asof=2026-02-07 ✅
forecast/latest: forecast_rows=517 asof=2026-02-08 status=stale ✅
forecast/status: status=stale circuit_state=closed reason=Using last_good forecasts: no fresh forecasts generated ✅
Critical artifact semantic checks passed.
```

### C) Existing unit tests
Command:
```bash
npm run test:drop-threshold
npm run test:fetch-retry
npm run validate:forecast-registry
npx --yes ajv-cli@5 validate -s schemas/snapshot-envelope.schema.json -d public/data/snapshots/market-prices/latest.json
```
Output summary:
```text
test:drop-threshold -> Passed: 12, Failed: 0
All tests passed

test:fetch-retry -> Passed: 10, Failed: 0
All tests passed

validate:forecast-registry -> FORECAST REGISTRY VALIDATION PASSED
ajv snapshot-envelope -> market-prices/latest.json valid
```

### D) Market-prices publish guard
Command:
```bash
tmp_out=$(mktemp)
GITHUB_OUTPUT="$tmp_out" node scripts/wp16/guard-market-prices.mjs
cat "$tmp_out"
```
Output:
```text
valid=true
reason=ok
```

### E) Local HTTP smoke (served from repo root)
Command:
```bash
python3 -m http.server 8787
curl /public/data/... endpoints
```
Output:
```text
forecast_status=stale
forecast_rows=517
market_rows=517
market_asof=2026-02-07
```

## Deployment URL probe status at audit time
- Preview (`00656f57`) and production (`rubikvault.com`) still showed baseline pre-fix responses when probed in this run.
- This is expected until branch commit is pushed and deployed.

## No-regression smoke scope
- Verified endpoint availability on preview/prod for:
  - `/`, `/elliott.html`, `/scientific.html`, `/data/snapshots/stock-analysis.json`
- `marketphase/index.json` returned 404 on preview baseline but 200 on prod; no changes in this patch touched marketphase paths.
