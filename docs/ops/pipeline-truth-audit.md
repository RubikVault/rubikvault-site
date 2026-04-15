# Pipeline Truth Audit

## Writer-/Reader-Matrix

### Nightly Producer Chain

| Artifact | Writer | Reader(s) | Format | Role |
| --- | --- | --- | --- | --- |
| `public/data/reports/nightly-stock-analyzer-status.json` | `scripts/stock-analyzer/run_overnight_autopilot.sh` | night-supervisor, ops consumers | JSON | Nightly step-level heartbeat |
| `public/data/ops/release-state-latest.json` | `run-night-supervisor.mjs` | release-gate-check, dashboard | JSON | Pipeline end-to-end readiness |

### Recovery Chain

| Artifact | Writer | Reader(s) | Format | Role |
| --- | --- | --- | --- | --- |
| `public/data/reports/dashboard-green-recovery-latest.json` | `run-dashboard-green-recovery.mjs` | system-status, night-supervisor | JSON | Day-scoped recovery supervisor state |
| `mirrors/ops/dashboard-green/state.json` | `run-dashboard-green-recovery.mjs` | internal (self-resume) | JSON | Persistent recovery state |

### System Status Chain

| Artifact | Writer | Reader(s) | Format | Role |
| --- | --- | --- | --- | --- |
| `public/data/reports/system-status-latest.json` | `build-system-status-report.mjs` | dashboard-meta, recovery gate, runtime-report, epoch, operators | JSON | Central health/gating SSOT |
| `public/data/pipeline/runtime/latest.json` | `build-pipeline-runtime-report.mjs` | dashboard, operators | JSON | Runtime orchestrator state |
| `public/data/pipeline/epoch.json` | `build-pipeline-epoch.mjs` | finality checks, operators | JSON | Module-date watermarks + pipeline_ok |

### Dashboard / Presentation

| Artifact | Writer | Reader(s) | Format | Role |
| --- | --- | --- | --- | --- |
| `public/dashboard_v6_meta_data.json` | `generate_meta_dashboard_data.mjs` | dashboard UI | JSON | Derived presentation aggregate |
| `public/data/reports/data-freshness-latest.json` | `build-data-freshness-report.mjs` | system-status, recovery | JSON | Per-family freshness truth gate |

### Legacy (removed from live readers)

| Artifact | Status | Notes |
| --- | --- | --- |
| `public/data/reports/v5-autopilot-status.json` | **legacy** | No live reader references remain in `build-system-status-report.mjs` or `generate_meta_dashboard_data.mjs` |

## Current Ownership

| Step family | Primary owner | Recovery may restart? | Night supervisor may restart? |
| --- | --- | --- | --- |
| `market_data_refresh` | nightly / supervisor chain | yes | yes (after midnight lock-clear) |
| `q1_delta_ingest` | nightly / recovery | yes | no |
| `quantlab_daily_report` | nightly / recovery | yes | no |
| `forecast_daily` | nightly / recovery | yes | no |
| `hist_probs` | nightly / recovery / night-supervisor | yes | yes (up to 3 rebuilds) |
| `scientific_summary` | nightly / recovery | yes | no |
| `snapshot` | nightly / recovery | yes | no |
| `system_status` | recovery | yes | yes (periodic rebuild) |
| `dashboard_meta` | recovery | yes | yes (final rebuild) |

## Compute Audit

### `hist_probs` (Turbo Runner)

| Metric | Observed Value | Source |
| --- | --- | --- |
| Default workers | 1 (compute-audit gated) | `run-hist-probs-turbo.mjs`, `pipeline-compute-audit-latest.json` |
| Peak RSS (small scope) | ~670 MB | Repo evidence, plan reference |
| Full-universe initial Mac budget | 1.5 GiB | Plan reference |
| `NODE_OPTIONS` | `--max-old-space-size=6144` | night-supervisor, recovery |
| Resume support | `SKIP_EXISTING` (default on) | `run-hist-probs-turbo.mjs` L29 |
| Atomic writes | tmp+rename per ticker + summary | `writeSummaryAtomic()`, per-ticker in compute-outcomes |
| Universe source | `stocks_etfs.us_eu.rows.json` → registry.ndjson.gz fallback | `loadRequiredUniverse()` |
| Inactive tolerance | 5 trading days | `INACTIVE_TOLERANCE_TRADING_DAYS` |
| Min bars | 60 | `MIN_REQUIRED_BARS` |

### `forecast_daily`

| Metric | Observed Value | Source |
| --- | --- | --- |
| Execution | single-process `run_daily.mjs` | recovery step definition |
| Initial Mac budget | 1.0 GiB (plan reference) | Plan reference (~642 MB sample) |
| `NODE_OPTIONS` | `--max-old-space-size=6144` | recovery step command |
| Generate + Evaluate | split into `runGeneratePhase()` + `runEvaluatePhase()` | `run_daily.mjs` |
| Separate wrappers | `run_generate_daily.mjs`, `run_evaluate_matured_daily.mjs` | dedicated phase entry points + status artifacts |

## Repo-Verified Inconsistencies

- `nightly-stock-analyzer-status.json` can report `ok: true` while still carrying `lastError`.
- `dashboard-green-recovery-latest.json` reused `campaign_started_at` across days before the day-scoped reset was added.
- `system-status-latest.json` previously allowed `hist_probs` to stay green even when `tickers_total=0` and `tickers_covered=0`. Now guarded by `zero_coverage_guard`.
- Legacy `v5-autopilot-status.json` was wired into live summary generation before cleanup. All references removed.
- Night-supervisor `startEodhRefresh()` had a hardcoded `fromDate`. Now dynamically computed as today - 14 days.

## Precedence Order

1. Runtime and blocking health: `public/data/reports/system-status-latest.json`
2. Nightly producer detail: `public/data/reports/nightly-stock-analyzer-status.json`
3. Recovery supervisor detail: `public/data/reports/dashboard-green-recovery-latest.json`
4. Release readiness: `public/data/ops/release-state-latest.json`
5. Pipeline epoch: `public/data/pipeline/epoch.json`
6. Pipeline runtime: `public/data/pipeline/runtime/latest.json`
7. Dashboard presentation: `public/dashboard_v6_meta_data.json`

## Guardrails

- `public/data/pipeline/epoch.json` is the only same-day finality and freshness source for matured forecast evaluation.
- External TA libraries remain optional and non-default until parity is proven.
- Arrow/Parquet remains optional and may only be introduced after benchmark evidence shows clear gain.
