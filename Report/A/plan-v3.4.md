# Forecast System v3.4 — Implementation Plan
**Status:** DEPLOYED
**Goal:** Implement EODHD adapter, internal history store, and universe expansion.

## 1. Registry-Driven Provider Chain
**Files to Modify:**
- `functions/api/_shared/eod-providers.mjs`: Replace hardcoded strings with registry lookup.
**Files to Create:**
- `functions/api/_shared/provider-adapters.mjs`: Adapter pattern interface.
- `public/data/registry/providers.v1.json`: Config file (primary="tiingo" initially).

**Risk:** Break in provider selection logic.
**Mitigation:** Unit test/smoke test `smoke-api-stock.mjs` before switch.

## 2. EODHD Adapter + Switch
**Files to Create:**
- `functions/api/_shared/eodhd-adapter.mjs`: EODHD implementation.
- `scripts/dev/smoke-api-stock.mjs`: Verification script.

**Risk:** EODHD returns different data shape or sorts differently.
**Mitigation:** `eodhd-adapter.mjs` MUST normalize to `{date: ISO, open, high, low, close, volume}` and sort ASC.

## 3. Internal Price History Store
**Architecture:**
- Store: `public/data/eod/bars/{SYMBOL}.json`
- Logic: **Read-Through Cache** (Store -> Provider -> Store).

**Files to Modify:**
- `functions/api/stock.js`: Add store lookup logic.

**Files to Create:**
- `functions/api/_shared/history-store.mjs`: Read/Write utils.
- `scripts/providers/eodhd-backfill-bars.mjs`: Backfill script.

**Risk:** Stale data in store.
**Mitigation:** Store files act as "cold cache". API should refresh if store is too old (e.g. > 24h). (Runbook implies "Serve from store first" — we must ensure we have a mechanism to eventually refresh).

## 4. Ops Dashboard & Reporting
**Files to Create:**
- `scripts/forecast/ops_report.py`: Daily health check.
- `dev/ops/forecast/index.html`: Dashboard.

## 5. Deployment & CI
- GitHub Actions for backfill and refresh.

## 6. Execution Order
1.  **Registry & Adapters** (Safe refactor).
2.  **EODHD Switch** (Config change).
3.  **History Store** (Architecture change).
4.  **Ops & Bootstrap** (Additions).
5.  **Final Polish**.
