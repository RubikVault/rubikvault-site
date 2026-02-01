# UI→API Path Proof (UBER)

**Goal:** Prove, with evidence, the exact request chain used by `/analyze/UBER` for the displayed close/volume/date.

## Summary (Single Path)
**UI → /api/stock → functions/api/stock.js → upstream (snapshot or provider)**

This chain is proven by the Playwright network trace and response matching.

## Evidence

### 1) Static Code Discovery (Repo)
- **UI data fetch**: `public/index.html`
  - `/api/stock`: line **1466**
  - `/api/fundamentals`: line **1467**
  - `latest_bar` read: line **931**
  - `close` read: line **932**
  - `volume` read: line **933**
  - `date` read: line **934**
- **Handler**: `functions/api/stock.js`
  - `onRequestGet`: line **326**
  - `latestBar` assignment: line **841**
  - `dayChange` assignment: line **842**

### 2) Real Browser Network Trace (Authoritative)
- Trace file: `public/debug/ui-path/UBER.ui-path.trace.json`
- Contains:
  - network calls (URL, method, status, sha256)
  - DOM-extracted UI values (close/volume/date)
  - winning response mapped to those values

### 3) Winning Response → Handler
- Endpoint: `/api/stock?ticker=UBER`
- Handler file: `functions/api/stock.js` (`onRequestGet`, line 326)
- Winning response contains `data.latest_bar.close`, `data.latest_bar.volume`, `data.latest_bar.date` matching DOM values.

### 4) Handler → Upstream
- Source determined from response `meta.data_source` in the winning response.
- The trace also probes snapshot presence and whether it actually contains the ticker.
- Example (UBER trace on preview):
  - `meta.data_source = snapshot`
  - `snapshot_probe.contains = false` (bootstrap‑mini snapshot does not include UBER)

This mismatch is **recorded**, not inferred. If `snapshot_probe.contains=false`, the trace marks it; it does not guess the alternative path.

## Out-of-Path Price Sources
These exist in the repo but are **not** used by `/analyze/:ticker` for price display:
- `/data/eod/manifest.latest.json` + `public/data/eod/batches/*`
- `/data/pipeline/*`
- `/data/marketphase/*` (used for Elliott/analysis sections only)

## How to Reproduce
```
BASE_URL="https://54423639.rubikvault-site.pages.dev" node scripts/ui-path/prove_ui_path.mjs UBER
```

Expected output:
- `public/debug/ui-path/UBER.ui-path.trace.json`
- Trace contains a “winning response” pointing to `/api/stock` with matching values.

If UI values cannot be extracted or no matching response is found, the script fails loud.
