# Forecast System v3.4 — SSOT Baseline & Contract Proof
**Status:** PROVEN (based on file analysis)
**Date:** 2026-02-05

## 1. Single Source of Truth: `/api/stock`
The API endpoint `/api/stock` is the **only** permitted way for the UI to access EOD price history and technical indicators.

**File:** `functions/api/stock.js`
**Handler:** `onRequestGet` (lines 1041-1044 return response)

### Data Flow Diagram
```mermaid
graph TD
    UI[Frontend Cards] -->|fetch| API[/api/stock?ticker=XYZ]
    API -->|check| KV[Cloudflare KV]
    KV -->|hit| API
    KV -->|miss| ProviderChain[functions/api/_shared/eod-providers.mjs]
    
    ProviderChain -->|1. Try Tiingo| Tiingo[Tiingo API]
    Tiingo -->|fail| TwelveData[TwelveData API]
    
    Tiingo -->|success| API
    TwelveData -->|success| API
    
    API -->|compute| Indicators[eod-indicators.mjs]
    API -->|assemble| Response[JSON Envelope]
    Response -->|cache| KV
    Response --> UI
```

## 2. Response Contract (Golden)
The UI relies on this exact shape. NO KEYS MAY BE REMOVED.

### Top Level
| Key | Type | Description |
|-----|------|-------------|
| `schema_version` | String | e.g. "3.0" |
| `meta` | Object | Status, timestamps, provider info |
| `metadata` | Object | Deep trace info (digest, sources) |
| `data` | Object | **Core payload** |
| `error` | Object | Null if OK |

### `data` Object keys
| Key | Type | Used By (UI) |
|-----|------|--------------|
| `ticker` | String | Header, Chart title |
| `name` | String | Header |
| `bars` | Array | **Chart** (HighCharts/Plotly) |
| `latest_bar` | Object | Price badges, % Change |
| `change` | Object | `{ abs, pct }` - Hero section |
| `indicators` | Array | Technical Grid |
| `market_prices` | Object | Snapshot data fallback |
| `market_stats` | Object | PE Ratio, Market Cap |

### `meta` Object keys
| Key | Type | Description |
|-----|------|-------------|
| `status` | String | "fresh", "stale", "error", "unknown" |
| `provider` | String | "tiingo", "twelvedata", "eodhd" (future) |
| `quality_flags` | Array | e.g. ["GAP_DETECTED"] |
| `circuit` | Object | Circuit breaker state |

## 3. Golden Endpoint Set
These pages MUST NOT break.

1.  **Stock Analyzer** (`/` and `stock.html`)
    *   Endpoint: `/api/stock?ticker={SYMBOL}`
    *   Critical: `bars` for charting, `latest_bar` for price.
2.  **Elliott Waves** (`elliott.html`)
    *   Endpoint: `/api/elliott-scanner` (likely calls stock internals)
    *   Endpoint: `/api/stock` (if clicking details)
3.  **Scientific Analyzer** (`scientific.html`)
    *   Endpoint: `/data/snapshots/stock-analysis.json`
    *   Endpoint: `/api/stock` (detail view)
4.  **Forecast System** (`forecast.html`)
    *   Endpoint: `/data/forecast/latest.json`
    *   Endpoint: `/data/forecast/system/status.json`

## 4. Current Provider Chain logic
**File:** `functions/api/_shared/eod-providers.mjs`
**Logic:**
1.  Check `RV_FORCE_PROVIDER` env.
2.  Try `chain.primary` (hardcoded "tiingo").
3.  If fail & `FAILOVER_ALLOWED`, try `chain.secondary` (hardcoded "twelvedata").
4.  Return standardized internal bar format: `{ date, open, high, low, close, volume }`.
