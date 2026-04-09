# Dashboard V7 Monitor Handoff

This document is for a second LLM that must only monitor and, if required, restart the recovery flow for:

- `http://127.0.0.1:8788/dashboard_v7`
- `http://127.0.0.1:8788/analyze-v4/<TICKER>`

## Scope

- Monitoring window: every 15 minutes until the dashboard is fully green
- Allowed:
  - check status
  - verify running jobs
  - restart missing jobs
  - continue the next planned step when the previous step has finished
- Not allowed:
  - edit code
  - delete data
  - change contracts
  - start duplicate heavy jobs
  - run partial `hist_probs`
  - run partial `stock_analyzer_universe_audit`

## Current Snapshot

Snapshot taken: **2026-04-04 18:46 CEST**

Current system state:

- Dashboard summary: `critical`
- Primary blocker: `Historical probabilities are stale`
- Active SSOT violations:
  - `hist_probs_missing_etf_class`
  - `quantlab_canonical_lag`
  - `snapshot_quantlab_asof_lag`

Current confirmed processes:

- Wrangler Pages runtime is listening on `127.0.0.1:8788`
- Active long-run:
  - `python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date 2026-04-03 --full-scan-packs`
- Not currently confirmed running:
  - full `hist_probs`
  - full `stock_analyzer_universe_audit`

## Active 15-Minute Supervisor

Primary supervisor:

- `node scripts/ops/run-dashboard-green-recovery.mjs`

Launchd installer:

- `bash scripts/install_dashboard_green_watch_launchd.sh --run-now`

Primary proof files:

- `public/data/reports/dashboard-green-recovery-latest.json`
- `logs/dashboard_v7/recovery-heartbeat.log`
- `logs/dashboard_v7/recovery-actions.log`

Rules:

- every 15 minutes the supervisor writes a heartbeat
- only missing or stalled steps are restarted
- stalled means: process still exists but no log growth for 20+ minutes
- no partial `hist_probs`
- no partial universe audit

## Golden Rule

Do not try to be clever.

Only do these three things:

1. Keep the local web runtime alive.
2. Keep the planned long-running jobs alive.
3. Advance to the next documented step only after the current step is finished.

## Check Every 15 Minutes

Run these checks in this exact order:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site

date
jq '.summary, .ssot_violations' public/data/reports/system-status-latest.json
lsof -nP -iTCP:8788 -sTCP:LISTEN || true
ps aux | rg 'run_daily_delta_ingest_q1|run-hist-probs|build-stock-analyzer-universe-audit|wrangler|pages dev'
```

Then inspect the current critical steps:

```bash
jq '.steps.q1_delta_ingest, .steps.hist_probs, .steps.snapshot, .steps.stock_analyzer_universe_audit' public/data/reports/system-status-latest.json
```

## Exact Recovery Order

Do not reorder these steps.

### Phase A — Canonical Recovery

If `run_daily_delta_ingest_q1.py` is already running:

- do nothing
- do not start another ingest

If it is not running and `quantlab_canonical_lag` is still active:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date 2026-04-03 --full-scan-packs
```

### Phase B — Short Rebuild Block

Only after Phase A is complete, run:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/quantlab/build_quantlab_v4_daily_report.mjs
node scripts/build-fundamentals.mjs --force
node scripts/build-scientific-summary.mjs
node scripts/forecast/run_daily.mjs
node scripts/learning/run-daily-learning-cycle.mjs --date=2026-04-04
node scripts/build-best-setups-v4.mjs
node scripts/learning/diagnose-best-setups-etf-drop.mjs
```

### Phase C — Historical Full-Universe Run

Never run a partial variant.

Valid command:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
```

Invalid:

- `--max-tickers 10`
- `--asset-classes STOCK`
- explicit ticker lists

### Phase D — Full-Universe Audit

Only after Phase C is complete:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
```

### Phase E — Final Status Refresh

Only after Phase D is complete:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

## Restart Rules

### 1. Wrangler down

Condition:

- no process is listening on port `8788`

Restart:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
npm run dev:pages:persist:std
```

### 2. Ingest died before Canonical Lag is cleared

Condition:

- no active `run_daily_delta_ingest_q1.py`
- `quantlab_canonical_lag` still present in `system-status-latest.json`

Restart:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date 2026-04-03 --full-scan-packs
```

### 3. Hist-Probs died before green

Condition:

- no active `run-hist-probs`
- `hist_probs` still `critical`

Restart:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
```

### 4. Audit never ran or died

Condition:

- no active `build-stock-analyzer-universe-audit`
- `stock_analyzer_universe_audit.summary.full_universe != true`

Restart:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
```

## Where To Read Evidence

There is no guaranteed persistent stdout log file for every long job.

Use these artifacts as the source of truth:

| Area | File |
|---|---|
| Global status | `public/data/reports/system-status-latest.json` |
| Dashboard meta | `public/dashboard_v6_meta_data.json` |
| Hist probs run | `public/data/hist-probs/run-summary.json` |
| Hist probs regime | `public/data/hist-probs/regime-daily.json` |
| Forecast | `public/data/forecast/latest.json` |
| Scientific | `public/data/supermodules/scientific-summary.json` |
| Learning | `public/data/reports/learning-report-latest.json` |
| Snapshot | `public/data/snapshots/best-setups-v4.json` |
| Universe audit | `public/data/reports/stock-analyzer-universe-audit-latest.json` |

## Success Criteria

Stop only when all of these are true:

```bash
jq '.summary.severity, .ssot_violations, .steps.hist_probs.severity, .steps.stock_analyzer_universe_audit.severity' public/data/reports/system-status-latest.json
jq '.summary.full_universe, .summary.failure_family_count, .summary.severity' public/data/reports/stock-analyzer-universe-audit-latest.json
```

Required end state:

- `summary.severity = "ok"`
- `ssot_violations = []`
- `steps.hist_probs.severity = "ok"`
- `steps.stock_analyzer_universe_audit.severity = "ok"`
- `stock_analyzer_universe_audit.summary.full_universe = true`
- `stock_analyzer_universe_audit.summary.failure_family_count = 0`

## If In Doubt

- Do not edit anything.
- Do not delete anything.
- Do not start partial jobs.
- Only keep runtime alive and continue the next documented step.
