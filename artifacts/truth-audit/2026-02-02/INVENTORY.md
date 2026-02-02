# Truth Audit Inventory (2026-02-02)

Base URL (runtime evidence): `https://rubikvault.com` (see `RUNTIME_CONTEXT.json`).

## Canonical Truth Path: UI → API (Prices)

**Canonical field paths (observed)**
- UI uses `/api/stock?ticker=<T>` and reads `data.latest_bar` for `close`, `volume`, `date`.
  - Evidence (UI fetch): `public/index.html:1448-1468` (calls `/api/stock?ticker=...`).
  - Evidence (UI contract read): `public/index.html:931-934` (`const bar = data?.latest_bar`).
  - Evidence (API response shape): `artifacts/truth-audit/2026-02-02/raw/api_stock_UBER.json` shows `data.latest_bar` with `date/close/volume`.
  - Evidence (API producer): `functions/api/stock.js:855-865` sets `latest_bar` under `data`.

**Producer → Consumer**
- Producer: `functions/api/stock.js` writes `data.latest_bar` (lines 855–865).
- Consumer: `public/index.html` reads `data.latest_bar` (lines 931–934).

**Allowed fallbacks (observed in code)**
- `functions/api/mission-control/summary.js` includes fallback handling for `response.latest_bar`.
  - Evidence: `functions/api/mission-control/summary.js:290-292`.
  - Runtime hits: `RUNTIME_TELEMETRY.json` shows `latest_bar` path hits = 0 in scenarios; treat as **ALLOWED FALLBACK (legacy)**.

**Forbidden/Zombie candidates**
- Top-level `latest_bar` (without `data.`): no runtime hits in S0/S1.
  - Evidence: `RUNTIME_TELEMETRY.json` shows `latest_bar` = 0.
  - Static refs exist (legacy fallback), so **NOT safe to delete yet**.

## Canonical Mission-Control Summary Shape

**Canonical location for truth chains**
- Truth chains are nested at `data.truthChains`.
  - Evidence (producer): `functions/api/mission-control/summary.js:1601-1604`.
  - Evidence (runtime): `artifacts/truth-audit/2026-02-02/raw/mission_control_summary.json` contains `data.truthChains`.
  - Runtime hits: `RUNTIME_TELEMETRY.json` shows `data.truthChains` hits = 1; `truthChains` top-level hits = 0.

**Allowed fallbacks (legacy)**
- UI renderer and tests use `data.truthChains` with fallback to legacy fields.
  - Evidence: `public/ops/index.html:736-737` uses `data?.truthChains?.prices || data?.priceTruth`.

## UI-Path Trace Contract (debug artifacts)

**Canonical fields**
- `trace_version`, `generated_at`, `base_url`, `page_url`, `network.winning.path`, `ui.values`.
  - Evidence (producer): `scripts/ui-path/prove_ui_path.mjs:193-223`.
  - Evidence (runtime): `artifacts/truth-audit/2026-02-02/raw/ui_path_trace_UBER.json`.

**Required contract paths (observed)**
- `network.winning.path` must be a relative path starting with `/`.
- `ui.values.close`, `ui.values.volume`, `ui.values.date` must exist when UI extraction succeeds.

**Observed drift (base mismatch)**
- The stored trace `ui_path_trace_UBER.json` uses base_url `https://cf4b6652.rubikvault-site.pages.dev`, which does **not** match the current audit base `https://rubikvault.com`.
  - Evidence: `artifacts/truth-audit/2026-02-02/raw/ui_path_trace_UBER.json` (base_url) and `SCENARIO_MATRIX.md` (S2_TRACE_BASE_INTEGRITY = FAIL).

## Allowed Fallbacks vs Forbidden Paths (current evidence)

**ACTIVE (runtime hits present)**
- `data.latest_bar` (api_stock)
- `data.truthChains` (mission_control)
- `network.winning.path` (ui_path_trace)

**ALLOWED FALLBACK (legacy, no runtime hits in scenarios)**
- `latest_bar` (top-level)
- `truthChains` (top-level)

**UNKNOWN (insufficient scenarios)**
- Degrade-only paths (e.g., `data.bar`, `bar`, alternate trace fields) — not exercised in S4 (no degrade toggle found).

## Evidence Index

- UI → API fetch: `public/index.html:1448-1468`
- UI reads `data.latest_bar`: `public/index.html:931-934`
- API writes `data.latest_bar`: `functions/api/stock.js:855-865`
- Summary truthChains location: `functions/api/mission-control/summary.js:1601-1604`
- UI-path trace schema: `scripts/ui-path/prove_ui_path.mjs:193-223`
- Runtime evidence: `artifacts/truth-audit/2026-02-02/raw/*.json`
- Runtime telemetry: `artifacts/truth-audit/2026-02-02/RUNTIME_TELEMETRY.json`

## Unknowns (need more proof)
- Degrade-only contract variants (no scenario available).
- Whether legacy top-level `latest_bar` appears in older deployments.
