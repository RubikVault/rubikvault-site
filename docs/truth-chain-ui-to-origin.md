# Truth Chain — UI → Origin (UBER, TEAM, WBD)

**Base used for trace:** `https://rubikvault.com` (live)

## Chain Diagram (UI → Origin)

```
/analyze/:ticker (public/index.html)
  ├─ fetch /api/stock?ticker=...  ──► functions/api/stock.js (onRequestGet)
  │    ├─ resolveSymbol(...)
  │    ├─ cache/KV read (cache-law.js)
  │    ├─ fetchBarsWithProviderChain(...)
  │    ├─ pickLatestBar / computeDayChange
  │    └─ response data.latest_bar / data.change
  ├─ fetch /api/fundamentals?ticker=... ─► functions/api/fundamentals.js
  ├─ fetch /data/marketphase/<TICKER>.json
  └─ fetch /data/snapshots/stock-analysis.json

renderStock() formats:
  close, day_abs, day_pct, volume, date
```

## Step-by-step Trace (with proof anchors)

### Step 1 — UI route and network calls
- **File:** `public/index.html`
- **UI route:** `/analyze/:ticker`
- **Network calls** (line refs from trace):
  - `/api/stock` — line **1466** (`fetchJson(`/api/stock?...`)`)
  - `/api/fundamentals` — line **1467**
  - `/data/marketphase/<TICKER>.json` — line **1317** (`getElliottPayload`)
  - `/data/snapshots/stock-analysis.json` — line **319** (`loadScientificData`)

### Step 2 — UI values used and formatting
- **File:** `public/index.html`
- **Fields read from payload:**
  - `data.latest_bar.close` — line **932**
  - `data.change.abs` — line **935**
  - `data.change.pct` — line **936**
  - `data.latest_bar.volume` — line **933**
  - `data.latest_bar.date` — line **934**
- **Formatter functions:**
  - `formatNumber` — line **778**
  - `formatPercent` — line **785**
  - `formatDateDDMMYYYY` — line **1001**

### Step 3 — /api/stock handler and transforms
- **Handler:** `functions/api/stock.js` line **326** (`onRequestGet`)
- **Transforms:**
  - `pickLatestBar` — line **75**
  - `computeDayChange` — line **81**
  - `computeIndicators` — line **843**
- **Assignments:**
  - `latest_bar` — line **841**
  - `change` — line **842**

### Step 4 — /api/fundamentals handler
- **Handler:** `functions/api/fundamentals.js` line **189** (`onRequestGet`)
- **Normalization:** `normalizeFundamentalsFromTiingoRow` line **39**

### Step 5 — Analysis artifacts (Elliott + Scientific)
- **MarketPhase:** `/data/marketphase/<TICKER>.json`
- **MarketPhase index:** `/data/marketphase/index.json`
- **Scientific analysis:** `/data/snapshots/stock-analysis.json`

## Artifacts (local repo) + schema + hash

| Artifact (absolute path) | schema_version | sha256 (short) | Fields used by UI | Notes |
|---|---|---|---|---|
| `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/snapshots/universe/latest.json` | 3.0 | `9484bd4bf2da6bff…` | `data[].symbol`, `data[].name` | local snapshot is empty array in repo |
| `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/snapshots/market-prices/latest.json` | 3.0 | `073b69d578ebec74…` | `data[].symbol`, `data[].date`, `data[].close` | used by /api/stock for market_prices + as_of |
| `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/snapshots/market-stats/latest.json` | 3.0 | `206e2bd7977f1aed…` | `data[].symbol`, `data[].as_of`, `data[].metrics` | used by /api/stock for market_stats |
| `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/snapshots/market-score/latest.json` | 3.0 | `3eb7002e8632f2a6…` | `data[].symbol`, `data[].score` | used by /api/stock for market_score |
| `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/snapshots/stock-analysis.json` | (none) | `5d14a21585e436f0…` | `_rankings.by_timeframe.*[].ticker` | scientific analyzer input |
| `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/marketphase/index.json` | (none) | `90855708cad6a88e…` | `data.symbols[].symbol`, `data.symbols[].path` | Elliott support index |

**Remote hashes and response excerpts** are captured in each trace JSON.

## Per‑Ticker Evidence (final UI values)

| Ticker | Close | Day Abs | Day % | Volume | Date (UI) |
|---|---|---|---|---|---|
| UBER | $80.05 | -1.65 | (-2.02%) | 24,344,094 | 30-01-2026 |
| TEAM | $118.18 | -2.20 | (-1.83%) | 4,400,025 | 30-01-2026 |
| WBD | $27.54 | -0.06 | (-0.22%) | 24,238,625 | 30-01-2026 |

**Source:** `public/debug/truth-chain/<TICKER>.trace.json`

## Trace Reports Generated
- `public/debug/truth-chain/UBER.trace.json`
- `public/debug/truth-chain/TEAM.trace.json`
- `public/debug/truth-chain/WBD.trace.json`
