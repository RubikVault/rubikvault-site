# Dashboard V7 + Stock Analyzer Runbook

This is the **single operational entrypoint** for the live status chain behind:

- `http://127.0.0.1:8788/dashboard_v7`
- `http://127.0.0.1:8788/`
- `http://127.0.0.1:8788/analyze-v4/<TICKER>`

> **For a dumb LLM:** Open `http://127.0.0.1:8788/dashboard_v7` → Operations tab → read "SSOT Violations" first, then "Stock Analyzer Universe Audit", then "Ordered Recovery Plan", then "SSOT Recovery Runbook", then "Web Validation Chain". Every problem has an exact fix command or an explicit manual contract-repair callout.

---

## SSOT — Single Sources Of Truth

| What | File | Producer |
|------|------|---------|
| Operational status | `public/data/reports/system-status-latest.json` | `node scripts/ops/build-system-status-report.mjs` |
| Dashboard aggregation | `public/dashboard_v6_meta_data.json` | `node scripts/generate_meta_dashboard_data.mjs` |
| Stock Analyzer universe audit | `public/data/reports/stock-analyzer-universe-audit-latest.json` | `node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0` |
| SSOT step contracts | `scripts/ops/system-status-ssot.mjs` | (static — edit to change contracts) |
| SSOT violation contracts | `scripts/ops/system-status-ssot.mjs` (`SSOT_VIOLATION_CONTRACTS`) | (static) |
| Web analyzable universe | `public/data/universe/v7/ssot/stocks.max.symbols.json` | `node scripts/universe-v7/build-stock-ssot.mjs` |
| Canonical IDs | `public/data/universe/v7/ssot/stocks.max.canonical.ids.json` | same |
| Analyzer UI rules | `docs/ops/stock-analyzer-ui-ssot.md` | (static) |
| Learning segmentation | `docs/ops/learning-segmentation-ssot.md` | (static) |
| API envelope contract | `docs/ops/contract.md` | (static) |
| Architecture | `docs/ops/architecture.md` | (static) |
| P0/P1 hardening contracts | `docs/ops/P0_P1_HARDENING_CONTRACTS.md` | (static) |

---

## Documentation Map (Full Repo)

### Operational
| Doc | Purpose |
|-----|---------|
| `docs/ops/runbook.md` ← **you are here** | Central ops runbook: recovery, SSOT, validation chain |
| `docs/ops/dashboard-v7-monitor-handoff.md` | Non-destructive monitor handoff for a second LLM; check/restart only |
| `scripts/ops/run-dashboard-green-recovery.mjs` | 15-minute supervisor: restart only missing/stalled steps, write proof logs, advance recovery order |
| `docs/ops/stock-analyzer-ui-ssot.md` | SSOT rules for analyze-v4 UI (price basis, key levels, V2 contract) |
| `docs/ops/learning-segmentation-ssot.md` | Canonical asset-class bucketing; no secondary implementations allowed |
| `docs/ops/contract.md` | API envelope contract (ok/data/meta/error fields, status codes) |
| `docs/ops/architecture.md` | Cloudflare Pages + KV + GitHub Actions data flow |
| `docs/ops/P0_P1_HARDENING_CONTRACTS.md` | Mission Control severity policy, universe policy, cohesion (build_id), ops pulse |
| `docs/ops/prices-chain.audit.md` | Price data chain audit |
| `docs/ops/indicators-chain.audit.md` | Indicators chain audit |
| `docs/ops/decisions.md` | Architectural decision log |
| `docs/ops/ops-shapes.ssot.md` | Ops shape/schema definitions |

### QuantLab
| Doc | Purpose |
|-----|---------|
| `docs/QuantLab/` (46 files) | QuantLab model research, grid search results, backtest reports |
| `docs/runbooks/quant-v4/README.md` | QuantLab V4 operator handoff |
| `docs/runbooks/quant-v4/05-low-reasoning-operator-handoff.md` | LLM-friendly operator instructions for QuantLab |
| `docs/operations/V5_TRAINING_AUTOPILOT.md` | V5 training autopilot design |

### Architecture
| Doc | Purpose |
|-----|---------|
| `docs/architecture/FINAL_SPEC_V1.md` | V1 fusion spec |
| `docs/architecture/v3-data-system.md` | V3 data system design |
| `docs/architecture/ops-trust-layer.md` | Ops trust layer |
| `docs/architecture/masterplan-v2.md` | Master plan V2 |

### CI/CD
| Doc | Purpose |
|-----|---------|
| `RUNBOOK.md` (repo root) | **CI/CD forensic audit guide** (NOT ops recovery — use this doc instead) |
| `README.md` | Project overview, pipeline architecture, local dev setup |

### Audit Trail
| Doc | Purpose |
|-----|---------|
| `docs/audit/04-ssot-violations.json` | Historical SSOT violation registry |
| `docs/audit/08-ops-remediation-plan.md` | Prior remediation plan |
| `docs/audit/ZZ-audit-summary.md` | Full audit summary |

---

## Canonical Recovery Order

Run in this exact order when the dashboard is not green:

1. `python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks.max.canonical.ids.json --from-date <YYYY-MM-DD>`
2. `python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>`
3. `node scripts/build-fundamentals.mjs --force`
4. `node scripts/quantlab/build_quantlab_v4_daily_report.mjs`
5. `node scripts/forecast/run_daily.mjs`
6. `node scripts/build-scientific-summary.mjs`
7. `node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0`
8. `node scripts/learning/run-daily-learning-cycle.mjs --date=<YYYY-MM-DD>`
9. `node scripts/build-best-setups-v4.mjs`
10. `node scripts/learning/diagnose-best-setups-etf-drop.mjs`
11. `node scripts/learning/quantlab-v1/daily-audit-report.mjs`
12. `node scripts/learning/quantlab-v1/cutover-readiness-report.mjs`
13. `node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0`
14. `node scripts/ops/build-system-status-report.mjs`
15. `node scripts/generate_meta_dashboard_data.mjs`

Automation/recovery wrapper (dry-run first):
```bash
node scripts/ops/run-market-data-recovery.mjs --dry-run
node scripts/ops/run-market-data-recovery.mjs
```

> `run-market-data-recovery.mjs` is a convenience wrapper, not the full-green authority.  
> For full-universe green, always finish with:
> 1. full `hist_probs`
> 2. full `stock_analyzer_universe_audit`
> 3. `build-system-status-report`
> 4. `generate_meta_dashboard_data`

---

## Always-Green Operator Workflow

This is the exact default workflow that keeps `dashboard_v7` green and keeps `analyze-v4` current for stocks and ETFs.

### A. Start local web runtime

```bash
npm run dev:pages:persist:std
```

Serves:
- `http://127.0.0.1:8788/dashboard_v7`
- `http://127.0.0.1:8788/`
- `http://127.0.0.1:8788/analyze-v4/<TICKER>`

### B. Run the canonical freshness chain

Execute in this exact order:

```bash
python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks.max.canonical.ids.json --from-date <YYYY-MM-DD>
python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>
node scripts/build-fundamentals.mjs --force
node scripts/quantlab/build_quantlab_v4_daily_report.mjs
node scripts/forecast/run_daily.mjs
node scripts/build-scientific-summary.mjs
node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
node scripts/learning/run-daily-learning-cycle.mjs --date=<YYYY-MM-DD>
node scripts/build-best-setups-v4.mjs
node scripts/learning/diagnose-best-setups-etf-drop.mjs
node scripts/learning/quantlab-v1/daily-audit-report.mjs
node scripts/learning/quantlab-v1/cutover-readiness-report.mjs
node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

### C. Validate from the dashboard surface

Open:
- `http://127.0.0.1:8788/dashboard_v7`

Read in this order:
1. `SSOT Violations`
2. `Stock Analyzer Universe Audit`
3. `Ordered Recovery Plan`
4. `SSOT Recovery Runbook`
5. `Web Validation Chain`

### D. If the dashboard is not green

Do **not** guess.

Run only the first unresolved step shown in:
- `SSOT Violations`
- then `Ordered Recovery Plan`

Then always refresh:

```bash
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

---

## Dumb-LLM Execution Rules

If an LLM only sees `http://127.0.0.1:8788/dashboard_v7`, it must follow these rules:

1. Never start with snapshot/frontpage rebuilds if `market_data_refresh` or `q1_delta_ingest` is not green.
2. Never trust `dashboard_v7` until `build-system-status-report.mjs` and `generate_meta_dashboard_data.mjs` have been rerun after any fix.
3. Never call the system green while:
   - `ssot_violations` is non-empty
   - `stock_analyzer_universe_audit.summary.full_universe` is not `true`
   - `stock_analyzer_universe_audit.summary.failure_family_count` is not `0`
4. Never treat `run-market-data-recovery.mjs` as sufficient for final green.
5. Never skip the full-universe `hist_probs` run.
6. Never skip the full-universe `stock_analyzer_universe_audit` run.
7. If a section shows an exact `Run:` command, execute that command before any lower-priority step.

---

## Exact Modes

### 1. Fast local dashboard refresh only

Use when upstream data already looks fresh and only the dashboard/status views are stale.

```bash
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

### 2. Partial smoke / sample audit

Use only for debugging a few assets. This does **not** make the system green.

```bash
node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --tickers AAPL,SPY,QQQ,TSLA,IWM
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

### 3. Full-universe UI proof

This is required before claiming the Stock Analyzer UI is fully green.

```bash
node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

### 4. Overnight autopilot

Use for unattended stock-analyzer maintenance:

```bash
bash scripts/install_stock_analyzer_overnight_launchd.sh --run-now
```

Uninstall:

```bash
bash scripts/install_stock_analyzer_overnight_launchd.sh --uninstall
```

### 5. Dashboard green watchdog (15-minute cadence)

Use for log-verified recovery with restart rules and progress heartbeats every 15 minutes:

```bash
node scripts/ops/run-dashboard-green-recovery.mjs
bash scripts/install_dashboard_green_watch_launchd.sh --run-now
```

Uninstall:

```bash
bash scripts/install_dashboard_green_watch_launchd.sh --uninstall
```

---

## Logs, Reports, Status Files

These are the primary files a human or dumb LLM must inspect.

| Area | Status / Report | Log / Trace | Meaning |
|---|---|---|---|
| Market data refresh | `mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json` | `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/historical_ingest.log` | upstream v7 bar refresh |
| Delta ingest | `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/q1_daily_delta_ingest/latest_success.json` | QuantLab run logs under `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/` | canonical QuantLab ingest freshness |
| QuantLab report | `public/data/quantlab/status/operational-status.json` | `mirrors/quantlab/reports/v4-daily/latest.json` | QuantLab publish health |
| Fundamentals | `public/data/v3/fundamentals/manifest.json` | `public/data/fundamentals/<TICKER>.json` | fundamentals coverage / catalysts basis |
| Forecast | `public/data/forecast/latest.json` | forecast run artifacts under `public/data/forecast/` + mirror reports | forecast freshness |
| Scientific | `public/data/supermodules/scientific-summary.json` | source timestamps inside the artifact | scientific freshness |
| Hist probs | `public/data/hist-probs/run-summary.json` | `public/data/hist-probs/regime-daily.json` | historical profile coverage and regime freshness |
| Snapshot | `public/data/snapshots/best-setups-v4.json` | `public/data/reports/best-setups-etf-diagnostic-latest.json` | frontpage candidates + ETF funnel |
| Learning | `public/data/reports/learning-report-latest.json` | `public/data/reports/learning-report-latest.js` | learning/safety state |
| V1 audit | `public/data/reports/quantlab-v1-latest.json` | QuantLab V1 mirrors | cutover evidence |
| Recovery supervisor | `public/data/reports/dashboard-green-recovery-latest.json` | `logs/dashboard_v7/recovery-heartbeat.log`, `logs/dashboard_v7/recovery-actions.log` | 15-minute progress proof + restart trail |
| Cutover | `mirrors/learning/quantlab-v1/reports/cutover-readiness-<DATE>.json` | same directory | cutover governance |
| Universe UI audit | `public/data/reports/stock-analyzer-universe-audit-latest.json` | failure families + ordered recovery inside the JSON | field/panel proof across stocks+ETFs |
| Dashboard status | `public/data/reports/system-status-latest.json` | `public/dashboard_v6_meta_data.json` | what `dashboard_v7` reads |
| Overnight autopilot | `public/data/reports/nightly-stock-analyzer-status.json` | `mirrors/ops/logs/nightly_stock_analyzer.latest.log` | unattended stock-analyzer maintenance |
| Recovery wrapper | `public/data/reports/system-recovery-latest.json` | inline `stdout_tail` / `stderr_tail` in the JSON | quick recovery execution trace |

---

## Restart Matrix

### Restart local Pages server

```bash
lsof -ti tcp:8788 | xargs kill -9 2>/dev/null || true
npm run dev:pages:persist:std
```

### Restart background ingest

```bash
pkill -f refresh_v7_history_from_eodhd.py || true
bash scripts/quantlab/start_ingest.sh
```

### Restart overnight stock-analyzer autopilot

```bash
bash scripts/install_stock_analyzer_overnight_launchd.sh --run-now
```

### Stop overnight stock-analyzer autopilot

```bash
bash scripts/install_stock_analyzer_overnight_launchd.sh --uninstall
```

### Rebuild dashboard artifacts after any restart/fix

```bash
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs
```

---

## Symptom -> Exact Action

| Dashboard symptom | Exact next command |
|---|---|
| `market_data_refresh` warning/critical | `python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks.max.canonical.ids.json --from-date <YYYY-MM-DD>` |
| `q1_delta_ingest` warning/critical | `python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>` |
| `fundamentals_unavailable` in universe audit | `node scripts/build-fundamentals.mjs --force` |
| `hist_probs` critical or `historical_profile_unavailable` | `node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0` |
| `model_consensus_degraded` | `node scripts/forecast/run_daily.mjs && node scripts/build-scientific-summary.mjs && node scripts/learning/run-daily-learning-cycle.mjs --date=<YYYY-MM-DD>` |
| frontpage candidates stale or empty | `node scripts/build-best-setups-v4.mjs && node scripts/learning/diagnose-best-setups-etf-drop.mjs` |
| dashboard stale after all runs | `node scripts/ops/build-system-status-report.mjs && node scripts/generate_meta_dashboard_data.mjs` |
| Stock Analyzer UI claim must be proven for all assets | `node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0` |

---

---

## Step Contract

| Step | Output Artifact | Dashboard Meaning | Primary Fix | Primary Verify |
| --- | --- | --- | --- | --- |
| Market Data Refresh | `mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json` | upstream raw history freshness | `python3 scripts/quantlab/refresh_v7_history_from_eodhd.py ...` | `jq '.steps.market_data_refresh' public/data/reports/system-status-latest.json` |
| Q1 Delta Ingest | `.../ops/q1_daily_delta_ingest/latest_success.json` | canonical raw bars promoted into QuantLab ingest layer | `python3 scripts/quantlab/run_daily_delta_ingest_q1.py ...` | `jq '.steps.q1_delta_ingest' public/data/reports/system-status-latest.json` |
| QuantLab Daily Report | `public/data/quantlab/status/operational-status.json` | QuantLab publish freshness used by frontpage/analyzer | `node scripts/quantlab/build_quantlab_v4_daily_report.mjs` | `jq '.steps.quantlab_daily_report' public/data/reports/system-status-latest.json` |
| Fundamentals Refresh | `public/data/fundamentals/<TICKER>.json`, `public/data/v3/fundamentals/manifest.json` | fundamentals/catalysts coverage in `analyze-v4` | `node scripts/build-fundamentals.mjs --force` | `jq '.meta.quality' public/data/v3/fundamentals/manifest.json` |
| Forecast Daily | `public/data/forecast/latest.json` | direction/forecast freshness | `node scripts/forecast/run_daily.mjs` | `jq '.steps.forecast_daily' public/data/reports/system-status-latest.json` |
| Scientific Summary | `public/data/supermodules/scientific-summary.json` | scientific model freshness | `node scripts/build-scientific-summary.mjs` | `jq '.steps.scientific_summary' public/data/reports/system-status-latest.json` |
| Historical Probabilities | `public/data/hist-probs/regime-daily.json`, `run-summary.json`, `<TICKER>.json` | historical modules in `analyze-v4` | `node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0` | `jq '.steps.hist_probs' public/data/reports/system-status-latest.json` |
| Daily Learning | `public/data/reports/learning-report-latest.json` | learning status / safety / readiness | `node scripts/learning/run-daily-learning-cycle.mjs --date=<YYYY-MM-DD>` | `jq '.steps.learning_daily' public/data/reports/system-status-latest.json` |
| Best Setups Snapshot | `public/data/snapshots/best-setups-v4.json` | frontpage buy lists and breakouts | `node scripts/build-best-setups-v4.mjs` | `jq '.steps.snapshot' public/data/reports/system-status-latest.json` |
| ETF Diagnostic | `public/data/reports/best-setups-etf-diagnostic-latest.json` | ETF funnel health | `node scripts/learning/diagnose-best-setups-etf-drop.mjs` | `jq '.steps.etf_diagnostic' public/data/reports/system-status-latest.json` |
| Stock Analyzer Universe Audit | `public/data/reports/stock-analyzer-universe-audit-latest.json` | proof that analyze-v4 fields/panels are valid across stocks+ETFs | `node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0` | `jq '.steps.stock_analyzer_universe_audit' public/data/reports/system-status-latest.json` |
| V1 Audit | `public/data/reports/quantlab-v1-latest.json` | audit/cutover evidence | `node scripts/learning/quantlab-v1/daily-audit-report.mjs` | `jq '.steps.v1_audit' public/data/reports/system-status-latest.json` |
| Cutover Readiness | `mirrors/learning/quantlab-v1/reports/cutover-readiness-<DATE>.json` | governance state | `node scripts/learning/quantlab-v1/cutover-readiness-report.mjs` | `jq '.steps.cutover_readiness' public/data/reports/system-status-latest.json` |
| Dashboard Refresh | `system-status-latest.json`, `dashboard_v6_meta_data.json` | what `dashboard_v7` actually shows | `node scripts/ops/build-system-status-report.mjs && node scripts/generate_meta_dashboard_data.mjs` | open `/dashboard_v7` and verify new timestamps |

---

## SSOT Violation Contracts

These are invariants that, when broken, mean the system is not honoring its own rules. Detected automatically by `build-system-status-report.mjs` and shown in dashboard_v7 Operations → "SSOT Violations".

| ID | Rule | Severity | Fix |
|----|------|----------|-----|
| `hist_probs_missing_etf_class` | hist_probs must run with `--asset-classes STOCK,ETF` | critical | Re-run hist_probs with STOCK,ETF |
| `hist_probs_limited_runner` | hist_probs must use registry mode (`--max-tickers 0`), not explicit ticker list | warning | Re-run with `--registry-path ... --max-tickers 0` |
| `quantlab_canonical_lag` | QuantLab canonical data must not lag bridge/any ingest by >5 days | warning/critical | Run Q1 delta ingest |
| `snapshot_quantlab_asof_lag` | Snapshot `quantlab_asof` must not lag `data_asof` by >7 days | warning/critical | Rebuild QuantLab report + snapshot |
| `market_refresh_no_data` | Market refresh must return data for ≥1 asset when it completes without error | warning | Re-run refresh after market close |

Check violations:
```bash
jq '.ssot_violations' public/data/reports/system-status-latest.json
```

---

## Web Validation Chain

Use these checks from web/API to UI:

1. Provider -> history refresh
   - check: `jq '.steps.market_data_refresh' public/data/reports/system-status-latest.json`
   - success: fresh `output_asof`

2. History -> delta ingest -> QuantLab
   - check: `jq '.steps.q1_delta_ingest,.steps.quantlab_daily_report' public/data/reports/system-status-latest.json`
   - success: both current, no critical severity

3. Forecast + scientific + learning
   - check: `jq '.steps.forecast_daily,.steps.scientific_summary,.steps.learning_daily' public/data/reports/system-status-latest.json`
   - success: all current, no missing artifacts

4. Historical profile generation
   - check: `jq '.steps.hist_probs' public/data/reports/system-status-latest.json`
   - success: fresh regime date and adequate coverage; `run-summary.json` includes STOCK and ETF

5. Snapshot + ETF diagnostic
   - check: `jq '.steps.snapshot,.steps.etf_diagnostic' public/data/reports/system-status-latest.json`
   - success: non-zero rows and healthy ETF funnel

6. Stock Analyzer universe audit
   - check: `jq '.steps.stock_analyzer_universe_audit,.stock_analyzer_universe_audit.summary' public/data/reports/system-status-latest.json`
   - success: full-universe audit, zero failure families, ordered recovery empty

7. API contract -> UI adapter
   - check: `node --test tests/dashboard_v7_meta.test.mjs tests/system-status-runbook.test.mjs tests/v2-data-integrity.test.mjs`
   - check: `node scripts/ci/verify-stock-ui-artifacts.mjs`
   - success: all tests green

8. Dashboard refresh
   - check: `node scripts/ops/build-system-status-report.mjs && node scripts/generate_meta_dashboard_data.mjs`
   - success: `dashboard_v7` matches the latest artifact timestamps

---

## How To Read Dashboard V7

If `dashboard_v7` is red/yellow, check in this order:

1. **Operations tab → "SSOT Violations"** — broken invariants; fix these first
2. **Operations tab → "Stock Analyzer Universe Audit"** — field/panel failures across stocks+ETFs
3. **Operations tab → "Ordered Recovery Plan"** — exact run order to get back to green
4. **Operations tab → "SSOT Recovery Runbook"** — per-step run/verify contracts
5. **Operations tab → "Web Validation Chain"** — end-to-end chain check/fix per stage
6. **System Health tab → "Critical Issues & Actions"** — root causes with impact and recovery
7. `jq '.summary' public/data/reports/system-status-latest.json` — machine-readable severity

The authoritative diagnosis fields in `system-status-latest.json`:
- `ssot_violations` — SSOT invariant breaks (new)
- `root_causes` — data freshness and pipeline problems
- `primary_actions` — operator-facing recovery list
- `steps.<id>.severity` — per-step health
- `ssot.missing_step_ids` — steps not producing any output artifact

Do not invent a fix outside these fields before checking them.

---

## When The System Is Not Fully Green

Interpret failure by layer:

- `ssot_violations` non-empty: the system is running but not following its own rules — fix these first
- `market_data_refresh` warning/critical: provider auth/quota/timing problem
- `q1_delta_ingest` red: ingest/promotion problem after raw fetch
- `quantlab_daily_report` red: QuantLab publish freshness problem
- `forecast_daily` or `scientific_summary` red: model artifact problem
- `hist_probs` red: historical profile freshness, coverage, or missing ETF class
- `snapshot` red/warning: frontpage/breakout publish problem or QuantLab asof lag
- `learning_daily` / `v1_audit` / `cutover_readiness` red: audit/training/governance problem

---

## Definition Of Green

The system is operationally green when:

- `ssot_violations` is empty (`[]`)
- `stock_analyzer_universe_audit.summary.full_universe = true`
- `stock_analyzer_universe_audit.summary.failure_family_count = 0`
- all critical upstream steps are `ok`
- `system.missing_step_ids = []`
- `system.untracked_step_ids = []`
- dashboard root causes contain no critical blockers
- `analyze-v4` serves fresh V2 summary + historical-profile data for assets that already have generated coverage
- `hist_probs` ran with `asset_classes: ["STOCK", "ETF"]` and `source_mode: "registry"`
- `snapshot.meta.quantlab_asof` within 7 days of `snapshot.meta.data_asof`
- missing historical coverage is shown as pending/not_generated, never as false/fabricated live data

---

## Current Repo Reality

These are true in the repo:

- `scripts/ops/build-system-status-report.mjs` detects SSOT violations and writes them to `system-status-latest.json` under `ssot_violations[]`.
- `public/dashboard_v7.html` has a dedicated "SSOT Violations" section (Operations tab) that shows every broken invariant with the exact fix command.
- `public/dashboard_v7.html` also has dedicated `Stock Analyzer Universe Audit` and `Ordered Recovery Plan` sections.
- `scripts/ops/system-status-ssot.mjs` exports `SSOT_VIOLATION_CONTRACTS` (5 contracts), `SYSTEM_STATUS_STEP_CONTRACTS` (12 steps), and `STOCK_ANALYZER_WEB_VALIDATION_CHAIN` (7 stages).
- `scripts/ops/run-market-data-recovery.mjs` and `scripts/quantlab/start_ingest.sh` use the SSOT canonical-id allowlist path.
- `scripts/lib/hist-probs/run-hist-probs.mjs` runs against the registry-backed stock+ETF universe with explicit asset classes and unlimited ticker count.
- `market_data_refresh` severity correctly downgrades to "warning" when `assets_fetched_with_data=0`.

---

## Local Verification

```bash
# Rebuild status artifacts
node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
node scripts/ops/build-system-status-report.mjs
node scripts/generate_meta_dashboard_data.mjs

# Check SSOT violations
jq '.ssot_violations' public/data/reports/system-status-latest.json

# Check Stock Analyzer universe audit
jq '.summary,.failure_families[0],.ordered_recovery[0]' public/data/reports/stock-analyzer-universe-audit-latest.json

# Run tests
node --test tests/dashboard_v7_meta.test.mjs tests/system-status-runbook.test.mjs tests/v2-data-integrity.test.mjs
node scripts/ci/verify-stock-ui-artifacts.mjs
```

Control pages:
- `http://127.0.0.1:8788/dashboard_v7`
- `http://127.0.0.1:8788/analyze-v4/AAPL`
- `http://127.0.0.1:8788/analyze-v4/SPY`
