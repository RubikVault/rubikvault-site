# TRUTH_GRAPH

## 1) Workflow Inventory (20 files)
EVIDENCE:
- file: `.github/workflows`
- lines: directory listing
- excerpt: `ci-determinism.yml ... wp16-manual-market-prices.yml` (20 files total)
- why: complete workflow set to classify.

Workflows:
1. `ci-determinism.yml`
2. `ci-gates.yml`
3. `ci-policy.yml`
4. `cleanup-daily-snapshots.yml`
5. `e2e-playwright.yml`
6. `eod-history-refresh.yml`
7. `eod-latest.yml`
8. `forecast-daily.yml`
9. `forecast-monthly.yml`
10. `forecast-rollback.yml`
11. `forecast-weekly.yml`
12. `monitor-prod.yml`
13. `ops-auto-alerts.yml`
14. `ops-daily.yml`
15. `refresh-health-assets.yml`
16. `scheduler-kick.yml`
17. `universe-refresh.yml`
18. `v3-finalizer.yml`
19. `v3-scrape-template.yml`
20. `wp16-manual-market-prices.yml`

## 2) Published Artifact Index (feature-relevant subset)
EVIDENCE:
- command: `find public/data -type f | sort`
- excerpt:
  - `public/data/universe/all.json`
  - `public/data/snapshots/market-prices/latest.json`
  - `public/data/snapshots/stock-analysis.json`
  - `public/data/marketphase/index.json`
  - `public/data/eod/batches/eod.latest.000.json`
  - `public/data/forecast/latest.json`
  - `public/data/forecast/system/status.json`
  - `public/data/eod/bars/*.json`
- why: confirms on-disk runtime artifacts used by 4 features exist in repo tree.

## 3) Feature Cards + UI Read Set

### 3.1 Stock Analyzer
UI entrypoints:
- `public/index.html`
- `public/stock.html`

READS (runtime):
- `api`: `/api/stock?ticker=...`
- `api`: `/api/fundamentals?ticker=...`
- `static`: `/data/universe/all.json`
- `static`: `/data/snapshots/stock-analysis.json`
- `static`: `/data/marketphase/<TICKER>.json`

EVIDENCE:
- file: `public/index.html`
- lines: 512-538
- excerpt: `const UNIVERSE_URL = '/data/universe/all.json'; ... fetch(UNIVERSE_URL)`
- why: Stock Analyzer universe source is `all.json`.

EVIDENCE:
- file: `public/index.html`
- lines: 1760-1763
- excerpt: `fetchJson(`/api/stock?...`), fetchJson(`/api/fundamentals?...`)`
- why: main analyzer uses these 2 APIs.

EVIDENCE:
- file: `public/index.html`
- lines: 285-287
- excerpt: `fetch('/data/snapshots/stock-analysis.json')`
- why: analyzer overlays scientific snapshot.

EVIDENCE:
- file: `public/index.html`
- lines: 1612-1613
- excerpt: `fetchJson('/data/marketphase/${ticker}.json')`
- why: analyzer pulls Elliott/marketphase per symbol.

EVIDENCE:
- file: `public/stock.html`
- lines: 347-353
- excerpt: `fetch('/api/stock?ticker=...')`
- why: secondary stock page same API dependency.

API reader chain:
- `/api/stock` reads snapshots:
  - `/data/snapshots/universe/latest.json`
  - `/data/snapshots/market-prices/latest.json`
  - `/data/snapshots/market-stats/latest.json`
  - `/data/snapshots/market-score/latest.json`

EVIDENCE:
- file: `functions/api/stock.js`
- lines: 28-34
- excerpt: `SNAPSHOT_PATH_TEMPLATES ... MODULE_PATHS = ['universe','market-prices','market-stats','market-score']`
- why: exact snapshot modules for Stock API.

EVIDENCE:
- file: `functions/api/stock.js`
- lines: 869-893
- excerpt: `findRecord(snapshots['universe'|'market-prices'|'market-stats'|'market-score'])`
- why: stock payload is built from these snapshot modules.

### 3.2 Elliott Waves
UI entrypoint:
- `public/elliott.html`

READS:
- `api`: `/api/elliott-scanner`

EVIDENCE:
- file: `public/elliott.html`
- lines: 413-417
- excerpt: `const res = await fetch('/api/elliott-scanner')`
- why: Elliott UI runtime source.

API reader chain (`/api/elliott-scanner`):
- `static`: `/data/universe/all.json` (mode `full`)
- `static`: `/data/eod/batches/eod.latest.000.json`
- `static`: `/data/marketphase/index.json`
- `static`: `/data/marketphase/<ticker>.json`

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 107-111
- excerpt: `mode full -> '/data/universe/all.json'`
- why: canonical universe path in full mode.

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 226-233
- excerpt: reads `eod.latest.000.json` and `marketphase/index.json`
- why: direct dependencies for setup scan.

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 240-242
- excerpt: fetches `/data/marketphase/${ticker}.json`
- why: per-symbol Elliott/phase envelope input.

### 3.3 Scientific Analyzer
UI entrypoint:
- `public/scientific.html`

READS:
- `static`: `/data/snapshots/stock-analysis.json`

EVIDENCE:
- file: `public/scientific.html`
- lines: 669-673
- excerpt: `fetch('/data/snapshots/stock-analysis.json')`
- why: Scientific UI depends on one snapshot.

Also used on main analyzer page:
EVIDENCE:
- file: `public/index.html`
- lines: 283-288
- excerpt: `loadScientificData() -> fetch('/data/snapshots/stock-analysis.json')`
- why: snapshot affects both Scientific page and main Stock Analyzer page.

### 3.4 Forecast System
UI entrypoint:
- `public/forecast.html`

READS:
- `static`: `/data/forecast/system/status.json`
- `static`: `/data/forecast/latest.json`
- `static`: report referenced by `latest.data.latest_report_ref`

EVIDENCE:
- file: `public/forecast.html`
- lines: 421-431
- excerpt: `API_BASE='/data/forecast'; fetch(
  `${API_BASE}/${path}`)`
- why: Forecast UI static-read base path.

EVIDENCE:
- file: `public/forecast.html`
- lines: 703-707
- excerpt: `fetchData('system/status.json')`, `fetchData('latest.json')`
- why: entrypoint files for Forecast UI.

EVIDENCE:
- file: `public/forecast.html`
- lines: 723-728
- excerpt: loads report from `latest_report_ref`
- why: daily report dependency chain.

## 4) Reverse Trace (UI Read -> Producer Script -> Workflow)

### 4.1 `/data/universe/all.json`
Producer script:
- `scripts/universe/fetch-constituents.mjs` writes `all.json`.

Workflow:
- `universe-refresh.yml` runs the script.

EVIDENCE:
- file: `.github/workflows/universe-refresh.yml`
- lines: 31-34
- excerpt: `EODHD_API_KEY ... node scripts/universe/fetch-constituents.mjs`
- why: workflow invocation proof.

EVIDENCE:
- file: `scripts/universe/fetch-constituents.mjs`
- lines: 165-167
- excerpt: `filePath ... 'all.json'; fs.writeFileSync(...)`
- why: exact write path.

### 4.2 `/data/snapshots/market-prices/latest.json` and `/data/snapshots/market-stats/latest.json`
Producer chain:
- `v3-scrape-template.yml` runs `market-prices-v3.mjs` (matrix/fallback) + `market-stats-v3.mjs` and finalizer.
- `v3-finalizer.yml` also finalizes artifacts and promotes snapshots into `public/data/snapshots/*/latest.json`.
- `wp16-manual-market-prices.yml` is manual overlapping producer for market-prices + finalizer.

EVIDENCE:
- file: `.github/workflows/v3-scrape-template.yml`
- lines: 132-169
- excerpt: selects provider script and runs it.
- why: upstream scrape execution.

EVIDENCE:
- file: `.github/workflows/v3-scrape-template.yml`
- lines: 264-266
- excerpt: `node scripts/providers/market-stats-v3.mjs`
- why: explicit market-stats producer.

EVIDENCE:
- file: `.github/workflows/v3-scrape-template.yml`
- lines: 297-307
- excerpt: `node scripts/aggregator/finalize.mjs`
- why: publish/finalize step.

EVIDENCE:
- file: `scripts/aggregator/finalize.mjs`
- lines: 550-552, 584-586
- excerpt: promotes `tmp snapshots -> public/data/snapshots/<module>/latest.json`; writes `public/data/manifest.json`.
- why: exact publish path.

EVIDENCE:
- file: `.github/workflows/wp16-manual-market-prices.yml`
- lines: 31-42, 76-85
- excerpt: runs `market-prices-v3.mjs` then `finalize.mjs`.
- why: overlapping manual producer.

### 4.3 `/data/eod/batches/eod.latest.000.json`
Producer:
- `eod-latest.yml` -> `scripts/eod/build-eod-latest.mjs`.

EVIDENCE:
- file: `.github/workflows/eod-latest.yml`
- lines: 88-90
- excerpt: `node scripts/eod/build-eod-latest.mjs --out public/data`
- why: workflow invocation.

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 226-228
- excerpt: reads `/data/eod/batches/eod.latest.000.json`
- why: Elliott consumer proof.

### 4.4 `/data/eod/bars/*.json`
Producer:
- `eod-history-refresh.yml` -> `scripts/providers/eodhd-backfill-bars.mjs`.

Consumer:
- Forecast `run_daily` via `snapshot_ingest.loadPriceHistory` (requires long history).

EVIDENCE:
- file: `.github/workflows/eod-history-refresh.yml`
- lines: 31-42, 47
- excerpt: `EODHD_API_KEY ... node scripts/providers/eodhd-backfill-bars.mjs ... git add public/data/eod/bars`
- why: history writer path.

EVIDENCE:
- file: `scripts/forecast/snapshot_ingest.mjs`
- lines: 166-170, 183-189
- excerpt: reads `public/data/eod/bars/<ticker>.json` and slices history.
- why: Forecast history dependency.

### 4.5 `/data/marketphase/index.json` and `/data/marketphase/<ticker>.json`
Producer:
- `ops-daily.yml` -> `scripts/pipeline/build-marketphase-from-kv.mjs`.
- `scripts/ops/build-ops-daily.mjs` also ensures `index.json` fallback generation.

Consumers:
- `functions/api/elliott-scanner.js`
- `public/index.html` Elliott support overlay.

EVIDENCE:
- file: `.github/workflows/ops-daily.yml`
- lines: 58-64
- excerpt: `node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100`
- why: primary producer invocation.

EVIDENCE:
- file: `scripts/pipeline/build-marketphase-from-kv.mjs`
- lines: 400-401, 423
- excerpt: writes per-symbol paths and `data.symbols` index payload.
- why: output contract.

EVIDENCE:
- file: `scripts/ops/build-ops-daily.mjs`
- lines: 331-345
- excerpt: generates `public/data/marketphase/index.json` if missing.
- why: index fallback producer.

### 4.6 `/data/forecast/latest.json` + `/data/forecast/system/status.json`
Producer:
- `forecast-daily.yml` -> `scripts/forecast/run_daily.mjs` -> `report_generator.mjs`.

EVIDENCE:
- file: `.github/workflows/forecast-daily.yml`
- lines: 54-63
- excerpt: runs `node scripts/forecast/run_daily.mjs`.
- why: daily producer workflow.

EVIDENCE:
- file: `scripts/forecast/report_generator.mjs`
- lines: 364-379, 387-395
- excerpt: `updateStatus(...)`, `updateLatest(...)` writing status/latest.
- why: exact writes to Forecast UI entrypoints.

### 4.7 `stock-analysis.json` producer status (critical gap closure)
Proven writer script exists:
- `scripts/scientific-analyzer/generate-analysis.mjs` writes `public/data/snapshots/stock-analysis.json`.

EVIDENCE:
- file: `scripts/scientific-analyzer/generate-analysis.mjs`
- lines: 21, 535-537
- excerpt: output path and write call.
- why: direct producer script proof.

UNPROVABLE (automated workflow producer):
- No workflow invocation of `generate-analysis.mjs` or `build:scientific-analysis` found.
- searched_paths: `.github/workflows/*.yml`
- commands_used:
  - `rg -n "scientific-analyzer|stock-analysis" .github/workflows || true`
  - `rg -n "build:scientific-analysis|npm run" .github/workflows`
- why_not_provable: no matching workflow step exists; current artifact may be committed/manual/external.
- fallback attempts: scanned package scripts (`package.json`) and workflow npm invocations; still no producer chain.

## 5) Universe Consistency Proof (canonical 517)
Canonical source candidate proven:
- `public/data/universe/all.json`.

EVIDENCE:
- file: `public/index.html`
- lines: 512-536
- excerpt: `UNIVERSE_URL = '/data/universe/all.json'`
- why: Stock Analyzer consumes canonical universe.

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 107-111
- excerpt: full mode returns `/data/universe/all.json`.
- why: Elliott API canonical universe path in production/preview locked full mode.

EVIDENCE:
- file: `scripts/forecast/snapshot_ingest.mjs`
- lines: 19, 33-42
- excerpt: `UNIVERSE_PATH='public/data/universe/all.json'` and loader.
- why: Forecast ingest canonical universe.

EVIDENCE:
- file: `scripts/scientific-analyzer/generate-analysis.mjs`
- lines: 35
- excerpt: `UNIVERSE_FILE = 'public/data/universe/all.json'`
- why: Scientific snapshot generator canonical universe.

Count proof:
- command: `jq 'length' public/data/universe/all.json`
- output: `517`

Sanity symbols:
- command: `jq '[.[]|select((.ticker//.symbol)=="KO")]|length' public/data/universe/all.json`
- output: `1`
- command: `jq '[.[]|select((.ticker//.symbol)=="BRK.B")]|length' public/data/universe/all.json`
- output: `1`

Scientific snapshot count alignment:
- command: `jq '[keys[] | select(startswith("_")|not)] | length' public/data/snapshots/stock-analysis.json`
- output: `517`
- why: scientific artifact currently aligned to 517 symbol universe.

## 6) Provider Policy Proof (EODHD primary, TIINGO fallback only)

### 6.1 Compliant chains
EVIDENCE:
- file: `scripts/eod/build-eod-latest.mjs`
- lines: 278-287, 289-297
- excerpt: provider chain resolves EODHD then TIINGO (with typo-safe env fallback).
- why: EODHD primary, TIINGO fallback (compliant with stated policy).

EVIDENCE:
- file: `.github/workflows/eod-latest.yml`
- lines: 58-68
- excerpt: exports `EODHD_API_KEY`; maps `TIINGO_API_KEY` from TIINGO or TIIANGO secret.
- why: workflow env supports compliant provider order.

EVIDENCE:
- file: `.github/workflows/universe-refresh.yml`
- lines: 33-34
- excerpt: only `EODHD_API_KEY` for universe fetch.
- why: compliant primary provider for universe refresh.

### 6.2 Non-compliant reachable chains
EVIDENCE:
- file: `.github/workflows/v3-scrape-template.yml`
- lines: 136-139
- excerpt: `EODHD_API_KEY ... TIINGO_API_KEY ... RV_FORCE_PROVIDER: stooq`
- why: forced stooq primary (non-compliant).

EVIDENCE:
- file: `.github/workflows/wp16-manual-market-prices.yml`
- lines: 35-39
- excerpt: `RV_FORCE_PROVIDER: stooq`
- why: forced stooq primary (non-compliant).

EVIDENCE:
- file: `scripts/providers/market-prices-v3.mjs`
- lines: 1238-1254, 1324-1330
- excerpt: forced provider resolution + stooq fetch path.
- why: script honors stooq forced mode and can run stooq as primary.

### 6.3 Additional provider/contract inconsistency
UNPROVABLE (market-score real producer in current active workflow graph):
- `scripts/providers/market-score-v3.mjs` exists but no workflow invocation found.
- commands_used:
  - `rg -n "market-score-v3\.mjs" .github/workflows || true`
- why_not_provable: no active workflow step calls this script.
- fallback evidence: finalizer inserts placeholders for missing core modules.

EVIDENCE:
- file: `scripts/aggregator/finalize.mjs`
- lines: 41, 89-114
- excerpt: `CORE_MODULES` includes `market-score`; placeholder insertion if missing.
- why: explains why stock API can still read snapshot path even without real producer.

## 7) Compact Dependency Graph (text)
Stock Analyzer UI (`public/index.html`, `public/stock.html`)
-> `/api/stock` + `/api/fundamentals` + `/data/universe/all.json` + `/data/snapshots/stock-analysis.json` + `/data/marketphase/<ticker>.json`
-> `/api/stock` reads snapshots (`universe`, `market-prices`, `market-stats`, `market-score`)
-> snapshots produced by `v3-scrape-template.yml`/`v3-finalizer.yml` (+ overlap `wp16-manual-market-prices.yml`)
-> universe produced by `universe-refresh.yml`
-> marketphase produced by `ops-daily.yml`

Elliott UI (`public/elliott.html`)
-> `/api/elliott-scanner`
-> reads `/data/universe/all.json`, `/data/eod/batches/eod.latest.000.json`, `/data/marketphase/index.json`, `/data/marketphase/<ticker>.json`
-> producers: `universe-refresh.yml`, `eod-latest.yml`, `ops-daily.yml`

Scientific UI (`public/scientific.html`)
-> `/data/snapshots/stock-analysis.json`
-> writer script exists (`scripts/scientific-analyzer/generate-analysis.mjs`)
-> workflow producer UNPROVABLE (not found)

Forecast UI (`public/forecast.html`)
-> `/data/forecast/system/status.json`, `/data/forecast/latest.json`, report ref from latest
-> producer: `forecast-daily.yml` (`run_daily.mjs` + `report_generator.mjs`)
-> `run_daily.mjs` ingest depends on `all.json`, `eod.latest.*`, `market-prices snapshot`, and `eod/bars/*`
-> upstream producers: `universe-refresh.yml`, `eod-latest.yml`, `v3-scrape-template.yml`/`v3-finalizer.yml`, `eod-history-refresh.yml`

