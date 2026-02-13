# SECURITY

Generated: 2026-02-11T18:36:43Z

## Supply-chain pinning

- SHA-pinned actions: 0
- Mutable-tag actions: 58

| Workflow:line | uses | Risk |
|---|---|---|
| `.github/workflows/ci-determinism.yml:31` | `actions/checkout@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/ci-determinism.yml:34` | `actions/setup-node@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:22` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:102` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:105` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:275` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:278` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:355` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-gates.yml:416` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-policy.yml:19` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ci-policy.yml:21` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/cleanup-daily-snapshots.yml:26` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/e2e-playwright.yml:16` | `actions/checkout@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/e2e-playwright.yml:17` | `actions/setup-node@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/eod-history-refresh.yml:19` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/eod-history-refresh.yml:22` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/eod-latest.yml:28` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/eod-latest.yml:30` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/eod-latest.yml:46` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/eod-latest.yml:51` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-daily.yml:33` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-daily.yml:38` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-daily.yml:86` | `actions/upload-artifact@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-monthly.yml:29` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-monthly.yml:34` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-monthly.yml:83` | `actions/upload-artifact@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-rollback.yml:27` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-rollback.yml:32` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-rollback.yml:70` | `actions/github-script@v7` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-weekly.yml:29` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-weekly.yml:34` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/forecast-weekly.yml:95` | `actions/upload-artifact@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ops-auto-alerts.yml:19` | `actions/checkout@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/ops-auto-alerts.yml:22` | `actions/setup-node@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/ops-auto-alerts.yml:46` | `actions/github-script@v7` | P1_SUPPLY_CHAIN |
| `.github/workflows/ops-daily.yml:23` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ops-daily.yml:25` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ops-daily.yml:39` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/ops-daily.yml:44` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/refresh-health-assets.yml:16` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/refresh-health-assets.yml:21` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/scheduler-kick.yml:19` | `actions/checkout@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/scheduler-kick.yml:21` | `actions/setup-node@v4` | P1_SUPPLY_CHAIN |
| `.github/workflows/universe-refresh.yml:20` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/universe-refresh.yml:23` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-finalizer.yml:36` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-finalizer.yml:41` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-finalizer.yml:49` | `dawidd6/action-download-artifact@v6` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-finalizer.yml:58` | `dawidd6/action-download-artifact@v6` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:53` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:56` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:105` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:108` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:180` | `actions/upload-artifact@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:222` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/v3-scrape-template.yml:225` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/wp16-manual-market-prices.yml:19` | `actions/checkout@v4` | P0_SUPPLY_CHAIN |
| `.github/workflows/wp16-manual-market-prices.yml:24` | `actions/setup-node@v4` | P0_SUPPLY_CHAIN |

## Permissions × Concurrency × Write-path matrix

| Workflow | writes public/data | writes mirrors | concurrency | permissions | contents:write | Risk |
|---|---|---|---|---|---|---|
| `.github/workflows/ci-determinism.yml` | False | False | True | False | False | OK_OR_LOW |
| `.github/workflows/ci-gates.yml` | True | True | False | False | False | DATA_RACE_P0,PERMISSION_DRIFT_P1 |
| `.github/workflows/ci-policy.yml` | False | True | True | False | False | PERMISSION_DRIFT_P1 |
| `.github/workflows/cleanup-daily-snapshots.yml` | True | False | False | True | True | DATA_RACE_P0 |
| `.github/workflows/e2e-playwright.yml` | False | False | False | False | False | OK_OR_LOW |
| `.github/workflows/eod-history-refresh.yml` | True | False | True | True | True | OK_OR_LOW |
| `.github/workflows/eod-latest.yml` | True | False | True | True | True | OK_OR_LOW |
| `.github/workflows/forecast-daily.yml` | True | True | False | False | False | DATA_RACE_P0,PERMISSION_DRIFT_P1 |
| `.github/workflows/forecast-monthly.yml` | True | False | False | False | False | DATA_RACE_P0,PERMISSION_DRIFT_P1 |
| `.github/workflows/forecast-rollback.yml` | True | False | True | True | True | OK_OR_LOW |
| `.github/workflows/forecast-weekly.yml` | True | True | False | False | False | DATA_RACE_P0,PERMISSION_DRIFT_P1 |
| `.github/workflows/monitor-prod.yml` | False | False | False | False | False | OK_OR_LOW |
| `.github/workflows/ops-auto-alerts.yml` | False | False | True | True | False | OK_OR_LOW |
| `.github/workflows/ops-daily.yml` | True | False | True | True | True | OK_OR_LOW |
| `.github/workflows/refresh-health-assets.yml` | True | False | False | True | True | DATA_RACE_P0 |
| `.github/workflows/scheduler-kick.yml` | False | False | False | True | False | OK_OR_LOW |
| `.github/workflows/universe-refresh.yml` | True | False | False | True | True | DATA_RACE_P0 |
| `.github/workflows/v3-finalizer.yml` | True | False | True | True | True | OK_OR_LOW |
| `.github/workflows/v3-scrape-template.yml` | True | False | False | True | False | DATA_RACE_P0 |
| `.github/workflows/wp16-manual-market-prices.yml` | True | False | True | True | True | OK_OR_LOW |

## Secret hygiene

| Secret | Referenced in workflows | Notes |
|---|---|---|
| `ALPHAVANTAGE_API_KEY` | .github/workflows/v3-scrape-template.yml:122 |  |
| `CF_ACCOUNT_ID` | .github/workflows/ops-daily.yml:53; .github/workflows/ops-daily.yml:59; .github/workflows/ops-daily.yml:71 |  |
| `CF_API_TOKEN` | .github/workflows/ops-daily.yml:54; .github/workflows/ops-daily.yml:60; .github/workflows/ops-daily.yml:72 |  |
| `EODHD_API_KEY` | .github/workflows/eod-history-refresh.yml:31; .github/workflows/universe-refresh.yml:29 |  |
| `FINNHUB_API_KEY` | .github/workflows/v3-scrape-template.yml:123 |  |
| `FMP_API_KEY` | .github/workflows/v3-scrape-template.yml:121 |  |
| `FRED_API_KEY` | .github/workflows/v3-scrape-template.yml:124 |  |
| `GITHUB_TOKEN` | .github/workflows/eod-latest.yml:48; .github/workflows/ops-daily.yml:41; .github/workflows/refresh-health-assets.yml:18; .github/workflows/v3-finalizer.yml:38; .github/workflows/wp16-manual-market-prices.yml:21 |  |
| `POLYGON_API_KEY` | .github/workflows/v3-scrape-template.yml:120 |  |
| `RV_ADMIN_TOKEN` | .github/workflows/scheduler-kick.yml:36 |  |
| `TIIANGO_API_KEY` | .github/workflows/eod-latest.yml:66; .github/workflows/eod-latest.yml:67 | possible typo candidate |
| `TIINGO_API_KEY` | .github/workflows/eod-latest.yml:64; .github/workflows/eod-latest.yml:65 |  |
| `TWELVEDATA_API_KEY` | .github/workflows/v3-scrape-template.yml:125 |  |

### Typo risks
- Both TIIANGO_API_KEY and TIINGO_API_KEY referenced