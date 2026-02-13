# INVENTORY

Generated: 2026-02-11T18:49:21Z

## ls -la .github/workflows
total 232
drwxr-xr-x@ 22 michaelpuchowezki  staff    704 Feb  9 15:46 .
drwxr-xr-x@  4 michaelpuchowezki  staff    128 Jan  7 12:31 ..
-rw-r--r--@  1 michaelpuchowezki  staff   1069 Feb  6 18:01 ci-determinism.yml
-rw-r--r--@  1 michaelpuchowezki  staff  17676 Feb 10 22:14 ci-gates.yml
-rw-r--r--@  1 michaelpuchowezki  staff    551 Feb  5 17:01 ci-policy.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2404 Jan 30 14:05 cleanup-daily-snapshots.yml
-rw-r--r--@  1 michaelpuchowezki  staff    610 Feb  8 20:25 e2e-playwright.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1576 Feb  6 21:58 eod-history-refresh.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3254 Feb 10 22:16 eod-latest.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2959 Feb  6 11:49 forecast-daily.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2803 Feb  5 00:38 forecast-monthly.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2734 Feb  5 17:01 forecast-rollback.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3798 Feb  5 00:38 forecast-weekly.yml
-rw-r--r--@  1 michaelpuchowezki  staff   7060 Feb 10 22:18 monitor-prod.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2868 Feb  5 17:02 ops-auto-alerts.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3110 Feb 10 22:16 ops-daily.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1171 Jan 30 14:05 refresh-health-assets.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2128 Feb  8 20:12 scheduler-kick.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1347 Feb  6 20:37 universe-refresh.yml
-rw-r--r--@  1 michaelpuchowezki  staff   8871 Feb  8 20:12 v3-finalizer.yml
-rw-r--r--@  1 michaelpuchowezki  staff  10979 Feb  8 20:12 v3-scrape-template.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3543 Feb  8 20:12 wp16-manual-market-prices.yml

## gh workflow list --all --json name,path,state,id
[
  {
    "id": 224941564,
    "name": "v3 Finalizer",
    "path": ".github/workflows/v3-finalizer.yml",
    "state": "active"
  },
  {
    "id": 225058763,
    "name": "v3 Scrape Template",
    "path": ".github/workflows/v3-scrape-template.yml",
    "state": "active"
  },
  {
    "id": 225061032,
    "name": "CI Gates - Quality & Budget Checks",
    "path": ".github/workflows/ci-gates.yml",
    "state": "active"
  },
  {
    "id": 225061033,
    "name": "Cleanup Daily Snapshots",
    "path": ".github/workflows/cleanup-daily-snapshots.yml",
    "state": "active"
  },
  {
    "id": 226498514,
    "name": "WP16 Manual - Market Prices (Stooq)",
    "path": ".github/workflows/wp16-manual-market-prices.yml",
    "state": "active"
  },
  {
    "id": 227016585,
    "name": "Refresh Health Assets",
    "path": ".github/workflows/refresh-health-assets.yml",
    "state": "active"
  },
  {
    "id": 227442620,
    "name": "Ops Daily Snapshot",
    "path": ".github/workflows/ops-daily.yml",
    "state": "active"
  },
  {
    "id": 227511913,
    "name": "EOD Latest (NASDAQ-100)",
    "path": ".github/workflows/eod-latest.yml",
    "state": "active"
  },
  {
    "id": 228731024,
    "name": "Scheduler Kick",
    "path": ".github/workflows/scheduler-kick.yml",
    "state": "active"
  },
  {
    "id": 228798833,
    "name": "e2e-playwright",
    "path": ".github/workflows/e2e-playwright.yml",
    "state": "active"
  },
  {
    "id": 230643544,
    "name": "Forecast Daily Pipeline",
    "path": ".github/workflows/forecast-daily.yml",
    "state": "active"
  },
  {
    "id": 230643545,
    "name": "Forecast Monthly Report",
    "path": ".github/workflows/forecast-monthly.yml",
    "state": "active"
  },
  {
    "id": 230643546,
    "name": "Forecast Weekly Training",
    "path": ".github/workflows/forecast-weekly.yml",
    "state": "active"
  },
  {
    "id": 230903513,
    "name": "CI Determinism Check",
    "path": ".github/workflows/ci-determinism.yml",
    "state": "active"
  },
  {
    "id": 230903514,
    "name": "CI Policy Check",
    "path": ".github/workflows/ci-policy.yml",
    "state": "active"
  },
  {
    "id": 230903515,
    "name": "EOD History Refresh",
    "path": ".github/workflows/eod-history-refresh.yml",
    "state": "active"
  },
  {
    "id": 230907136,
    "name": "Forecast Rollback",
    "path": ".github/workflows/forecast-rollback.yml",
    "state": "active"
  },
  {
    "id": 230907137,
    "name": "Ops Auto-Alerts",
    "path": ".github/workflows/ops-auto-alerts.yml",
    "state": "active"
  },
  {
    "id": 231381266,
    "name": "Universe Refresh",
    "path": ".github/workflows/universe-refresh.yml",
    "state": "active"
  },
  {
    "id": 232183192,
    "name": "Monitor Production Artifacts",
    "path": ".github/workflows/monitor-prod.yml",
    "state": "active"
  }
]
