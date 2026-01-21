# Phase 1 / WP2 — Prices (Index Proxies) Artifacts (market-prices)

## What this adds

- A new provider module script:
  - `scripts/providers/market-prices-v3.mjs`
- A small artifact validator:
  - `scripts/validate/market-prices-artifact.v1.mjs`

## Contracts used

- `scripts/lib/envelope.js` → `buildEnvelope(data, metadata)`
- `scripts/lib/digest.js` → `computeSnapshotDigest(envelope)`
- `scripts/lib/module-state.js` → `buildModuleState(moduleName, envelope, validationResult, moduleConfig, options)`

WP2 produces artifacts only (no `public/data` writes). Real fetch is deferred to WP3.

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

WP2 does not implement real provider fetch.

If you force real mode:

- `RV_PRICES_FORCE_REAL=1 node scripts/providers/market-prices-v3.mjs`

It fails loud with:

- `REAL_FETCH_NOT_IMPLEMENTED_YET (use STUB or implement WP3 provider)`
