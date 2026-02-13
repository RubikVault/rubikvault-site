# 05_WORKFLOW_PLAN

## 1) Active Workflow Baseline (Evidence)

Current workflow files:
- `.github/workflows/ci-gates.yml`
- `.github/workflows/eod-history-refresh.yml`
- `.github/workflows/eod-latest.yml`
- `.github/workflows/forecast-daily.yml`
- `.github/workflows/forecast-rollback.yml`
- `.github/workflows/forecast-weekly.yml`
- `.github/workflows/monitor-prod.yml`
- `.github/workflows/ops-daily.yml`
- `.github/workflows/scheduler-kick.yml`
- `.github/workflows/scientific-daily.yml`
- `.github/workflows/universe-refresh.yml`

Evidence: `ls -la .github/workflows`.

## 2) Current Workflow-to-Artifact Coverage

| Workflow | Primary Outputs | Feature Impact |
|---|---|---|
| `eod-latest.yml` | `public/data/eod/*`, `public/data/pipeline/*`, `public/data/ops*` | Stock, Elliott, Forecast upstream |
| `eod-history-refresh.yml` | `public/data/eod/bars/*` | Stock/Forecast history fallback |
| `scientific-daily.yml` | `public/data/snapshots/stock-analysis.json` | Stock + Scientific |
| `ops-daily.yml` | `public/data/marketphase/index.json`, `public/data/pipeline/*`, `public/data/ops*` | Stock support + Elliott + ops visibility |
| `forecast-daily.yml` | `public/data/forecast/*`, `mirrors/forecast/*` | Forecast UI |
| `forecast-weekly.yml` | champion/challenger + forecast artifacts | Forecast model lifecycle |
| `universe-refresh.yml` | `public/data/universe/*.json` | all 4 features |
| `monitor-prod.yml` | verification only | guards |
| `ci-gates.yml` | verification only | guards |
| `scheduler-kick.yml` | GitHub-native dispatch | orchestration |

## 3) Required Workflow Changes for New Data Plane (Blueprint)

## W1) Keep and extend `eod-latest.yml`
- Keep as main daily EOD producer.
- Add shadow write mode (`public/data/v2/eod`, `public/data/v2/pipeline`).
- Add provider-budget and quality report steps.
- Preserve existing last_good behavior in script (`build-eod-latest` already has provider-empty fallback path).

Evidence to preserve:
- `.github/workflows/eod-latest.yml:89,116`
- `scripts/eod/build-eod-latest.mjs:278-305,526-535,670-673`

## W2) Replace tier-conflicting universe source in `universe-refresh.yml`
- Current script uses EODHD fundamentals endpoint (tier conflict).
- Rework workflow to run tier-safe constituent source (or static governance source) and keep output contract `public/data/universe/all.json`.

Evidence:
- `.github/workflows/universe-refresh.yml:34`
- `scripts/universe/fetch-constituents.mjs:50`

## W3) Add dedicated corporate-actions workflow
- New workflow proposal: `.github/workflows/corporate-actions-daily.yml`
- Writes:
  - `public/data/v2/corporate-actions/splits/latest.json`
  - `public/data/v2/corporate-actions/dividends/latest.json`
- Strictly EODHD allowed endpoints only.

## W4) Add exchanges-list sync workflow
- New workflow proposal: `.github/workflows/exchanges-sync.yml`
- Writes: `public/data/v2/reference/exchanges.latest.json`
- Use as validation/reference only.

## W5) Add optional news-pack workflow
- New workflow proposal: `.github/workflows/news-pack.yml`
- Triggered by movers/watchlist anomalies; 24h cache semantics.
- Writes `public/data/v2/news/*.json`.

## W6) Add retention workflow
- New workflow proposal: `.github/workflows/data-retention.yml`
- Calls `scripts/cleanup-daily-snapshots.sh` in dry-run + guarded mode.
- Keep latest and last_good artifacts untouched.

## 4) Parallel Producer Conflict Plan

## Proven overlap
- `eod-latest` commit paths include `public/data/pipeline` and `public/data/ops`.
  - `.github/workflows/eod-latest.yml:116`
- `ops-daily` commit paths include `public/data/pipeline` and `public/data/ops`.
  - `.github/workflows/ops-daily.yml:112`
- Concurrency groups are different (`eod-latest-*` vs `ops-daily-*`), so cross-workflow race remains possible.

## Workflow-level mitigation
1. Introduce shared concurrency group for overlapping write targets, e.g. `group: data-plane-writers-${{ github.ref_name }}` for both jobs.
2. Preserve per-workflow concurrency for non-overlapping jobs.
3. Keep retry-safe push blocks already present.

## 5) Missing Producer Ownership Gap to Close First

- `public/data/snapshots/market-prices/latest.json` is consumed by validators and runtime flows, but active workflow invocation of `market-prices` producer is not explicit.
- Evidence:
  - read check in monitor workflow: `.github/workflows/monitor-prod.yml:105`
  - producer script exists: `scripts/providers/market-prices-v3.mjs:21`
  - no active workflow invocation found via grep (`rg -n "market-prices-v3|snapshots/market-prices" .github/workflows/*.yml` only monitor read).

Action:
- Assign exactly one active producer workflow (single-writer law), or formally migrate consumers to DP1/v2 path with compatibility shim.

## 6) Local Verification Entry Points (Repo-supported)

Use these existing commands for local checks before workflow rollout:
- `npm ci`
- `npm run test:contracts`
- `node scripts/ci/verify-artifacts.mjs`
- `node scripts/eod/check-eod-artifacts.mjs`
- `npm run rv:eod:nasdaq100`
- `npm run build:scientific-analysis`

## 7) Recommended Trigger Order (Operational)

1. `universe-refresh` (when scheduled/manual refresh is needed)
2. `eod-latest`
3. `scientific-daily`
4. `ops-daily`
5. `forecast-daily`
6. `forecast-weekly` (weekly cadence)
7. `monitor-prod` + `ci-gates`

This order aligns upstream artifact dependencies and minimizes stale/circuit-open events in Forecast.
