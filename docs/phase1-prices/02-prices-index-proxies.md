# Phase 1 / WP4 — Prices (Index Proxies) Artifacts (market-prices)

## What this adds

- A new provider module script:
  - `scripts/providers/market-prices-v3.mjs`
- A small artifact validator:
  - `scripts/validate/market-prices-artifact.v1.mjs`

## Contracts used

- `scripts/lib/envelope.js` → `buildEnvelope(data, metadata)`
- `scripts/lib/digest.js` → `computeSnapshotDigest(envelope)`
- `scripts/lib/module-state.js` → `buildModuleState(moduleName, envelope, validationResult, moduleConfig, options)`

Artifacts only (no `public/data` writes). Real provider fetch is available in WP4.

## WP3

WP3: `market-prices` artifacts are promoted by the finalizer into `public/data` and are API-servable.

## How to run locally (stub mode)

Generate artifacts:

- `node scripts/providers/market-prices-v3.mjs`

Force stub mode explicitly:

- `RV_PRICES_STUB=1 node scripts/providers/market-prices-v3.mjs`

Artifacts output directory override:

- `RV_ARTIFACT_OUT_DIR=tmp/phase1-artifacts/market-prices node scripts/providers/market-prices-v3.mjs`

## What artifacts are produced

- `tmp/phase1-artifacts/market-prices/snapshot.json`
- `tmp/phase1-artifacts/market-prices/module-state.json`

The symbols are sourced from:

- `public/data/registry/universe.v1.json` → `groups.index_proxies.symbols` (SPY, QQQ, DIA, IWM)

## Real mode

Real fetch is opt-in and config-driven.

If you force real mode:

- `RV_PRICES_FORCE_REAL=1 node scripts/providers/market-prices-v3.mjs`

It fails loud if the Provider A API key is missing:

- `REAL_FETCH_MISSING_API_KEY`

When the API key is present (see registry), real mode activates.

If Alpha Vantage returns a 200 response with an error payload (Note/Error Message/Information),
the run fails loud and `snapshot.metadata.upstream.*` includes the classification and upstream note.

## Provider registry declarations

- `public/data/registry/providers.v1.json` now declares both Alpha Vantage (primary) and Twelve Data (fallback) along with their throttles and retry knobs.
- Each entry exposes an `auth_env_var`, `role` (`primary` vs. `fallback`), and the per-provider `cooldown_minutes_default`, `max_retries_*`, and throttle defaults used by `market-prices-v3.mjs`.
- The provider chain for market-prices is lexically sorted: all enabled primaries run first and fallbacks are run afterward. Providers with a cooldown still active are skipped so the next enabled fallback can catch up.
- The run retains per-symbol attribution data (`metadata.upstream.symbol_sources`, `metadata.upstream.symbol_attempts`) while still keeping the envelope schema at 3.0; `metadata.provider` becomes `MIXED_BY_SYMBOL` when multiple providers contribute.

## Provider chain & fallback behavior

- Real mode fetches are driven entirely by the registry-defined provider chain (first enabled primary, then any enabled fallbacks), and a symbol is closed as soon as the first provider in the chain returns a valid bar—there is no mixing per symbol.
- If a provider sends a `Note`, `Information`, `Error Message`, or HTTP `429`, that classification is stored in the snapshot (`metadata.upstream.classification`, `symbol_errors`, `symbol_attempts`), a cooldown is written to `provider-runtime.json`, and later runs will skip the throttled provider in favor of fallbacks.
- `metadata.compute.reason_code` reflects the run's outcome (`FULL_SUCCESS`, `PARTIAL_DUE_TO_RATE_LIMIT`, `HTTP_429`, `NO_VALID_BARS`, etc.), while `metadata.upstream.symbol_sources`/`symbol_attempts` document which provider ultimately succeeded per symbol.
- The runtime `provider-runtime.json` file under the artifacts directory now records each provider's cooldown and last classification so operator tooling can inspect why a fallback was chosen.

## Cooldown behavior

- Artifacts now include `provider-runtime.json` under the artifacts directory. It tracks the last classification, `cooldown_until`, and `last_http_status`; real runs read this file first to avoid hammering the API while the cooldown is active.
- Supported reason codes surfaced in `snapshot.metadata.compute.reason_code` include `FULL_SUCCESS`, `PARTIAL_DUE_TO_RATE_LIMIT`, `RATE_LIMIT_NOTE`, `UPSTREAM_ERROR_MESSAGE`, `HTTP_429`, `NETWORK_ERROR`, and `COOLDOWN_ACTIVE`.
- When real mode detects rate limiting, it records `metadata.upstream.classification`/`symbol_errors` per symbol, sets a cooldown window (default 30 minutes), and stops fetching further symbols. UI/ops can read `metadata.compute` and `module-state.json` to understand the degraded state.

## Required env vars

- `RV_PRICES_FORCE_REAL=1` to enable real mode.
- `ALPHAVANTAGE_API_KEY` (from `public/data/registry/providers.v1.json` → Provider A).
- `TWELVEDATA_API_KEY` (from the fallback provider entry) if you want fallback runs to activate locally.

## 60s local run (commands)

- `node scripts/providers/market-prices-v3.mjs`
- `RV_PRICES_FORCE_REAL=1 ALPHAVANTAGE_API_KEY=your_key node scripts/providers/market-prices-v3.mjs`
- `node scripts/validate/market-prices-artifact.v1.mjs`

## Provider Health & Run Quality

- Every module run now emits two diagnostic artifacts in the same artifacts directory:
  - `provider-health.json` — a per-provider scorecard (`symbols_attempted`, `symbols_success`, `cooldown_triggered`, `dominant_failure_reason`, `run_health_score`).
  - `market-prices-health.json` — the module-level coverage and fallback metrics plus a `reason_summary`.
- Health scores start at 100 and subtract weighted penalties: cooldowns (−40), rate-limit notes (−25), HTTP 429s (−20), network errors (−15), and a final 100×(1−success_ratio) adjustment. Scores are clamped between 0 and 100.
- Run quality is derived from coverage: ≥95% → `OK`, 50–95% → `DEGRADED`, <50% or zero valid bars → `FAILED`. `fallback_usage_ratio` reports how often fallbacks supplied bars, and `reason_summary` is a histogram of failure classifications.
- UI/ops can read these artifacts without touching the snapshot schema; they already surface all required metadata so nothing else moves in this WP.

## Market Stats (derived module)

- `market-stats` is a derived module that reads the canonical bars produced by `market-prices` and computes ~20–25 metrics per symbol (returns, volatility, momentum, drawdowns, SMAs, RSI, ATR, z-scores, and health stats) using at most the most recent 252 bars while remaining static-first.
- The stats provider looks for market-prices artifacts first (`BARS_ARTIFACTS_DIR/market-prices/snapshot.json`) and otherwise falls back to the published asset (`public/data/snapshots/market-prices/latest.json`). No extra upstream API calls are made.
- Outputs:
  - `snapshot.json` (v3 envelope) with `data[*].stats` + `coverage` details.
  - `module-state.json` and `market-stats-health.json` (coverage ratio, run quality, reason summary).
  - Exposed endpoint: `/api/market-stats` (served from ASSET via `functions/api/market-stats.js`).
- Required env toggles are the same as market-prices (since stats are derived from its artifacts).

## Universe v2 (index constituents)

- `universe` is the new core catalog that lists every symbol belonging to DJ30, SP500, NDX100, and RUT2000 along with metadata such as name, sector, and industry. The snapshot is built from per-index data sources, normalized, merged, and published via the same artifact/finalizer pipeline.
- The API `/api/universe` serves the ASSET snapshot (schema_version 3.0) and is the source of truth for future search/autocomplete and ticker detail work in WP11/WP12.

## Stock page v1 (ticker join)

- `functions/api/stock.js` stitches together the published `/data/snapshots/universe`, `/data/snapshots/market-prices`, and `/data/snapshots/market-stats` artifacts for a single ticker and emits a schema_version 3.0 envelope with structured error codes (`UNKNOWN_TICKER`, `DATA_NOT_READY`, `BAD_REQUEST`).
- `public/stock.html` is a static-first UI that calls `/api/stock?ticker=<SYMBOL>` (optionally with `debug=1`), renders membership badges, latest price, returns + momentum, volatility + risk, trend metrics, and data quality diagnostics, and surfaces the API error banner when data is missing.
- The stock page is accessible via `/stock.html?ticker=SPY` or any known ticker once the pipeline publishes new snapshots, and it gracefully informs users when the ticker is unknown or market prices/stats are not yet available.

## Market score (WP12)

- `market-score` is a derived module that consumes `market-stats` and calculates short/mid/long horizon scores plus explainability per symbol. The scoring engine normalizes momentum, trend, volatility, RSI, and drawdown inputs, records top contributors per horizon, and exposes confidence + coverage so downstream UI can explain each grade.
- Artifacts:
  - `/tmp/.../market-score/snapshot.json` (`schema_version=3.0`, `module=market-score`, `data` is a map of symbols with `score_short`, `score_mid`, `score_long`, `confidence`, `reasons_top`, and `inputs_used`).
  - `/tmp/.../market-score/module-state.json` (validation + digest).
  - `/tmp/.../market-score/market-score-health.json` (coverage/run-quality).
- API: `/api/market-score` (served from ASSET via `functions/api/market-score.js`) and the `/api/stock` response now includes the joined `market_score` block so the UI can surface chips + “Why?” details.
- The new score layer powers the `Score` section in `public/stock.html`, showing three chips (short/mid/long), confidence, and top 5 contributors per horizon; missing data gracefully shows placeholder messaging rather than guessing.

## WP13 — Global search & routing (universe)

- The universe snapshot (`/api/universe`) now powers instant client-side autocomplete without any extra API calls. `public/search.js` loads + caches the asset (6h TTL), builds a lightweight index, and exposes `attachSearchUI` so any root can host the experience.
- Autocomplete ranking is deterministic: exact ticker > ticker prefix > name prefix > name substring; ties fall back to ticker alphabetical order. Each entry shows index badges (DJ30, SP500, NDX100, RUT2000) derived from the universe list.
- `public/index.html` and `public/stock.html` include `/search.css`, render `<div id="rv-search-root">`/`<div id="rv-stock-search-root">`, and call `attachSearchUI` to route every selection to `/stock.html?ticker=XYZ`.
- UI-only: all autocomplete data is read from `public/data/snapshots/universe/latest.json` (no new snapshots or writes), and unknown tickers still surface the WP11 `UNKNOWN_TICKER` experience.
