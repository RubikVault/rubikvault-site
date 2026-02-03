# UI Golden Path

## Entrypoints

### 1. Main UI (`/`)
- **File:** `public/index.html`
- **Scripts:** `/market-clock.js`
- **API Calls:**
  - `/api/stock?ticker={ticker}` - Stock data
  - `/api/fundamentals?ticker={ticker}` - Fundamentals
- **Artifact Reads:**
  - `/data/snapshots/stock-analysis.json` - Scientific analysis
  - `/data/marketphase/index.json` - Elliott Waves index
  - `/data/universe/nasdaq100.json` - Stock universe
  - `/data/marketphase/{ticker}.json` - Per-ticker Elliott data

**Evidence:**
- `public/index.html:321` - `fetch('/data/snapshots/stock-analysis.json')`
- `public/index.html:351` - `fetch('/data/marketphase/index.json')`
- `public/index.html:546` - `UNIVERSE_URL = '/data/universe/nasdaq100.json'`
- `public/index.html:1466` - `fetchJson('/api/stock?ticker=...')`

### 2. Deep Link (`/analyze/:ticker`)
- **File:** `public/index.html` (same file, client-side routing)
- **API Calls:** Same as main UI
- **Artifact Reads:** Same as main UI

**Evidence:**
- `public/index.html:1459` - `window.history.pushState({}, '', `/analyze/${ticker}`)`
- `public/_redirects` - Deep link routing rules

### 3. Mission Control (`/internal/health`)
- **File:** `public/internal/health/index.html`
- **API Calls:** None (reads control plane directly)
- **Artifact Reads:**
  - `/data/provider-state.json` (primary)
  - `/data/manifest.json` (fallback)

**Evidence:**
- `public/internal/health/index.html:412` - `fetch('/data/provider-state.json')`
- `public/internal/health/index.html:419` - `fetch('/data/manifest.json')`

## Data Flow Diagram

```mermaid
graph TD
    A[public/index.html] --> B[fetch /api/stock]
    A --> C[fetch /data/snapshots/stock-analysis.json]
    A --> D[fetch /data/universe/nasdaq100.json]
    B --> E[functions/api/stock.js]
    E --> F[functions/api/_shared/static-only-v3.js]
    F --> G[/data/snapshots/{module}/latest.json]
    H[public/internal/health/index.html] --> I[fetch /data/provider-state.json]
    I --> J[scripts/lib/provider-state.js]
    J --> K[scripts/aggregator/finalize.mjs]
    K --> L[/data/manifest.json]
    K --> M[/data/provider-state.json]
```

## Golden Ticker
**AAPL** (used for testing/debugging)

## Key Findings
1. UI correctly uses v3.0 snapshot structure (`/data/snapshots/{module}/latest.json`)
2. API handlers transform v3.0 to legacy format for backward compatibility
3. Mission Control reads control plane files (provider-state.json, manifest.json)
4. All UI paths are SSOT-compliant
