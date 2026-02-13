# EXEC_SUMMARY

Generated: 2026-02-11T18:08:47Z

## Top findings
- Workflow inventory complete: 20 workflows under `.github/workflows/`.
- Highest operational risk clusters: WAF/403 blocks, missing registry artifacts in legacy v3 chain, low success rates in core daily pipelines.
- Direct delete is not evidence-safe in this run; archive-first protocol is required.
- Tooling limits: `yq` and `actionlint` missing; inventory done via `rg` + CLI evidence.

## Decision totals
- DEPRECATE+ARCHIVE: 3
- KEEP: 5
- REPAIR: 12

## Priority totals
- P0: 10
- P1: 4
- P2: 1
- P3: 5

## Workflow value + overlap + decision

| workflow | intended purpose | user/business value if healthy | overlap/single-path status | decision |
|---|---|---|---|---|
| v3-finalizer.yml | Legacy v3 scrape/finalize flow | Legacy v3 scrape/finalize pipeline for snapshots | HIGH (overlaps with newer eod/ops/ci paths) | DEPRECATE+ARCHIVE (P1) |
| v3-scrape-template.yml | Legacy v3 scrape/finalize flow | Legacy v3 scrape/finalize pipeline for snapshots | HIGH (overlaps with newer eod/ops/ci paths) | DEPRECATE+ARCHIVE (P1) |
| ci-gates.yml | CI quality and policy gates | Quality/safety gate before merge/deploy | LOW | REPAIR (P0) |
| cleanup-daily-snapshots.yml | Pipeline/quality workflow | Workflow utility / support | LOW | REPAIR (P0) |
| wp16-manual-market-prices.yml | Pipeline/quality workflow | Workflow utility / support | LOW | KEEP (P3) |
| refresh-health-assets.yml | Pipeline/quality workflow | Workflow utility / support | LOW | REPAIR (P0) |
| ops-daily.yml | Operational monitoring, pulse, scheduler control | Operational observability, liveness and automation control | LOW | REPAIR (P0) |
| eod-latest.yml | Build/refresh end-of-day market datasets | Publishes market EOD datasets used by downstream pipelines | LOW | REPAIR (P0) |
| scheduler-kick.yml | Operational monitoring, pulse, scheduler control | Operational observability, liveness and automation control | LOW | REPAIR (P0) |
| e2e-playwright.yml | E2E UI/runtime checks | Workflow utility / support | LOW | REPAIR (P1) |
| forecast-daily.yml | Forecast generation/training/rollback | Forecast generation/training/reporting for user-facing forecast data | LOW | REPAIR (P0) |
| forecast-monthly.yml | Forecast generation/training/rollback | Forecast generation/training/reporting for user-facing forecast data | MEDIUM (manual/scheduled niche) | REPAIR (P0) |
| forecast-weekly.yml | Forecast generation/training/rollback | Forecast generation/training/reporting for user-facing forecast data | LOW | REPAIR (P0) |
| ci-determinism.yml | CI quality and policy gates | Quality/safety gate before merge/deploy | LOW | REPAIR (P1) |
| ci-policy.yml | CI quality and policy gates | Quality/safety gate before merge/deploy | LOW | KEEP (P3) |
| eod-history-refresh.yml | Build/refresh end-of-day market datasets | Publishes market EOD datasets used by downstream pipelines | LOW | KEEP (P3) |
| forecast-rollback.yml | Forecast generation/training/rollback | Forecast generation/training/reporting for user-facing forecast data | MEDIUM (manual/scheduled niche) | DEPRECATE+ARCHIVE (P2) |
| ops-auto-alerts.yml | Operational monitoring, pulse, scheduler control | Operational observability, liveness and automation control | LOW | KEEP (P3) |
| universe-refresh.yml | Universe constituent refresh | Workflow utility / support | LOW | KEEP (P3) |
| monitor-prod.yml | Operational monitoring, pulse, scheduler control | Operational observability, liveness and automation control | LOW | REPAIR (P0) |

## Recommended next action
1. Execute P0 fix order from `FIX_PLAN.md` (WAF/auth -> v3 registry drift -> core daily failures).
2. Keep archive-first policy for any legacy candidates; no immediate deletes.
3. Re-run this audit after P0s to validate decision upgrades.
