# REALITY

Generated: 2026-02-11T18:42:20Z

| Workflow | last_run_at | success_rate_30 | last_success_at | failures_30 | top_signature | run_id | active |
|---|---|---:|---|---:|---|---:|---|
| `.github/workflows/ci-determinism.yml` | 2026-02-09T14:46:58Z | 69% | 2026-02-09T14:46:58Z | 4 | SCHEMA_MISSING_PROPERTY: determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6319305Z     params: { missingProperty: 'generated_at' }, | 21806609129 | yes |
| `.github/workflows/ci-gates.yml` | 2026-02-09T14:46:58Z | 60% | 2026-02-09T14:46:58Z | 12 | RATE_LIMIT_429: JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8975103Z ✅ HTTP 429 with Retry-After → uses header value | 21806564938 | yes |
| `.github/workflows/ci-policy.yml` | 2026-02-10T21:28:12Z | 92% | 2026-02-10T21:28:12Z | 0 | NONE: NONE | none | yes |
| `.github/workflows/cleanup-daily-snapshots.yml` | 2026-02-08T04:28:18Z | 100% | 2026-02-08T04:28:18Z | 0 | NONE: NONE | none | yes |
| `.github/workflows/e2e-playwright.yml` | 2026-02-09T14:46:58Z | 0% | NEVER | 30 | GHA_ERROR: ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7490702Z ##[error]Process completed with exit code 1. | 21829656565 | yes |
| `.github/workflows/eod-history-refresh.yml` | 2026-02-10T22:02:22Z | 100% | 2026-02-10T22:02:22Z | 0 | NONE: NONE | none | yes |
| `.github/workflows/eod-latest.yml` | 2026-02-10T22:57:39Z | 3% | 2026-02-10T22:57:39Z | 29 | GHA_ERROR: run	UNKNOWN STEP	2026-02-09T22:55:26.1445662Z ##[error]Process completed with exit code 1. | 21844075239 | yes |
| `.github/workflows/forecast-daily.yml` | 2026-02-10T21:37:13Z | 75% | 2026-02-10T21:37:13Z | 1 | CIRCUIT_OPEN: Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9557662Z   ❌ CIRCUIT OPEN: Missing price data 80.7% exceeds threshold 5% | 21766433410 | yes |
| `.github/workflows/forecast-monthly.yml` | NEVER | 0% | NEVER | 0 | NONE: NONE | none | yes |
| `.github/workflows/forecast-rollback.yml` | NEVER | 0% | NEVER | 0 | NONE: NONE | none | no |
| `.github/workflows/forecast-weekly.yml` | 2026-02-08T06:35:01Z | 100% | 2026-02-08T06:35:01Z | 0 | NONE: NONE | none | yes |
| `.github/workflows/monitor-prod.yml` | 2026-02-11T06:55:36Z | 0% | NEVER | 3 | HTTP_CURL_22: liveness	Check required artifact endpoints	2026-02-11T06:55:40.0042455Z curl: (22) The requested URL returned error: 403 | 21895644780 | yes |
| `.github/workflows/ops-auto-alerts.yml` | 2026-02-10T22:42:56Z | 100% | 2026-02-10T22:42:56Z | 0 | NONE: NONE | none | yes |
| `.github/workflows/ops-daily.yml` | 2026-02-11T07:59:36Z | 10% | 2026-02-11T07:59:36Z | 27 | LOG_ACCESS_BLOCKED: logs unavailable for runs: 21803567207, 21803184134, 21803088081, 21802921390, 21802869317 | 21803567207 | yes |
| `.github/workflows/refresh-health-assets.yml` | 2026-02-11T07:19:25Z | 81% | 2026-02-08T07:08:04Z | 3 | ENOENT_SEED_MANIFEST: refresh	Refresh health assets	2026-02-11T07:19:38.9032837Z Error: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/seed-manifest.json' | 21896163581 | yes |
| `.github/workflows/scheduler-kick.yml` | 2026-02-11T18:10:24Z | 0% | NEVER | 30 | WAF_CHALLENGE: kick	Trigger scheduler	2026-02-11T18:10:29.4040043Z <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robot | 21917167696 | yes |
| `.github/workflows/universe-refresh.yml` | 2026-02-06T19:38:03Z | 100% | 2026-02-06T19:38:03Z | 0 | NONE: NONE | none | yes |
| `.github/workflows/v3-finalizer.yml` | 2026-02-10T23:07:40Z | 0% | NEVER | 30 | ENOENT_MODULES: finalize	UNKNOWN STEP	2026-02-10T23:08:08.5865809Z ERROR: Failed to load registry: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json' | 21885907570 | yes |
| `.github/workflows/v3-scrape-template.yml` | 2026-02-10T23:07:25Z | 0% | NEVER | 30 | ENOENT_MODULES: prepare	UNKNOWN STEP	2026-02-10T23:07:34.2374274Z Error: Cannot find module './public/data/registry/modules.json' | 21885900868 | yes |
| `.github/workflows/wp16-manual-market-prices.yml` | 2026-02-08T17:54:07Z | 0% | NEVER | 30 | LOG_ACCESS_BLOCKED: logs unavailable for runs: 21802651686, 21802620069, 21802429619, 21802402954, 21802369475 | 21802651686 | yes |

## WAF / 403 Table

| Workflow | Signature class | Evidence | Classification |
|---|---|---|---|
| `.github/workflows/monitor-prod.yml` | HTTP_CURL_22 | liveness	Check required artifact endpoints	2026-02-11T06:55:40.0042455Z curl: (22) The requested URL returned error: 403 | WAF_CHALLENGE_OR_FORBIDDEN |
| `.github/workflows/scheduler-kick.yml` | WAF_CHALLENGE | kick	Trigger scheduler	2026-02-11T18:10:29.4040043Z <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robot | WAF_CHALLENGE_OR_FORBIDDEN |