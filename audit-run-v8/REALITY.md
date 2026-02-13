# REALITY

Generated: 2026-02-11T18:04:43Z

## Run Health (last 30)

| workflow_path | last_run_at | success_rate_30 | last_success_at | failures_30 | top_failure_signature | active |
|---|---|---:|---|---:|---|---|
| .github/workflows/v3-finalizer.yml | 2026-02-10T23:07:40Z | 0% | NEVER | 30 | ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json' | yes |
| .github/workflows/v3-scrape-template.yml | 2026-02-10T23:07:25Z | 0% | NEVER | 30 | Cannot find module './public/data/registry/modules.json' | yes |
| .github/workflows/ci-gates.yml | 2026-02-09T14:46:58Z | 60% | 2026-02-09T14:46:58Z | 12 | cloudflare'. Use an older or newer version. | yes |
| .github/workflows/cleanup-daily-snapshots.yml | 2026-02-08T04:28:18Z | 100% | 2026-02-08T04:28:18Z | 0 | NONE | yes |
| .github/workflows/wp16-manual-market-prices.yml | 2026-02-08T17:54:07Z | 0% | NEVER | 30 | NO_SIGNATURE_CAPTURED | yes |
| .github/workflows/refresh-health-assets.yml | 2026-02-11T07:19:25Z | 81% | 2026-02-08T07:08:04Z | 3 | ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/seed-manifest.json' | yes |
| .github/workflows/ops-daily.yml | 2026-02-11T07:59:36Z | 10% | 2026-02-11T07:59:36Z | 27 | NO_SIGNATURE_CAPTURED | yes |
| .github/workflows/eod-latest.yml | 2026-02-10T22:57:39Z | 3% | 2026-02-10T22:57:39Z | 29 | cloudflare'. Use an older or newer version. | yes |
| .github/workflows/scheduler-kick.yml | 2026-02-11T16:18:06Z | 0% | NEVER | 30 | Scheduler kick failed (HTTP 403) | yes |
| .github/workflows/e2e-playwright.yml | 2026-02-09T14:46:58Z | 0% | NEVER | 30 | cloudflare'. Use an older or newer version. | yes |
| .github/workflows/forecast-daily.yml | 2026-02-10T21:37:13Z | 75% | 2026-02-10T21:37:13Z | 1 | CIRCUIT OPEN: Missing price data 80.7% exceeds threshold 5% | yes |
| .github/workflows/forecast-monthly.yml | NEVER | 0% | NEVER | 0 | NONE | no |
| .github/workflows/forecast-weekly.yml | 2026-02-08T06:35:01Z | 100% | 2026-02-08T06:35:01Z | 0 | NONE | yes |
| .github/workflows/ci-determinism.yml | 2026-02-09T14:46:58Z | 68% | 2026-02-09T14:46:58Z | 4 | missingProperty: 'generated_at' }, | yes |
| .github/workflows/ci-policy.yml | 2026-02-10T21:28:12Z | 91% | 2026-02-10T21:28:12Z | 0 | NONE | yes |
| .github/workflows/eod-history-refresh.yml | 2026-02-10T22:02:22Z | 100% | 2026-02-10T22:02:22Z | 0 | NONE | yes |
| .github/workflows/forecast-rollback.yml | NEVER | 0% | NEVER | 0 | NONE | no |
| .github/workflows/ops-auto-alerts.yml | 2026-02-10T22:42:56Z | 100% | 2026-02-10T22:42:56Z | 0 | NONE | yes |
| .github/workflows/universe-refresh.yml | 2026-02-06T19:38:03Z | 100% | 2026-02-06T19:38:03Z | 0 | NONE | yes |
| .github/workflows/monitor-prod.yml | 2026-02-11T06:55:36Z | 0% | NEVER | 3 | curl: (22) The requested URL returned error: 403 | yes |

## WAF Detection (log evidence)

| workflow | run_id | evidence | classification |
|---|---:|---|---|
| Scheduler Kick | 21894211071 | Scheduler kick failed (HTTP 403) | WAF_CHALLENGE_OR_FORBIDDEN |
| Monitor Production Artifacts | 21895644780 | curl: (22) The requested URL returned error: 403 | UNKNOWN |

## Workflow age hints (for delete gate)

```bash
git log --diff-filter=A --follow --format='%h %ad %s' --date=iso -- .github/workflows/forecast-monthly.yml | tail -n 1
git log --diff-filter=A --follow --format='%h %ad %s' --date=iso -- .github/workflows/forecast-rollback.yml | tail -n 1
```
