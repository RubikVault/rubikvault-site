# WORKFLOW_DECISIONS

## Provider Compliance Table (reachable producers)
| Workflow | Provider evidence | Compliance |
|---|---|---|
| `universe-refresh.yml` | `.github/workflows/universe-refresh.yml:33-34` (`EODHD_API_KEY`, `fetch-constituents.mjs`) | COMPLIANT |
| `eod-latest.yml` | `.github/workflows/eod-latest.yml:58-68`, `scripts/eod/build-eod-latest.mjs:278-287` | COMPLIANT (EODHD primary, TIINGO fallback) |
| `eod-history-refresh.yml` | `.github/workflows/eod-history-refresh.yml:31-42` (EODHD only) | COMPLIANT |
| `v3-scrape-template.yml` | `.github/workflows/v3-scrape-template.yml:139` (`RV_FORCE_PROVIDER: stooq`) | NON-COMPLIANT |
| `wp16-manual-market-prices.yml` | `.github/workflows/wp16-manual-market-prices.yml:38` (`RV_FORCE_PROVIDER: stooq`) | NON-COMPLIANT |
| Others | no direct market-data provider fetch in workflow | N/A |

## Decisions (all 20 workflows)

### 1) `ci-determinism.yml`
- Purpose (proven): Forecast determinism + registry/schema checks.
- Value if perfect: MEDIUM.
- Feature dependencies: `forecast`.
- Provider compliance: N/A.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/ci-determinism.yml`
- lines: 43-49
- excerpt: `npm run test:determinism`, `validate:forecast-registry`, `validate:forecast-schemas`
- why: quality gate for Forecast pipeline changes.

### 2) `ci-gates.yml`
- Purpose (proven): CI contract/quality/budget/semantic checks for published artifacts.
- Value if perfect: HIGH.
- Feature dependencies: `stock`, `elliott`, `forecast`.
- Provider compliance: N/A.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/ci-gates.yml`
- lines: 121-130
- excerpt: runs `verify-artifacts.mjs`, `assert-mission-control-gate.mjs`, `check-elliott-parity.mjs`
- why: directly validates feature-critical contracts.

### 3) `ci-policy.yml`
- Purpose (proven): forecast policy validation.
- Value if perfect: MEDIUM.
- Feature dependencies: `forecast`.
- Provider compliance: N/A.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/ci-policy.yml`
- lines: 24-27
- excerpt: `node scripts/forecast/validate_policy.mjs`
- why: prevents broken forecast policy state.

### 4) `cleanup-daily-snapshots.yml`
- Purpose (proven): periodic cleanup of `public/data` snapshots.
- Value if perfect: LOW (storage hygiene).
- Feature dependencies: none proven for runtime correctness.
- Provider compliance: N/A.
- Decision: ARCHIVE (for 4-feature scope).
EVIDENCE:
- file: `.github/workflows/cleanup-daily-snapshots.yml`
- lines: 41, 61-64
- excerpt: runs cleanup script, commits `public/data` deletions.
- why: maintenance workflow; not a producer required by UI truth-path.

### 5) `e2e-playwright.yml`
- Purpose (proven): E2E browser tests.
- Value if perfect: LOW for 4-feature scope (current test target is ops page).
- Feature dependencies: none direct for 4 target UIs.
- Provider compliance: N/A.
- Decision: ARCHIVE (or repurpose to 4-feature E2E).
EVIDENCE:
- file: `tests/e2e/ops.spec.mjs`
- lines: 16-18, 30-33
- excerpt: tests navigate only `/ops/`.
- why: existing test scope is ops dashboard, not the 4 target features.

### 6) `eod-history-refresh.yml`
- Purpose (proven): refresh long bar history under `public/data/eod/bars`.
- Value if perfect: HIGH.
- Feature dependencies: `forecast`.
- Provider compliance: COMPLIANT.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/eod-history-refresh.yml`
- lines: 31-42, 47
- excerpt: runs EODHD backfill and commits `public/data/eod/bars`.
- why: upstream history producer.

EVIDENCE:
- file: `scripts/forecast/run_daily.mjs`
- lines: 81-84
- excerpt: skips ticker if `closes.length < 200`.
- why: Forecast quality requires deep history; bars refresh materially impacts output coverage.

### 7) `eod-latest.yml`
- Purpose (proven): produce latest EOD batch + ops artifacts.
- Value if perfect: HIGH.
- Feature dependencies: `elliott`, `forecast` (and stock runtime freshness via shared infra).
- Provider compliance: COMPLIANT.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/eod-latest.yml`
- lines: 88-90
- excerpt: `node scripts/eod/build-eod-latest.mjs --out public/data`
- why: canonical latest EOD producer.

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 226-228
- excerpt: reads `/data/eod/batches/eod.latest.000.json`.
- why: Elliott feature consumes this output.

### 8) `forecast-daily.yml`
- Purpose (proven): run daily forecast pipeline and publish forecast artifacts.
- Value if perfect: HIGH.
- Feature dependencies: `forecast`.
- Provider compliance: N/A (consumer workflow).
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/forecast-daily.yml`
- lines: 54-63, 80-82
- excerpt: runs `run_daily.mjs`, commits `public/data/forecast` and mirrors ledgers.
- why: direct producer of Forecast UI entrypoint files.

### 9) `forecast-monthly.yml`
- Purpose (proven): generate monthly forecast reports.
- Value if perfect: LOW for current UI truth path.
- Feature dependencies: none direct proven (UI uses daily report ref from latest).
- Provider compliance: N/A.
- Decision: ARCHIVE.
EVIDENCE:
- file: `.github/workflows/forecast-monthly.yml`
- lines: 63, 79
- excerpt: runs `run_monthly.mjs`, commits only `reports/monthly`.
- why: no direct 4-feature runtime dependency.

EVIDENCE:
- file: `public/forecast.html`
- lines: 723-728
- excerpt: loads report via `latest.data.latest_report_ref`.
- why: runtime report source is latest pointer, not monthly folder.

### 10) `forecast-rollback.yml`
- Purpose (proven): manual rollback of Forecast status/latest and issue creation.
- Value if perfect: MEDIUM (operational safety for Forecast feature).
- Feature dependencies: `forecast` (incident recovery path).
- Provider compliance: N/A.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/forecast-rollback.yml`
- lines: 43-59, 65-67
- excerpt: rewrites `public/data/forecast/system/status.json`, optionally restores `latest.json`, commits/pushes.
- why: explicit rollback mechanism for Forecast UI state.

### 11) `forecast-weekly.yml`
- Purpose (proven): challenger training + promotion.
- Value if perfect: MEDIUM.
- Feature dependencies: `forecast`.
- Provider compliance: N/A.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/forecast-weekly.yml`
- lines: 58, 84-87
- excerpt: runs weekly pipeline and updates champion/challenger/public forecast assets.
- why: maintains model/champion freshness used by daily forecast.

EVIDENCE:
- file: `scripts/forecast/run_daily.mjs`
- lines: 202-204
- excerpt: `loadPolicy`, `loadChampion` each daily run.
- why: weekly champion updates flow into daily forecast behavior.

### 12) `monitor-prod.yml`
- Purpose (proven): artifact contract monitoring (repo + optional remote probes).
- Value if perfect: MEDIUM (guardrail, not producer).
- Feature dependencies: indirect guard for `stock`, `elliott`, `forecast`.
- Provider compliance: N/A.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/monitor-prod.yml`
- lines: 37-47
- excerpt: runs `verify-artifacts.mjs` and mission-control gate.
- why: monitors feature-critical contract integrity.

### 13) `ops-auto-alerts.yml`
- Purpose (proven): create GitHub issues from `dev/ops/forecast/latest.json`.
- Value if perfect: NONE for 4-feature correctness.
- Feature dependencies: none proven.
- Provider compliance: N/A.
- Decision: ARCHIVE.
EVIDENCE:
- file: `.github/workflows/ops-auto-alerts.yml`
- lines: 30-33, 74-76
- excerpt: reads `dev/ops/forecast/latest.json` and files issues.
- why: dev ops alerting path, not runtime dependency for target features.

### 14) `ops-daily.yml`
- Purpose (proven): builds marketphase + ops summaries/pulse.
- Value if perfect: HIGH.
- Feature dependencies: `elliott`, `stock` (index Elliott support), plus ops guards.
- Provider compliance: N/A (reads KV/internal).
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/ops-daily.yml`
- lines: 58-64, 71-82
- excerpt: builds marketphase from KV and ops outputs.
- why: producer for marketphase files used by Elliott/Stock paths.

EVIDENCE:
- file: `functions/api/elliott-scanner.js`
- lines: 230-242
- excerpt: reads `marketphase/index.json` and per-symbol marketphase files.
- why: confirms downstream feature dependency.

### 15) `refresh-health-assets.yml`
- Purpose (proven): generate system health snapshots.
- Value if perfect: NONE for 4-feature runtime correctness.
- Feature dependencies: none proven in target feature paths.
- Provider compliance: N/A.
- Decision: ARCHIVE.
EVIDENCE:
- file: `.github/workflows/refresh-health-assets.yml`
- lines: 33, 44
- excerpt: writes `system-health.json` + health block snapshots.
- why: health dashboard asset refresh, not target feature producer.

### 16) `scheduler-kick.yml`
- Purpose (proven): GitHub-native hourly dispatcher for core workflows.
- Value if perfect: LOW-MEDIUM (orchestration), overlapping with native schedules in target workflows.
- Feature dependencies: indirect (dispatches eod/ops/forecast workflows).
- Provider compliance: N/A.
- Decision: MERGE (consolidate with native schedules), then ARCHIVE dispatcher.
EVIDENCE:
- file: `.github/workflows/scheduler-kick.yml`
- lines: 73-77, 96-100
- excerpt: dispatches `ops-daily.yml`, `forecast-daily.yml`, `eod-latest.yml` by hour.
- why: explicit orchestration role.

EVIDENCE:
- file: `.github/workflows/eod-latest.yml`
- lines: 4-6
- excerpt: has own schedule.
- why: overlap with dispatcher.

EVIDENCE:
- file: `.github/workflows/ops-daily.yml`
- lines: 4-6
- excerpt: has own schedule.
- why: overlap with dispatcher.

EVIDENCE:
- file: `.github/workflows/forecast-daily.yml`
- lines: 10-13
- excerpt: has own schedule.
- why: overlap with dispatcher.

### 17) `universe-refresh.yml`
- Purpose (proven): refresh canonical universe files including `all.json`.
- Value if perfect: HIGH.
- Feature dependencies: `stock`, `elliott`, `scientific`(via generator), `forecast`.
- Provider compliance: COMPLIANT.
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/universe-refresh.yml`
- lines: 31-34, 51-52
- excerpt: runs fetch and commits `public/data/universe/`.
- why: canonical universe producer.

### 18) `v3-finalizer.yml`
- Purpose (proven): final publish gate for v3 snapshot artifacts to `public/data/snapshots/*`.
- Value if perfect: HIGH.
- Feature dependencies: `stock`, `forecast` (market-prices fallback), indirectly `elliott` via stock overlays.
- Provider compliance: N/A (publisher).
- Decision: KEEP.
EVIDENCE:
- file: `.github/workflows/v3-finalizer.yml`
- lines: 152-175, 206-208, 247-250
- excerpt: runs finalizer, verifies core snapshots, commits snapshots/manifest/provider-state.
- why: publishes stock API source snapshots.

EVIDENCE:
- file: `functions/api/stock.js`
- lines: 28-34, 869-893
- excerpt: stock API reads these snapshot modules.
- why: direct feature consumer.

### 19) `v3-scrape-template.yml`
- Purpose (proven): scrape module artifacts feeding finalizer publish path.
- Value if perfect: HIGH.
- Feature dependencies: `stock`, `forecast` (fallback input), partial `elliott` support chain.
- Provider compliance: NON-COMPLIANT (forced stooq).
- Decision: REPAIR.
EVIDENCE:
- file: `.github/workflows/v3-scrape-template.yml`
- lines: 132-169, 297-307
- excerpt: provider script run + finalizer publish.
- why: core snapshot production path.

EVIDENCE:
- file: `.github/workflows/v3-scrape-template.yml`
- lines: 136-139
- excerpt: `RV_FORCE_PROVIDER: stooq`.
- why: violates stated provider policy.

### 20) `wp16-manual-market-prices.yml`
- Purpose (proven): manual market-prices build + finalizer publish.
- Value if perfect: LOW (overlap with v3-scrape-template path).
- Feature dependencies: overlapping producer only.
- Provider compliance: NON-COMPLIANT.
- Decision: ARCHIVE (after v3 repair), or MERGE into single producer path.
EVIDENCE:
- file: `.github/workflows/wp16-manual-market-prices.yml`
- lines: 31-42, 76-85
- excerpt: runs same `market-prices-v3.mjs` + `finalize.mjs` chain manually.
- why: duplicate producer route.

EVIDENCE:
- file: `.github/workflows/wp16-manual-market-prices.yml`
- lines: 38
- excerpt: `RV_FORCE_PROVIDER: stooq`
- why: non-compliant forced primary provider.

## UNPROVABLE / Exhausted Searches

### U1) Automated workflow producer for `public/data/snapshots/stock-analysis.json`
Status: UNPROVABLE (no workflow evidence found).
- searched_paths: `.github/workflows/*.yml`, `package.json`, `scripts/`
- commands_used:
  - `rg -n "scientific-analyzer|stock-analysis" .github/workflows || true`
  - `rg -n "build:scientific-analysis|npm run" .github/workflows`
- result: no workflow step invokes scientific generation script.
- proven fallback fact: artifact currently exists and UI reads it.

### U2) Real producer invocation for `market-score` snapshot in active workflows
Status: UNPROVABLE for active invocation (script exists, workflow call not found).
- commands_used:
  - `rg -n "market-score-v3\.mjs" .github/workflows || true`
- result: no match.
- related evidence:
  - `scripts/aggregator/finalize.mjs:41,89-114` inserts placeholders for missing core modules.
- implication: stock API can resolve path presence without confirmed live market-score producer.

## Merge/Consolidation Candidates (proof-backed)
1. `scheduler-kick.yml` + native schedules (`eod-latest.yml`, `ops-daily.yml`, `forecast-daily.yml`) -> single scheduling strategy.
2. `wp16-manual-market-prices.yml` + `v3-scrape-template.yml` -> single market-prices producer path after provider-policy repair.

