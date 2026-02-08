# Evidence Log

## A) Repo state (commands)
```bash
git status --short
git rev-parse HEAD
git log -5 --oneline
```
Output:
```text
?? Report/RCA_2026-02-08/
e4214b958488c3738a5a3c977d3fee1e8087b5fa
e4214b95 docs(report): add branch and commit reference
ea67a698 fix(ops): never-empty-deploy gates + forecast last_good hardening
980c1d5e fix(ops): restore data tracking and artifacts
0c00d132 Merge pull request #106 from RubikVault/fix/main-green-wp16-e2e
40858b67 fix(ci): remove invalid secrets context from workflow if expressions
```

## B) Baseline live probes (pre-fix deploy state)
Command:
```bash
for u in https://00656f57.rubikvault-site.pages.dev https://dece36c6.rubikvault-site.pages.dev https://rubikvault.com; do
  for p in /data/snapshots/market-prices/latest.json /data/forecast/latest.json /data/forecast/system/status.json; do
    curl ... | jq ...
  done
done
```
Observed:
```text
00656f57 market-prices: HTTP 200, schema_version=3.0, asof=null, prices_count=1, rows_len=1
00656f57 forecast/latest: HTTP 200, rows_len=0, meta_status=circuit_open, reason="Missing price data 100.0% exceeds threshold 5%"
00656f57 forecast/status: HTTP 200, status=circuit_open, circuit_state=open

dece36c6 market-prices: HTTP 404

dece36c6 forecast/latest: HTTP 200, rows_len=0, meta_status=circuit_open

dece36c6 forecast/status: HTTP 404

rubikvault.com market-prices: HTTP 404
rubikvault.com forecast/latest: HTTP 200, rows_len=0, meta_status=circuit_open
rubikvault.com forecast/status: HTTP 200, status=ok, circuit_state=closed (inconsistent with latest)
```

## C) UI contract reads
- `public/forecast.html:428` uses `API_BASE='/data/forecast'`.
- `public/forecast.html:591` fetches `system/status.json`.
- `public/forecast.html:595` fetches `latest.json`.
- `public/forecast.html:548` renders table from `latest.data.forecasts`.
- `public/forecast.html:453` accepts both `status.circuit.state` and `status.circuit_state`.

## D) Pipeline/writer locations
- Forecast daily pipeline entrypoint: `.github/workflows/forecast-daily.yml:54` -> `node scripts/forecast/run_daily.mjs`.
- Market-prices build entrypoint: `.github/workflows/v3-scrape-template.yml:239` and `.github/workflows/wp16-manual-market-prices.yml:38` -> `node scripts/providers/market-prices-v3.mjs`.
- Final publish/promote: `.github/workflows/v3-scrape-template.yml:277` -> `node scripts/aggregator/finalize.mjs`.
