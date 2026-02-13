# 06_UI_TRUTH_PATH

## UI Fetch Map (SSOT_CHECK)
Evidence sources:
- `Report/A/04_SSOT_EVIDENCE/06_ui_fetch_map_raw.txt`
- `Report/A/04_SSOT_EVIDENCE/18_ui_snippets.txt`
- `Report/A/04_SSOT_EVIDENCE/25_forecast_update_table_snippet.txt`
- `Report/A/04_SSOT_EVIDENCE/26_index_marketphase_fetch_snippet.txt`

### Stock Analyzer (`public/index.html`)
Code evidence:
- Universe source: `public/index.html:512` (`UNIVERSE_URL = '/data/universe/all.json'`)
- Universe load + strict array expectation: `public/index.html:533-539`
- Optional Elliott support index fetch: `public/index.html:315-320` (`/data/marketphase/index.json`)
- API calls for selected ticker: `public/index.html:1757-1758` (`/api/stock`, `/api/fundamentals`)

Expected shape (from code):
- Universe: array of `{ticker,name}` (or equivalent fields normalized to ticker)
- Stock/Fundamentals APIs: JSON object envelopes; UI handles network/contract errors with fallback error payload

### Forecast UI (`public/forecast.html`)
Code evidence:
- Base path: `public/forecast.html:421` (`API_BASE = '/data/forecast'`)
- Fetches: `system/status.json` and `latest.json` (`public/forecast.html:703-707`)
- Render contract: `latest.data.forecasts` and `latest.meta.status/reason` (`public/forecast.html:716-720`)
- Empty-state behavior: `public/forecast.html:662-687`

Expected shape (from code):
- `status.json`: `status`, `circuit_state` (or `status.circuit.state`), `reason`
- `latest.json`: `data.forecasts[]`, `data.asof`, `meta.status`, `meta.reason`

### Elliott UI (`public/elliott.html`)
Code evidence:
- Fetch endpoint: `public/elliott.html:415`
- Uses `data.setups` only: `public/elliott.html:419-423`
- UI count displayed from filtered `setups.length`: `public/elliott.html:392`

Expected shape (from code):
- `/api/elliott-scanner` response with `setups[]`
- No UI disclosure of analyzed universe size (`universeCount/analyzedCount` not displayed)

## Base Construction / Hardcoding Scan
Evidence: `Report/A/04_SSOT_EVIDENCE/20_ui_absolute_url_scan.txt`

Result:
- No absolute `https://rubikvault.com/.../api` or `pages.dev/.../api` data fetch hardcoding found in UI JS paths.
- Absolute URLs found are social links and metadata, not data API bases.

## Client-Side Sabotage / Hardcap Scan
Evidence:
- broad scan: `Report/A/04_SSOT_EVIDENCE/05_universe_and_risk_scans.txt`
- targeted scan: `Report/A/04_SSOT_EVIDENCE/22_silent_shrink_targeted.txt`

Findings:
- No UI `slice(0,100)` / `limit=100` hardcap found in `public/index.html` or `public/elliott.html` data render path.
- `public/forecast.html:547` uses `promotions.slice(0, 5)` for the promotions widget only (not forecast universe coverage).

## UI Request Reproduction (DEPLOYED_CHECK)
Evidence root: `Report/A/02_DEPLOYED_EVIDENCE/`

Reproduced endpoints per base:
- `/data/universe/all.json`
- `/data/snapshots/market-prices/latest.json`
- `/data/forecast/latest.json`
- `/data/forecast/system/status.json`
- `/api/elliott-scanner`
- `/data/snapshots/stock-analysis.json`
- `/data/marketphase/index.json`
- `/api/stock?ticker=KO`
- `/api/fundamentals?ticker=KO`

Critical observed mismatch in UI path:
- `/data/marketphase/index.json` returns HTML 404 on both bases (`content_type_json=FAIL`, `jq_parse=FAIL`)
  - Evidence: `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md` (`data_marketphase_index.json` sections)
  - UI code fetches this path and silently returns on non-OK (`public/index.html:315-317`)
