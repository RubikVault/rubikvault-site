# 01_UI_DEPENDENCIES

## Probe Commands (exact)
- `rg -n "data/forecast|forecast/latest|forecast/system|system/status" public functions src || true`
  - Output: *(no matches)*
- `rg -n "market-prices/latest|snapshots/market-prices" public functions src || true`
  - Output: *(no matches)*

The exact probe patterns above returned no matches in `public/`, `functions/`, `src/`. A broader, path-specific probe was required to identify actual readers.

## Evidence: Forecast UI reads `/data/forecast/*`
- Command: `rg -n "forecast/latest\\.json|forecast/system/status\\.json|data/forecast|/api/forecast|forecast" public/forecast.html ...`
- Hits:
  - `public/forecast.html:428` (`const API_BASE = '/data/forecast';`)
  - `public/forecast.html:591` (`fetchData('system/status.json')` through API_BASE)
  - `public/forecast.html:595` (`fetchData('latest.json')` through API_BASE)
- Line excerpts:
  - `public/forecast.html:428` -> `const API_BASE = '/data/forecast';`
  - `public/forecast.html:430-434` -> `fetch(`${API_BASE}/${path}`)`
  - `public/forecast.html:589-608` -> loads `system/status.json` then `latest.json`

## Evidence: Other runtime checks read market-prices snapshot path
- `functions/api/mission-control/summary.js:1625` -> fetches `/data/snapshots/market-prices/latest.json`
- `functions/api/mission-control/summary.js:724` -> static contains check path `/data/snapshots/market-prices/latest.json`

## Interpretation
- Forecast page runtime dependency is static data under `/data/forecast/` (`latest.json`, optional `system/status.json`).
- Mission-control dependency includes `/data/snapshots/market-prices/latest.json`.
