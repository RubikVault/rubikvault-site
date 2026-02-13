# SECURITY

Generated: 2026-02-11T18:06:57Z

## Secrets Sanity
| SecretName | ReferencedInWorkflows | SuspectedTypos | Risk | Notes |
|---|---|---|---|---|
| ALPHAVANTAGE_API_KEY | 1 | none | LOW | none |
| CF_ACCOUNT_ID | 3 | none | LOW | none |
| CF_API_TOKEN | 3 | none | LOW | none |
| EODHD_API_KEY | 2 | none | LOW | none |
| FINNHUB_API_KEY | 1 | none | LOW | none |
| FMP_API_KEY | 1 | none | LOW | none |
| FRED_API_KEY | 1 | none | LOW | none |
| GITHUB_TOKEN | 5 | none | LOW | none |
| POLYGON_API_KEY | 1 | none | LOW | none |
| RV_ADMIN_TOKEN | 1 | none | LOW | none |
| TIIANGO_API_KEY | 2 | TIINGO/TIIANGO pair | HIGH | Both spellings present in eod-latest workflow |
| TIINGO_API_KEY | 2 | TIINGO/TIIANGO pair | HIGH | Both spellings present in eod-latest workflow |
| TWELVEDATA_API_KEY | 1 | none | LOW | none |

## Mutable Action Tag Pinning

```text
.github/workflows/ci-policy.yml:21:        uses: actions/setup-node@v4
.github/workflows/ci-determinism.yml:31:        uses: actions/checkout@v4
.github/workflows/ci-determinism.yml:34:        uses: actions/setup-node@v4
.github/workflows/ci-gates.yml:22:        uses: actions/checkout@v4
.github/workflows/ci-gates.yml:102:        uses: actions/checkout@v4
.github/workflows/ci-gates.yml:105:        uses: actions/setup-node@v4
.github/workflows/ci-gates.yml:275:        uses: actions/checkout@v4
.github/workflows/ci-gates.yml:278:        uses: actions/setup-node@v4
.github/workflows/ci-gates.yml:355:        uses: actions/checkout@v4
.github/workflows/ci-gates.yml:416:        uses: actions/checkout@v4
.github/workflows/eod-latest.yml:28:        uses: actions/checkout@v4
.github/workflows/eod-latest.yml:30:        uses: actions/setup-node@v4
.github/workflows/eod-latest.yml:46:        uses: actions/checkout@v4
.github/workflows/eod-latest.yml:51:        uses: actions/setup-node@v4
.github/workflows/forecast-daily.yml:33:        uses: actions/checkout@v4
.github/workflows/forecast-daily.yml:38:        uses: actions/setup-node@v4
.github/workflows/forecast-daily.yml:86:        uses: actions/upload-artifact@v4
.github/workflows/eod-history-refresh.yml:22:        uses: actions/setup-node@v4
.github/workflows/forecast-rollback.yml:32:        uses: actions/setup-node@v4
.github/workflows/forecast-rollback.yml:70:        uses: actions/github-script@v7
.github/workflows/refresh-health-assets.yml:16:        uses: actions/checkout@v4
.github/workflows/refresh-health-assets.yml:21:        uses: actions/setup-node@v4
.github/workflows/cleanup-daily-snapshots.yml:26:        uses: actions/checkout@v4
.github/workflows/forecast-monthly.yml:29:        uses: actions/checkout@v4
.github/workflows/forecast-monthly.yml:34:        uses: actions/setup-node@v4
.github/workflows/forecast-monthly.yml:83:        uses: actions/upload-artifact@v4
.github/workflows/ops-auto-alerts.yml:22:        uses: actions/setup-node@v4
.github/workflows/ops-auto-alerts.yml:46:        uses: actions/github-script@v7
.github/workflows/forecast-weekly.yml:29:        uses: actions/checkout@v4
.github/workflows/forecast-weekly.yml:34:        uses: actions/setup-node@v4
.github/workflows/forecast-weekly.yml:95:        uses: actions/upload-artifact@v4
.github/workflows/universe-refresh.yml:20:        uses: actions/checkout@v4
.github/workflows/universe-refresh.yml:23:        uses: actions/setup-node@v4
.github/workflows/wp16-manual-market-prices.yml:19:        uses: actions/checkout@v4
.github/workflows/wp16-manual-market-prices.yml:24:        uses: actions/setup-node@v4
.github/workflows/v3-finalizer.yml:36:        uses: actions/checkout@v4
.github/workflows/v3-finalizer.yml:41:        uses: actions/setup-node@v4
.github/workflows/v3-finalizer.yml:49:        uses: dawidd6/action-download-artifact@v6
.github/workflows/v3-finalizer.yml:58:        uses: dawidd6/action-download-artifact@v6
.github/workflows/v3-scrape-template.yml:53:        uses: actions/checkout@v4
.github/workflows/v3-scrape-template.yml:56:        uses: actions/setup-node@v4
.github/workflows/v3-scrape-template.yml:105:        uses: actions/checkout@v4
.github/workflows/v3-scrape-template.yml:108:        uses: actions/setup-node@v4
.github/workflows/v3-scrape-template.yml:180:        uses: actions/upload-artifact@v4
.github/workflows/v3-scrape-template.yml:222:        uses: actions/checkout@v4
.github/workflows/v3-scrape-template.yml:225:        uses: actions/setup-node@v4
.github/workflows/ops-daily.yml:23:        uses: actions/checkout@v4
.github/workflows/ops-daily.yml:25:        uses: actions/setup-node@v4
.github/workflows/ops-daily.yml:39:        uses: actions/checkout@v4
.github/workflows/ops-daily.yml:44:        uses: actions/setup-node@v4
.github/workflows/scheduler-kick.yml:19:        uses: actions/checkout@v4
.github/workflows/scheduler-kick.yml:21:        uses: actions/setup-node@v4
```

## Pinning Priority
| Priority | Rule | Workflows (evidence) |
|---|---|---|
| P0 | mutable action tag + writes public/data or mirrors | ci-gates, eod-latest, ops-daily, forecast-daily, forecast-weekly, forecast-monthly, v3-finalizer, v3-scrape-template, universe-refresh, refresh-health-assets |
| P1 | mutable action tag + secrets usage | scheduler-kick, ops-auto-alerts, eod-history-refresh, wp16-manual-market-prices |
| P2 | mutable action tag, read/test only | e2e-playwright, ci-determinism, ci-policy |

## Permissions × Concurrency × Write-path Matrix
| Workflow | Writes public/data | Writes mirrors | concurrency | permissions | contents:write evidence | Risk |
|---|---|---|---|---|---|---|
| ci-determinism.yml | no | no | yes | no | none | LOW |
| ci-gates.yml | yes | yes | no | no | none | P0_DATA_RACE |
| ci-policy.yml | no | yes | yes | no | none | LOW |
| cleanup-daily-snapshots.yml | yes | no | no | yes | 23:      contents: write | P0_DATA_RACE |
| e2e-playwright.yml | no | no | no | no | none | LOW |
| eod-history-refresh.yml | yes | no | yes | yes | 17:      contents: write | LOW |
| eod-latest.yml | yes | no | yes | yes | 14:  contents: write | LOW |
| forecast-daily.yml | yes | yes | no | no | none | P1_PERMISSION_DRIFT |
| forecast-monthly.yml | yes | no | no | no | none | P1_PERMISSION_DRIFT |
| forecast-rollback.yml | yes | no | yes | yes | 24:      contents: write | LOW |
| forecast-weekly.yml | yes | yes | no | no | none | P1_PERMISSION_DRIFT |
| monitor-prod.yml | no | no | no | no | none | LOW |
| ops-auto-alerts.yml | no | no | yes | yes | none | LOW |
| ops-daily.yml | yes | no | yes | yes | 9:  contents: write | LOW |
| refresh-health-assets.yml | yes | no | no | yes | 13:      contents: write | P0_DATA_RACE |
| scheduler-kick.yml | no | no | no | yes | none | LOW |
| universe-refresh.yml | yes | no | no | yes | 16:      contents: write | P0_DATA_RACE |
| v3-finalizer.yml | yes | no | yes | yes | 31:      contents: write | LOW |
| v3-scrape-template.yml | yes | no | no | yes | none | P0_DATA_RACE |
| wp16-manual-market-prices.yml | yes | no | yes | yes | 7:  contents: write | LOW |

## Dangerous trigger scan

```text
.github/workflows/v3-scrape-template.yml:296:          echo "Finalizer will be triggered automatically via workflow_run." >> $GITHUB_STEP_SUMMARY
.github/workflows/v3-finalizer.yml:4:  workflow_run:
```
