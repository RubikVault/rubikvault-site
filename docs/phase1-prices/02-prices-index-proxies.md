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

## Required env vars

- `RV_PRICES_FORCE_REAL=1` to enable real mode.
- `ALPHAVANTAGE_API_KEY` (from `public/data/registry/providers.v1.json` → Provider A).

## 60s local run (commands)

- `node scripts/providers/market-prices-v3.mjs`
- `RV_PRICES_FORCE_REAL=1 ALPHAVANTAGE_API_KEY=your_key node scripts/providers/market-prices-v3.mjs`
- `node scripts/validate/market-prices-artifact.v1.mjs`
