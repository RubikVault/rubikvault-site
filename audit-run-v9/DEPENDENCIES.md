# DEPENDENCIES

Generated: 2026-02-11T18:36:43Z

## Producers (upload-artifact / direct write refs)

| Workflow | Evidence |
|---|---|
| `.github/workflows/ci-determinism.yml` | none |
| `.github/workflows/ci-gates.yml` | L6:public/data/**; L13:public/data/**; L27:public/data; L28:public/data; L29:public/data/.budget_sentinel.json; L34:public/data |
| `.github/workflows/ci-policy.yml` | L7:mirrors/forecast/** |
| `.github/workflows/cleanup-daily-snapshots.yml` | L46:public/data; L52:public/data; L61:public/data |
| `.github/workflows/e2e-playwright.yml` | none |
| `.github/workflows/eod-history-refresh.yml` | L34:public/data/universe/all.json; L37:public/data/universe/nasdaq100.json; L47:public/data/eod/bars |
| `.github/workflows/eod-latest.yml` | L71:public/data; L98:public/data/eod; L98:public/data/pipeline; L98:public/data/ops; L98:public/data/ops-daily.json |
| `.github/workflows/forecast-daily.yml` | L86:uses: actions/upload-artifact@v4; L72:mirrors/forecast/ledger/; L73:mirrors/forecast/snapshots/; L74:public/data/forecast/ |
| `.github/workflows/forecast-monthly.yml` | L83:uses: actions/upload-artifact@v4; L72:public/data/forecast/reports/monthly/ |
| `.github/workflows/forecast-rollback.yml` | L43:public/data/forecast/system/status.json; L58:public/data/forecast/latest.json; L65:public/data/forecast |
| `.github/workflows/forecast-weekly.yml` | L95:uses: actions/upload-artifact@v4; L76:mirrors/forecast/challengers/; L77:mirrors/forecast/champion/; L78:mirrors/forecast/ledger/promotions/; L79:public/data/forecast/ |
| `.github/workflows/monitor-prod.yml` | none |
| `.github/workflows/ops-auto-alerts.yml` | none |
| `.github/workflows/ops-daily.yml` | L94:public/data/pipeline/*.json; L94:public/data/ops; L94:public/data/ops-daily.json |
| `.github/workflows/refresh-health-assets.yml` | L34:public/data; L40:public/data/system-health.json; L40:public/data/blocks/health.latest.json; L40:public/data/snapshots/health.json; L40:public/data/snapshots/health/latest.json |
| `.github/workflows/scheduler-kick.yml` | none |
| `.github/workflows/universe-refresh.yml` | L35:public/data/universe/; L38:public/data/universe/*.json;; L47:public/data/universe/ |
| `.github/workflows/v3-finalizer.yml` | L171:public/data/snapshots/${module}/latest.json; L193:public/data; L199:public/data; L209:public/data/snapshots; L210:public/data/state/modules/*.json; L211:public/data/manifest.json |
| `.github/workflows/v3-scrape-template.yml` | L180:uses: actions/upload-artifact@v4; L65:public/data/registry/modules.json |
| `.github/workflows/wp16-manual-market-prices.yml` | L89:public/data/snapshots/market-prices/latest.json; L89:public/data/snapshots/market-prices/; L90:public/data/snapshots; L90:public/data/state/modules/*.json; L90:public/data/manifest.json; L90:public/data/provider-state.json |

## Consumers (download-artifact / script read refs)

| Workflow | Evidence |
|---|---|
| `.github/workflows/ci-determinism.yml` | none |
| `.github/workflows/ci-gates.yml` | scripts/ci/verify-artifacts.mjs:L96; scripts/ci/verify-artifacts.mjs:L101; scripts/ci/verify-artifacts.mjs:L106; scripts/ci/assert-mission-control-gate.mjs:L5; scripts/eod/check-eod-artifacts.mjs:L7 |
| `.github/workflows/ci-policy.yml` | none |
| `.github/workflows/cleanup-daily-snapshots.yml` | none |
| `.github/workflows/e2e-playwright.yml` | none |
| `.github/workflows/eod-history-refresh.yml` | scripts/providers/eodhd-backfill-bars.mjs:L2; scripts/providers/eodhd-backfill-bars.mjs:L13 |
| `.github/workflows/eod-latest.yml` | scripts/ops/preflight-check.mjs:L106; scripts/eod/build-eod-latest.mjs:L26; scripts/ops/build-mission-control-summary.mjs:L104; scripts/ops/build-mission-control-summary.mjs:L106; scripts/ops/build-mission-control-summary.mjs:L109 |
| `.github/workflows/forecast-daily.yml` | scripts/forecast/run_daily.mjs:L383; scripts/forecast/run_daily.mjs:L384; scripts/forecast/run_daily.mjs:L390 |
| `.github/workflows/forecast-monthly.yml` | none |
| `.github/workflows/forecast-rollback.yml` | none |
| `.github/workflows/forecast-weekly.yml` | none |
| `.github/workflows/monitor-prod.yml` | none |
| `.github/workflows/ops-auto-alerts.yml` | none |
| `.github/workflows/ops-daily.yml` | scripts/ops/preflight-check.mjs:L106; scripts/pipeline/build-marketphase-from-kv.mjs:L64; scripts/pipeline/build-marketphase-from-kv.mjs:L282; scripts/pipeline/build-marketphase-from-kv.mjs:L465; scripts/pipeline/build-marketphase-from-kv.mjs:L466 |
| `.github/workflows/refresh-health-assets.yml` | none |
| `.github/workflows/scheduler-kick.yml` | none |
| `.github/workflows/universe-refresh.yml` | scripts/universe/fetch-constituents.mjs:L20 |
| `.github/workflows/v3-finalizer.yml` | scripts/aggregator/finalize.mjs:L35; scripts/aggregator/finalize.mjs:L36; scripts/aggregator/finalize.mjs:L517; scripts/aggregator/finalize.mjs:L639; scripts/wp16/guard-market-prices.mjs:L3 |
| `.github/workflows/v3-scrape-template.yml` | scripts/providers/market-prices-v3.mjs:L21; scripts/providers/market-prices-v3.mjs:L22; scripts/providers/market-prices-v3.mjs:L624; scripts/providers/market-prices-v3.mjs:L640; scripts/providers/market-prices-v3.mjs:L687 |
| `.github/workflows/wp16-manual-market-prices.yml` | scripts/providers/market-prices-v3.mjs:L21; scripts/providers/market-prices-v3.mjs:L22; scripts/providers/market-prices-v3.mjs:L624; scripts/providers/market-prices-v3.mjs:L640; scripts/providers/market-prices-v3.mjs:L687 |

## Workflow-call / workflow-run edges

| Workflow | Edge evidence |
|---|---|
| `.github/workflows/ci-determinism.yml` | none |
| `.github/workflows/ci-gates.yml` | none |
| `.github/workflows/ci-policy.yml` | none |
| `.github/workflows/cleanup-daily-snapshots.yml` | none |
| `.github/workflows/e2e-playwright.yml` | none |
| `.github/workflows/eod-history-refresh.yml` | none |
| `.github/workflows/eod-latest.yml` | none |
| `.github/workflows/forecast-daily.yml` | none |
| `.github/workflows/forecast-monthly.yml` | none |
| `.github/workflows/forecast-rollback.yml` | none |
| `.github/workflows/forecast-weekly.yml` | none |
| `.github/workflows/monitor-prod.yml` | none |
| `.github/workflows/ops-auto-alerts.yml` | none |
| `.github/workflows/ops-daily.yml` | none |
| `.github/workflows/refresh-health-assets.yml` | none |
| `.github/workflows/scheduler-kick.yml` | none |
| `.github/workflows/universe-refresh.yml` | none |
| `.github/workflows/v3-finalizer.yml` | L4:workflow_run: |
| `.github/workflows/v3-scrape-template.yml` | none |
| `.github/workflows/wp16-manual-market-prices.yml` | none |

## Orphan candidates (manual-only + no producer/consumer edges)

- `.github/workflows/forecast-rollback.yml`
- `.github/workflows/universe-refresh.yml`
- `.github/workflows/wp16-manual-market-prices.yml`