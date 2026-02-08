# BreakoutAI v2.1 Integration — Forecast System Map (Evidence-Backed)

> **Scope:** Forecast System v3.0 only. Evidence is limited to file paths + line ranges or command outputs with timestamps. No speculation.

---

## A) Repo Reality Check (commands + outputs)

**Timestamp (UTC) + commands:**
```
2026-02-07T14:38:50Z
pwd
/workspace/rubikvault-site

git rev-parse --show-toplevel
/workspace/rubikvault-site

git remote -v
<no output>

git branch --show-current
work

git status --porcelain=v1
<no output>

git log -n 12 --oneline --decorate
ed5b407 (HEAD -> work) chore(health): refresh health assets
88917eb chore(data): refresh eod history [skip ci]
442398f chore(data): refresh eod history [skip ci]
5d42c36 feat(universe): expand from NASDAQ-100 to ~520 stocks (S&P 500 + NASDAQ-100 + Dow 30)
c9f93b4 feat(universe): add workflow and script to fetch index constituents
bbd5cdf fix(forecast): use latest_report_ref to avoid 404 on today's report
d476c22 fix(forecast): final remediation - close all remaining gaps
6163875 fix(forecast): close all forensic gaps + elevate unproven to verified
8bf8cae fix(forecast): resolve empty UI + implement MEM v1.2
a072c82 Merge branch 'main' of https://github.com/RubikVault/rubikvault-site
17e16d5 UI fix
987cbd7 chore(health): refresh health assets
```

---

## B) File Tree Subset (topology)
**Timestamp (UTC) + command:**
```
2026-02-07T14:38:47Z
ls -1 policies mirrors public/data scripts src .github/workflows docs
<see command output in session logs>
```

**Normative vs. generated (evidence-based):**
- **Normative**
  - `policies/forecast.v3.json` is the policy file loaded by the forecast engine.【F:policies/forecast.v3.json†L1-L157】【F:scripts/forecast/forecast_engine.mjs†L12-L31】
  - `policies/forecast.schema.json` is the policy schema referenced by policy validation script.【F:policies/forecast.schema.json†L1-L81】【F:scripts/forecast/validate_policy.mjs†L11-L36】
  - `schemas/registry.v1.json` defines forecast registry schema (SSOT).【F:schemas/registry.v1.json†L1-L122】
  - Forecast pipeline code lives in `scripts/forecast/*.mjs` (entry points and logic).【F:scripts/forecast/run_daily.mjs†L1-L403】【F:scripts/forecast/run_weekly.mjs†L1-L101】【F:scripts/forecast/run_monthly.mjs†L1-L171】
  - Forecast UI is `public/forecast.html` and reads `/data/forecast/*` artifacts.【F:public/forecast.html†L427-L607】

- **Generated**
  - Forecast artifacts published to `public/data/forecast/` are written by report generator / pipeline updates (latest/status/last_good/reports/scorecards).【F:scripts/forecast/report_generator.mjs†L13-L333】【F:scripts/forecast/run_daily.mjs†L289-L373】
  - Forecast snapshots are written to `mirrors/forecast/snapshots/<date>/` by snapshot ingest.【F:scripts/forecast/snapshot_ingest.mjs†L19-L287】
  - Ledgers are written to `mirrors/forecast/ledger/.../*.ndjson.gz` by ledger writer.【F:scripts/forecast/ledger_writer.mjs†L1-L192】
  - Challenger specs are written to `mirrors/forecast/challengers/specs/` by challenger generator.【F:scripts/forecast/challenger_generator.mjs†L13-L258】
  - Champion spec is overwritten in `mirrors/forecast/champion/current.json` on promotion.【F:scripts/forecast/forecast_engine.mjs†L12-L45】【F:scripts/forecast/promotion_gates.mjs†L150-L156】

---

## C) High-Level Architecture Map (SSOT → Pipelines → Artifacts → UI)

### 1) SSOT / Policy / Registry
- Policy is loaded from `policies/forecast.v3.json` by the forecast engine.【F:scripts/forecast/forecast_engine.mjs†L12-L31】
- Forecast registry is labeled SSOT in its `_audit` section (MEM v1.2).【F:public/data/forecast/models/registry.json†L28-L32】
- Forecast registry schema is defined in `schemas/registry.v1.json`.【F:schemas/registry.v1.json†L1-L122】

### 2) Pipelines
- **Daily pipeline**: ingest → quality gates → forecasts → ledgers → report → scorecards → status/latest/last_good updates.【F:scripts/forecast/run_daily.mjs†L1-L373】
- **Weekly pipeline**: challenger generation → promotion evaluation over recent outcomes.【F:scripts/forecast/run_weekly.mjs†L1-L82】
- **Monthly pipeline**: monthly report from outcomes/promotions within date range.【F:scripts/forecast/run_monthly.mjs†L1-L152】

### 3) Artifacts (published)
- `public/data/forecast/latest.json` is written by `updateLatest` with schema `rv_envelope_v1`.【F:scripts/forecast/report_generator.mjs†L287-L311】
- `public/data/forecast/reports/daily/<date>.json` is written by `writeReport` using `generateDailyReport`.【F:scripts/forecast/report_generator.mjs†L55-L163】
- `public/data/forecast/scorecards/tickers.json.gz` is written by `writeScorecards`.【F:scripts/forecast/report_generator.mjs†L170-L251】
- `public/data/forecast/system/status.json` and `system/last_good.json` are written by report generator helpers.【F:scripts/forecast/report_generator.mjs†L263-L333】

### 4) UI Consumption
- UI fetches `system/status.json`, `latest.json`, and report referenced by `latest.data.latest_report_ref`.【F:public/forecast.html†L427-L600】

---

## D) Forecast-Related Entry Points (search hits with snippets)
> Scope-limited to forecast system paths (scripts/forecast, public/forecast.html, policies, mirrors/forecast, public/data/forecast, envelope/resilience shared code).

1) **Daily pipeline orchestrator**
```
// scripts/forecast/run_daily.mjs (L1-L12)
* Orchestrates the complete daily forecast pipeline:
* 1. Ingest snapshots...
* 7. Update status and latest pointers
```
Reason: Primary daily entry point and pipeline definition.【F:scripts/forecast/run_daily.mjs†L1-L12】

2) **Weekly challenger training + promotion evaluation**
```
// scripts/forecast/run_weekly.mjs (L1-L5)
* Orchestrates weekly challenger training and promotion evaluation.
```
Reason: Weekly training/ promotion entry point.【F:scripts/forecast/run_weekly.mjs†L1-L5】

3) **Monthly report pipeline**
```
// scripts/forecast/run_monthly.mjs (L1-L5)
* Generates monthly summary reports and challenger quota tracking.
```
Reason: Monthly report entry point.【F:scripts/forecast/run_monthly.mjs†L1-L5】

4) **Circuit breaker / last_good behavior**
```
// scripts/forecast/circuit_breaker.mjs (L1-L6)
* Implements fail-loud-stop circuit breaker logic.
* Opens circuit on data quality failures and publishes last_good.
```
Reason: Circuit state and fallback behavior definition.【F:scripts/forecast/circuit_breaker.mjs†L1-L177】

5) **Ledger writer (append-only NDJSON.GZ)**
```
// scripts/forecast/ledger_writer.mjs (L1-L6)
* Append-only ledger management with monthly partitioning.
* Writes NDJSON.GZ format to mirrors/forecast/ledger/
```
Reason: Ledger format + pathing.【F:scripts/forecast/ledger_writer.mjs†L1-L139】

6) **Snapshot ingest (sources + mirrors)**
```
// scripts/forecast/snapshot_ingest.mjs (L1-L8)
* Ingests data from existing RubikVault sources:
* - Universe from /data/universe/nasdaq100.json
* - Prices from /data/eod/batches/eod.latest.*.json
* - Creates manifests in mirrors/forecast/snapshots/
```
Reason: Data ingestion entry point and sources.【F:scripts/forecast/snapshot_ingest.mjs†L1-L287】

7) **Forecast policy loading**
```
// scripts/forecast/forecast_engine.mjs (L12-L31)
const POLICY_PATH = 'policies/forecast.v3.json';
...loadPolicy...
```
Reason: Policy SSOT path for forecast engine.【F:scripts/forecast/forecast_engine.mjs†L12-L31】

8) **Promotion gate thresholds**
```
// scripts/forecast/promotion_gates.mjs (L72-L117)
export function checkPromotionGates(...) {
  ...min_live_samples_30d...
  ...min_improvement_skill_30d_pct...
  ...reject_if_neutral_rate_increase_pct_gt...
  ...reject_if_sharpness_drop_pct_gt...
}
```
Reason: Promotion gating rules and thresholds.【F:scripts/forecast/promotion_gates.mjs†L72-L117】

9) **Trading date resolution law**
```
// scripts/forecast/trading_date.mjs (L132-L165)
* Resolve trading date from a timestamp
* Uses exchange timezone (America/New_York for US markets)
```
Reason: Trading date source of truth and timezone handling.【F:scripts/forecast/trading_date.mjs†L132-L165】

10) **Forecast UI contract**
```
// public/forecast.html (L427-L600)
const API_BASE = '/data/forecast';
...fetch system/status.json, latest.json, latest_report_ref...
```
Reason: UI dependency on forecast artifacts.【F:public/forecast.html†L427-L600】

11) **Forecast registry (SSOT)**
```
// public/data/forecast/models/registry.json (L28-L32)
"description": "MEM v1.2 Forecast Model Registry - Single Source of Truth"
```
Reason: Explicit SSOT designation for forecast registry.【F:public/data/forecast/models/registry.json†L28-L32】

12) **Envelope meta.status enforcement (API)**
```
// functions/api/_shared/envelope.js (L167-L199)
assertEnvelope(...) -> validates meta.status, generated_at, data_date, provider
```
Reason: Canonical envelope validation for API responses.【F:functions/api/_shared/envelope.js†L167-L199】

---

## E) Run Entry Points (Local + CI)

### Local (CLI entry points in scripts)
- Daily pipeline: `node scripts/forecast/run_daily.mjs --date=YYYY-MM-DD` (CLI entry point).【F:scripts/forecast/run_daily.mjs†L388-L401】
- Weekly pipeline: `node scripts/forecast/run_weekly.mjs --date=YYYY-MM-DD` (CLI entry point).【F:scripts/forecast/run_weekly.mjs†L85-L99】
- Monthly pipeline: `node scripts/forecast/run_monthly.mjs --month=YYYY-MM` (CLI entry point).【F:scripts/forecast/run_monthly.mjs†L155-L169】
- Forecast validation in package scripts: `npm run test:forecast` → `validate:forecast-schemas` + `validate:forecast-registry`.【F:package.json†L59-L83】

### CI / Scheduled
- Daily: `.github/workflows/forecast-daily.yml` (schedule weekdays 21:00 UTC; runs `node scripts/forecast/run_daily.mjs`).【F:.github/workflows/forecast-daily.yml†L1-L90】
- Weekly: `.github/workflows/forecast-weekly.yml` (schedule Sundays; runs `node scripts/forecast/run_weekly.mjs`).【F:.github/workflows/forecast-weekly.yml†L1-L99】
- Monthly: `.github/workflows/forecast-monthly.yml` (1st of month; runs `node scripts/forecast/run_monthly.mjs`).【F:.github/workflows/forecast-monthly.yml†L1-L88】
- Rollback: `.github/workflows/forecast-rollback.yml` (manual; writes status and optionally restores latest.json).【F:.github/workflows/forecast-rollback.yml†L1-L68】

---

## F) Where to Hook Breakout AI v2.1 (evidence-supported)
| Hook Point | Evidence | Why it’s a stable integration seam |
| --- | --- | --- |
| `generateForecast(...)` in `scripts/forecast/forecast_engine.mjs` | Forecast generation uses champion spec + policy hash + features; called from daily pipeline. 【F:scripts/forecast/forecast_engine.mjs†L214-L320】【F:scripts/forecast/run_daily.mjs†L254-L267】 | Core model inference surface; swapping internals keeps pipeline wiring consistent. |
| Champion spec in `mirrors/forecast/champion/current.json` | Forecast engine loads champion spec from this path; promotions write it. 【F:scripts/forecast/forecast_engine.mjs†L12-L45】【F:scripts/forecast/promotion_gates.mjs†L150-L156】 | Breakout AI can be encoded as a new champion spec without pipeline changes. |
| Promotion gates (`scripts/forecast/promotion_gates.mjs`) | Explicit thresholds for min samples / skill improvements / anti-gaming. 【F:scripts/forecast/promotion_gates.mjs†L72-L117】 | If Breakout AI changes metrics, gate logic is the enforcement chokepoint. |
| Artifact contract for UI (`updateLatest` / report schema) | `updateLatest` defines `rv_envelope_v1` and fields consumed by UI. 【F:scripts/forecast/report_generator.mjs†L287-L311】【F:public/forecast.html†L427-L600】 | Ensures UI stays stable if V2.1 output matches contract. |

---

## G) Drift / QA / Gates (Forecast-Relevant)
- Promotion gates enforce min samples and skill delta thresholds; anti-gaming constraints include neutral rate increase and sharpness drop caps.【F:scripts/forecast/promotion_gates.mjs†L72-L117】
- Feature drift detection script compares baseline distributions and emits `dev/ops/forecast/drift_results.json`.【F:scripts/forecast/feature_drift.mjs†L1-L100】
- CI gates include JSON schema validation for public/data snapshots and contract tests (general, not forecast-specific).【F:.github/workflows/ci-gates.yml†L84-L152】

---

## H) Artifact Inventory Command Output (sizes/keys)
```
timestamp_utc 2026-02-07T14:36:32.345233Z
public/data/forecast/latest.json size_bytes 44092 keys ['schema', 'ok', 'feature', 'generated_at', 'meta', 'data'] meta_keys ['status', 'reason', 'last_good_ref'] date_fields ['generated_at']
public/data/forecast/reports/daily/2026-02-05.json size_bytes 1147 keys ['schema', 'period', 'as_of', 'maturity_phase', 'meta', 'global_metrics', 'ticker_heatmap_summary', 'top_movers', 'recent_changes', 'diagnostics'] meta_keys ['status', 'reason', 'data_completeness', 'compute'] date_fields ['as_of', 'period']
public/data/forecast/system/status.json size_bytes 295 keys ['schema', 'status', 'reason', 'generated_at', 'circuit_state', 'last_run', 'last_good', 'capabilities'] meta_keys [] date_fields ['generated_at']
public/data/forecast/system/last_good.json size_bytes 242 keys ['schema', 'last_good_champion_id', 'last_good_latest_report_ref', 'last_good_as_of', 'reason'] meta_keys [] date_fields []
public/data/forecast/scorecards/tickers.json.gz size_bytes 112 keys ['schema', 'generated_at', 'ticker_count', 'tickers'] meta_keys [] date_fields ['generated_at']
```

---

## I) Not Found (explicit)
- **Rate limiting / retry / backoff policies within `scripts/forecast`**: **NOT FOUND**.
  - Search command + timestamp:
    - `2026-02-07T14:38:57Z` — `rg -n "rate limit|rate_limit|backoff|retry" scripts/forecast` (no matches).

- **Determinism markers in `public/data/forecast` artifacts**: **NOT FOUND**.
  - Search command + timestamp:
    - `2026-02-07T14:44:02Z` — `rg -n "determin" public/data/forecast` (no matches).
