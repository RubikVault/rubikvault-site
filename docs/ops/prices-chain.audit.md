Prices Truth Chain (P0–P7) — Audit Proof
========================================

Scope
-----
This document audits the **Prices** truth chain used by `/ops`. It must reflect the **real UI → API → Render** path only.
No pipeline/marketphase/KV signals are allowed to block Prices.

Authoritative Sources
---------------------
- UI route + API calls: `public/index.html` lines 1450–1485 (UI triggers `/api/stock`).
- API handler (latest_bar/change): `functions/api/stock.js` lines 841–866.
- Prices truth chain computation: `functions/api/mission-control/summary.js` lines 276–498.
- UI-path tracer (evidence producer): `scripts/ui-path/prove_ui_path.mjs` lines 52–220.
- Trace artifact (example, UBER): `public/debug/ui-path/UBER.ui-path.trace.json`.

Step-by-step audit
------------------

P0_UI_START — “User opens /analyze/<T> and the page JS loads.”
- INPUTS:
  - Route `/analyze/<T>` and UI event flow.
  - Evidence: `/api/stock` fetch triggered in UI.
- TRANSFORM:
  - UI selects ticker and triggers data fetch.
  - Code: `public/index.html` lines 1450–1485 (calls `fetchJson('/api/stock?...')`).
- OUTPUTS:
  - Network request is initiated.
- STORAGE:
  - UI-path trace artifact records this in `network.calls`.
  - File: `public/debug/ui-path/UBER.ui-path.trace.json`.
- NEXT:
  - P1_UI_CALLS_API reads the recorded `/api/stock` call.
- SOURCE OF TRUTH:
  - UI-path trace artifact (`public/debug/ui-path/UBER.ui-path.trace.json`).

P1_UI_CALLS_API — “The page triggers the winning request to /api/stock?ticker=<T>.”
- INPUTS:
  - `network.calls[]` from UI-path trace.
- TRANSFORM:
  - Identify `/api/stock` call and match it to UI-rendered values.
  - Code: `scripts/ui-path/prove_ui_path.mjs` lines 122–135, 178–204.
- OUTPUTS:
  - Winning request URL + status + response excerpt hash.
- STORAGE:
  - Trace file: `public/debug/ui-path/UBER.ui-path.trace.json`.
- NEXT:
  - P2 uses response payload for upstream attribution.
- SOURCE OF TRUTH:
  - `network.winning` in `public/debug/ui-path/UBER.ui-path.trace.json`.

P2_API_RECEIVES_RAW — “The backend receives upstream/cache data (HTTP ok + body) before any validation.”
- INPUTS:
  - Winning response excerpt (`response_excerpt`) and upstream classification.
- TRANSFORM:
  - Classify upstream based on `meta.data_source` and probe snapshot when needed.
  - Code: `scripts/ui-path/prove_ui_path.mjs` lines 158–176.
- OUTPUTS:
  - `upstream.kind`, `key_or_path`, `snapshot_probe.contains`.
- STORAGE:
  - Trace file: `public/debug/ui-path/UBER.ui-path.trace.json`.
- NEXT:
  - P3 validates `latest_bar` fields.
- SOURCE OF TRUTH:
  - `upstream` in UI-path trace.

P3_API_PARSES_VALIDATES — “Backend parses and validates required fields (close, volume, date) for sanity.”
- INPUTS:
  - `latest_bar.close`, `latest_bar.volume`, `latest_bar.date` from API response.
- TRANSFORM:
  - Validate numeric + date format.
  - Code: `functions/api/mission-control/summary.js` lines 376–391.
- OUTPUTS:
  - Status OK/WARN/FAIL with issue list.
- STORAGE:
  - `/api/mission-control/summary` → `data.truthChains.prices.steps[]`.
- NEXT:
  - P6 verifies API contract; P7 verifies UI rendering parity.
- SOURCE OF TRUTH:
  - `data.truthChains.prices.steps` in mission-control summary.

P4_CANONICAL_FORMAT — “Backend maps raw data into canonical latest_bar + change format.”
- INPUTS:
  - `latest_bar` and `change` fields from API response.
- TRANSFORM:
  - Canonical extraction (close/volume/date + change abs/pct).
  - Code: `functions/api/mission-control/summary.js` lines 393–405.
- OUTPUTS:
  - Status OK/WARN + evidence for change values.
- STORAGE:
  - `/api/mission-control/summary`.
- NEXT:
  - P6/P7 consume canonical values.
- SOURCE OF TRUTH:
  - `data.truthChains.prices.steps`.

P5_STATIC_PERSIST — “If configured, the canonical data is written to public/data and is fetchable as static; otherwise this is WARN.”
- INPUTS:
  - Policy flag `prices_static_required` and snapshot probe results.
- TRANSFORM:
  - If policy false → WARN; if true → OK/FAIL based on snapshot contains ticker.
  - Code: `functions/api/mission-control/summary.js` lines 407–431.
- OUTPUTS:
  - Status + evidence (path + contains).
- STORAGE:
  - `/api/mission-control/summary`.
- NEXT:
  - P6/P7 unaffected by static persistence.
- SOURCE OF TRUTH:
  - `public/data/ops/health-profiles.v1.json` (policy) + UI-path trace upstream probe.

P6_API_CONTRACT — “/api/stock returns JSON that satisfies the contract (latest_bar.close/volume/date present).”
- INPUTS:
  - API response payload for `/api/stock`.
- TRANSFORM:
  - Contract check for required fields.
  - Code: `functions/api/mission-control/summary.js` lines 433–451.
- OUTPUTS:
  - Status OK/FAIL.
- STORAGE:
  - `/api/mission-control/summary`.
- NEXT:
  - P7 uses same values for UI parity.
- SOURCE OF TRUTH:
  - `data.truthChains.prices.steps`.

P7_UI_RENDERS — “The UI displays values matching the API response.”
- INPUTS:
  - UI-detected values and API response values.
- TRANSFORM:
  - Compare UI close/volume/date to API latest_bar.
  - Code: `functions/api/mission-control/summary.js` lines 453–472.
- OUTPUTS:
  - Status OK/FAIL.
- STORAGE:
  - `/api/mission-control/summary`.
- NEXT:
  - End of Prices chain.
- SOURCE OF TRUTH:
  - UI-path trace + mission-control summary.

Notes
-----
- Prices chain **never** uses pipeline/static-ready/KV signals as blockers.
- If P6 and P7 are OK, Prices status must not be ERROR; P3 may only be WARN.
