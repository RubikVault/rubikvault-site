# RubikVault Pipeline — Operations Reference

> For operators and LLMs. Everything you need to observe, debug, restart, and get the dashboard to GREEN.

---

## Architecture in One Sentence

EODHD API → market data refresh → QuantLab delta ingest → hist_probs + forecast + snapshot → learning → audit → system_status → dashboard.

---

## Green Definition

`public/data/reports/system-status-latest.json → summary.severity = "ok"` when ALL of:

| Gate | Condition |
|------|-----------|
| local_severity | All local steps = ok |
| remote_severity | All critical GH Actions workflows = success + ≤2d old |
| proof_mode | `live_github_api` (if `remote_unavailable` → at most `warning`) |
| ssot_violations | Empty array |
| stock_analyzer_universe_audit | full_universe=true + failure_family_count=0 |
| q1_delta_ingest | noop_detected=false OR no upstream advance |
| quantlab_daily_report | canonical_lag ≤5d |
| snapshot | upstream_severity=ok |

---

## Step Execution Order

```
[1] market_data_refresh         scripts/quantlab/refresh_v7_history_from_eodhd.py
[2] q1_delta_ingest             scripts/quantlab/run_daily_delta_ingest_q1.py
[3] quantlab_daily_report       npm run quantlab:report:v4
[4] hist_probs (Turbo)          run-hist-probs-turbo.mjs              (~2-4h, 15 workers)
[5] forecast_daily              scripts/forecast/run_daily.mjs        (~1-3h)
[6] scientific_summary          npm run build:scientific-analysis
[7] snapshot                    scripts/build-best-setups-v4.mjs      (after 3+5)
[8] fundamentals                scripts/build-fundamentals.mjs        (parallel)
[9] learning_daily              scripts/learning/run-daily-learning-cycle.mjs (after 7+6+8)
[10] etf_diagnostic             scripts/ops/build-best-setups-etf-diagnostic.mjs (after 7)
[11] stock_analyzer_universe_audit scripts/ops/build-stock-analyzer-universe-audit.mjs (after 4+7+10)
[12] system_status              scripts/ops/build-system-status-report.mjs (after 11)
[13] dashboard_meta             scripts/generate_meta_dashboard_data.mjs (after 12)
```

---

## Self-Healing Recovery System

### How it works

A `launchd` agent runs `scripts/ops/run-dashboard-green-recovery.mjs` every 15 minutes.

It:
1. Detects which steps are complete (via `isComplete()` per step)
2. Starts blocked steps whose dependencies are satisfied
3. Monitors running steps for stalls (per-step `stallMinutes` threshold)
4. Kills + restarts stalled processes automatically (up to `MAX_RESTARTS=3` per step)

### Enable / disable / status

```bash
# Status
launchctl list com.rubikvault.dashboard-green.watch

# Restart
launchctl kickstart -k gui/$(id -u)/com.rubikvault.dashboard-green.watch

# Disable
launchctl unload ~/Library/LaunchAgents/com.rubikvault.dashboard-green.watch.plist

# Enable
launchctl load ~/Library/LaunchAgents/com.rubikvault.dashboard-green.watch.plist
```

### Manual trigger (run once immediately)

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/ops/run-dashboard-green-recovery.mjs
```

---

## Logs — Where to Find Everything

All logs in: `logs/dashboard_v7/`

| File | What it contains |
|------|-----------------|
| `recovery-heartbeat.log` | Every 15min: completed/running/blocked count + hist_probs rate + blocker |
| `recovery-actions.log` | Every process start / kill / restart with PID and timestamp |
| `step-01-q1-delta.log` | q1_delta_ingest output |
| `step-02-quantlab-daily.log` | quantlab_daily_report output |
| `step-03-scientific.log` | scientific_summary output |
| `step-04-forecast.log` | forecast_daily output (incl. crash stack traces) |
| `step-06-hist-probs.log` | hist_probs turbo output |
| `step-07-snapshot.log` | snapshot (best-setups-v4) output |
| `step-08-learning.log` | learning_daily output |
| `step-09-etf-diagnostic.log` | etf_diagnostic output |
| `step-10-universe-audit.log` | stock_analyzer_universe_audit output |
| `step-11-system-status.log` | build-system-status-report output |
| `step-12-dashboard-meta.log` | generate_meta_dashboard_data output |
| `hist-probs-full-YYYY-MM-DD.log` | hist_probs turbo worker detail |
| `launchd_dashboard_green.out.log` | launchd stdout |
| `launchd_dashboard_green.err.log` | launchd stderr |

### One-liner to watch the pipeline live

```bash
tail -f logs/dashboard_v7/recovery-heartbeat.log logs/dashboard_v7/recovery-actions.log
```

### Check current status

```bash
# Full pipeline state
jq '.completed_steps, .running_steps, .blocked_steps, .progress' \
  public/data/reports/dashboard-green-recovery-latest.json

# Dashboard green?
jq '.summary.severity, .summary.local_severity, .summary.remote_severity, .summary.proof_mode' \
  public/data/reports/system-status-latest.json

# hist_probs progress
jq '.tickers_done // .tickers_total' public/data/hist-probs/run-summary.json

# Which remote workflows are failing?
jq '.remote_workflows' public/data/reports/system-status-latest.json
```

---

## Artifacts — Key Output Files

| Artifact | Path | Writer |
|----------|------|--------|
| Market data report | `mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json` | refresh_v7_history_from_eodhd.py |
| Q1 delta success | `$QUANT_ROOT/ops/q1_daily_delta_ingest/latest_success.json` | run_daily_delta_ingest_q1.py |
| QuantLab daily | `mirrors/quantlab/reports/v4-daily/latest.json` | quantlab:report:v4 |
| hist_probs run summary | `public/data/hist-probs/run-summary.json` | run-hist-probs-turbo.mjs |
| hist_probs regime | `public/data/hist-probs/regime-daily.json` | run-hist-probs-turbo.mjs |
| Forecast | `public/data/forecast/latest.json` | scripts/forecast/run_daily.mjs |
| Snapshot | `public/data/snapshots/best-setups-v4.json` | scripts/build-best-setups-v4.mjs |
| Learning report | `public/data/reports/learning-report-latest.json` | run-daily-learning-cycle.mjs |
| ETF diagnostic | `public/data/reports/best-setups-etf-diagnostic-latest.json` | build-best-setups-etf-diagnostic.mjs |
| Universe audit | `public/data/reports/stock-analyzer-universe-audit-latest.json` | build-stock-analyzer-universe-audit.mjs |
| **System status** | `public/data/reports/system-status-latest.json` | **build-system-status-report.mjs** |
| **Dashboard meta** | `public/dashboard_v6_meta_data.json` | **generate_meta_dashboard_data.mjs** |
| Recovery state | `public/data/reports/dashboard-green-recovery-latest.json` | run-dashboard-green-recovery.mjs |

---

## Memory Budgets (24GB MacBook)

| Process | NODE_OPTIONS | Notes |
|---------|-------------|-------|
| hist_probs turbo | `--max-old-space-size=4096` | 15 workers, ~4GB each peak |
| forecast_daily | `--max-old-space-size=6144` | 6GB — was OOM-crashing at default |
| snapshot (best-setups-v4) | `--max-old-space-size=8192` | Large join |
| fundamentals | default | Runs sequentially, low mem |
| learning_daily | `--max-old-space-size=4096` | Moderate |

**If forecast crashes with OOM:**
```bash
kill $(pgrep -f 'run_daily.mjs')
NODE_OPTIONS=--max-old-space-size=6144 node scripts/forecast/run_daily.mjs \
  >> logs/dashboard_v7/step-04-forecast.log 2>&1 &
```

**If memory pressure is extreme (swap > 50M pages):**
```bash
# Check swap
vm_stat | grep 'Swapouts'

# Kill forecast to free RAM for hist_probs (then restart after hist_probs finishes)
kill $(pgrep -f 'run_daily.mjs')
```

---

## Overnight Nightly Autopilot

**Script:** `scripts/stock-analyzer/run_overnight_autopilot.sh`

**Trigger:** launchd or cron, runs after market close

**Steps (FULL_CYCLE):** targeted_refresh → daily_stack → market_stats → market_score → scientific → forecast_daily → forecast_calibrate → quantlab_self_heal → quantlab_publish → quantlab_report → **hist_probs** → v3_daily → features_v2 → features_v4 → best_setups_v4 → learning_cycle → stock_ui_artifacts → system_status → dashboard_meta → non_regression

**Manual run:**
```bash
bash scripts/stock-analyzer/run_overnight_autopilot.sh
```

**Check current state:**
```bash
cat public/data/reports/v5-autopilot-status.json | jq '.currentState'
```

---

## GitHub Actions — Critical Workflows

These affect `remote_severity` in the system status:

| Workflow | Schedule | What it does |
|----------|----------|-------------|
| `monitor-prod.yml` | After market close | forecast + snapshot + artifacts |
| `learning-daily.yml` | Tue–Sat 00:30 | daily learning report |
| `fundamentals-daily.yml` | Daily | fundamentals coverage |
| `universe-v7-daily.yml` | Daily | universe refresh |
| `ops-daily.yml` | Daily | ops pipeline |

**Intentionally disabled (QuantLab is external to this repo):**
- `quantlab-daily.yml` — schedule disabled, `workflow_dispatch` only
- `quantlab-ci.yml` — push/PR triggers disabled

**Check recent workflow runs:**
```bash
gh run list --workflow=monitor-prod.yml --limit=5
gh run list --workflow=learning-daily.yml --limit=5
```

---

## Debugging Playbook

### Dashboard stuck at CRITICAL — where to start

```bash
# 1. Which step is the primary blocker?
jq '.summary.primary_blocker' public/data/reports/system-status-latest.json

# 2. What's running vs blocked?
jq '.running_steps, .blocked_steps' public/data/reports/dashboard-green-recovery-latest.json

# 3. Is a process stalled?
ps aux | grep -E 'hist-probs|run_daily|build-best|learning' | grep -v grep

# 4. Check last 20 lines of the relevant step log
tail -20 logs/dashboard_v7/step-04-forecast.log
```

### hist_probs rate has dropped (< 500/15min)

```bash
# Check memory pressure first
vm_stat | grep Swapouts

# If swap is high: kill competing processes (especially forecast)
kill $(pgrep -f 'run_daily.mjs')

# Check turbo worker count
ps aux | grep 'hist-probs' | grep -v grep | wc -l
```

### Premature GREEN — system_status/dashboard_meta completed too early

The recovery script now requires `snapshot` + `learning` to be fresh before marking `system_status` complete. If stuck, force a re-run:

```bash
node scripts/ops/build-system-status-report.mjs && \
node scripts/generate_meta_dashboard_data.mjs
```

### Q1 delta ingest shows noop_detected=true

Market data has advanced but ingest ran as no-op. Force re-run:

```bash
cd $QUANT_ROOT  # ~/QuantLabHot/rubikvault-quantlab
python3 -m quantlab.ops.q1_daily_delta_ingest --force
```

---

## External Services

| Service | URL | Purpose |
|---------|-----|---------|
| Wrangler dev (local) | `http://127.0.0.1:8788` | Required for universe audit API calls |
| EODHD API | via env `EODHD_API_KEY` | Market data provider |

**Check wrangler is running:**
```bash
curl -s http://127.0.0.1:8788/health | head -c 100
```

---

## QuantLab External Setup

QuantLab runs outside this repo in `~/QuantLabHot/rubikvault-quantlab/`. Its outputs are committed to `mirrors/quantlab/` and `public/data/quantlab/` by the local autopilot.

The `quantlab-daily.yml` and `quantlab-ci.yml` GitHub Actions workflows are **intentionally disabled** — they would fail because `quantlab/` is not committed to this repo. Re-enable only after committing the QuantLab source to `quantlab/` in this repo.

---

## Self-Healing Rules

The recovery orchestrator (`run-dashboard-green-recovery.mjs`) will:

- **Auto-restart** any step that has been running > `stallMinutes` with no log file size change
- **Max 3 restarts** per step per campaign before giving up
- **Skip** steps whose dependencies haven't completed
- **Never** mark `system_status` or `dashboard_meta` complete unless `snapshot` + `learning` are also fresh

Stall thresholds:
- Default: 20 min
- `hist_probs`, `fundamentals`, `forecast_daily`: 60 min (long silent phases)

---

*Generated by RubikVault pipeline V2.0 — 2026-04-05*
