# 00_REPO_REALITY

## 1) Repo Identity (Evidence)

### Command Output
```bash
$ pwd
/Users/michaelpuchowezki/Dev/rubikvault-site

$ git rev-parse --show-toplevel
/Users/michaelpuchowezki/Dev/rubikvault-site

$ git branch --show-current
main

$ git remote -v
origin  https://github.com/RubikVault/rubikvault-site.git (fetch)
origin  https://github.com/RubikVault/rubikvault-site.git (push)

$ git log -n 5 --oneline --decorate
96aaadd2 (HEAD -> main) fix(stock-analyzer): add price scale and fix marketphase data generation
42a09c17 Merge pull request #113 from RubikVault/codex/universe-refresh-push-retry
f49e0653 chore(universe): refresh index constituents [skip ci]
82d918eb fix(workflow): make universe-refresh push step race-safe
9e6a3fa6 data(scientific): refresh stock-analysis snapshot
```

### Tooling Evidence
```bash
gh 2.86.0
rg 15.1.0
jq 1.8.1
node v25.2.1
npm 11.6.2
```

## 2) Current UI Architecture (Evidence)

### Proven Runtime Shape
- Static Pages app with HTML/JS under `public/`
- Cloudflare Pages Functions under `functions/`
- No Next/Astro app structure detected.

### Evidence
- `package.json`:
  - `type: "module"`
  - `dev:pages = wrangler pages dev public ...`
- Functions tree exists and is populated (`functions/api/*`, `functions/data/*`).

## 3) Feature Entry Points and Read Paths (Evidence)

### Stock Analyzer
- UI entry: `public/index.html`, `public/stock.html`
- UI reads:
  - `/data/snapshots/stock-analysis.json`
  - `/data/marketphase/index.json`
  - `/data/universe/all.json`
  - `/api/stock?ticker=...`
  - `/api/fundamentals?ticker=...`
- Evidence:
  - `public/index.html:285`
  - `public/index.html:315`
  - `public/index.html:512`
  - `public/index.html:1801`
  - `public/index.html:1802`
  - `public/stock.html:347`

### Elliott Waves
- UI entry: `public/elliott.html`
- UI reads:
  - `/api/elliott-scanner`
- Evidence:
  - `public/elliott.html:415`

### Scientific Analyzer
- UI entry: `public/scientific.html`
- UI reads:
  - `/data/snapshots/stock-analysis.json`
- Evidence:
  - `public/scientific.html:671`

### Forecast System
- UI entry: `public/forecast.html`
- UI reads:
  - `/data/forecast/system/status.json`
  - `/data/forecast/latest.json`
- Evidence:
  - `public/forecast.html:421`
  - `public/forecast.html:703`
  - `public/forecast.html:707`
  - `public/forecast.html:655-680` (UI state handling for BOOTSTRAP/STALE/CIRCUIT_OPEN)

## 4) Producer/Consumer Reality Map (Evidence)

### Active workflow producers
| Producer Workflow | Script(s) | Writes/Commits |
|---|---|---|
| `.github/workflows/eod-latest.yml` | `scripts/eod/build-eod-latest.mjs` | `public/data/eod`, `public/data/pipeline`, `public/data/ops`, `public/data/ops-daily.json` |
| `.github/workflows/eod-history-refresh.yml` | `scripts/providers/eodhd-backfill-bars.mjs` | `public/data/eod/bars` |
| `.github/workflows/universe-refresh.yml` | `scripts/universe/fetch-constituents.mjs` | `public/data/universe/*.json` |
| `.github/workflows/scientific-daily.yml` | `scripts/scientific-analyzer/generate-analysis.mjs` | `public/data/snapshots/stock-analysis.json` |
| `.github/workflows/ops-daily.yml` | `build-marketphase-from-kv`, `build-ndx100-pipeline-truth`, `build-ops-daily`, `build-mission-control-summary`, `build-ops-pulse` | `public/data/pipeline/*.json`, `public/data/ops`, `public/data/ops-daily.json`, `public/data/marketphase/index.json` |
| `.github/workflows/forecast-daily.yml` | `scripts/forecast/run_daily.mjs` | `mirrors/forecast/**`, `public/data/forecast/**` |
| `.github/workflows/forecast-weekly.yml` | `scripts/forecast/run_weekly.mjs` | `mirrors/forecast/**`, `public/data/forecast/**` |

### Evidence for invocation and writes
- `.github/workflows/eod-latest.yml:89,116`
- `.github/workflows/eod-history-refresh.yml:48,55`
- `.github/workflows/universe-refresh.yml:34,51`
- `.github/workflows/scientific-daily.yml:43,58`
- `.github/workflows/ops-daily.yml:63,66,76,79,82,112`
- `.github/workflows/forecast-daily.yml:62,80-82`
- `.github/workflows/forecast-weekly.yml:58,84-87`

## 5) External Call Map (Current Reality)

### UI runtime external provider calls
- No direct provider URLs found in UI code (`public/`, `src/`).

### Evidence
```bash
$ rg -n "https?://(api\.)?(eodhd|eodhistoricaldata|tiingo|stooq|polygon|alphavantage|finnhub|twelvedata|fred)" public src
# no matches

$ rg -n "fetch\(['\"]https?://" public src
# no matches
```

### Server/provider call points (non-UI)
- EODHD adapter endpoint:
  - `functions/api/_shared/eodhd-adapter.mjs:40`
- Stock API provider-chain entry:
  - `functions/api/stock.js:3`
  - `functions/api/_shared/eod-providers.mjs:44-56`
- Fundamentals via Tiingo (+ FMP fallback):
  - `functions/api/fundamentals.js:121`
  - `functions/api/fundamentals.js:311-316`
- Universe refresh currently calls EODHD fundamentals endpoint:
  - `scripts/universe/fetch-constituents.mjs:50`

## 6) Current Artifact State Snapshot (Evidence)

### Command Output
```bash
universe_count=517
scientific_symbols=517
market_prices_schema=3.0
market_prices_records=517
market_prices_source=last_good
market_prices_asof=null
forecast_latest_status=stale
forecast_latest_reason=Using last_good forecasts: no fresh forecasts generated
forecast_latest_rows=517
forecast_status_status=stale
forecast_status_circuit=closed
marketphase_symbols=317
ops_pulse_schema=ops.pulse.v1
ops_pulse_pipelineOk=true
ops_pulse_asof=2026-02-12
```

## 7) Exchange/Currency Scope (Evidence)

### Proven in repo artifacts
- `public/data/universe/all.json` entries only include keys `ticker`, `name`.
- No `exchange`/`currency` fields in current canonical universe artifact.
- No non-US formatted symbols detected in canonical universe (`.` or `:` suffix pattern count = 0).

### Evidence
- `public/data/universe/all.json`:
  - keys check output: `["name","ticker"]`
- Command output:
  - `non_us_like_symbols_sample: []`
  - `count 0`

## 8) Analysis Boundaries / Unknowns
- Live production runtime behavior was not probed in this report run.
- This file is repo-forensic evidence only; deployed-state parity is addressed in validation planning files.
