# RubikVault vNext (Preview MVP)

RubikVault is a calm, data-driven market dashboard that runs on Cloudflare Pages + Pages Functions. The goal is a resilient preview deployment that survives free-tier limits and surfaces clear diagnostics when anything fails. The UI is block-based with a single loader/debug stack and no client-side secrets.

## Folder Map (key files)
- `index.html` – page layout + block containers
- `style.css` – global styling + block UI + responsive layout
- `rv-config.js` – canonical config + block registry
- `rv-loader.js` – loader, lazy-init, debug hooks, status strip
- `features/` – block UI modules + shared helpers
- `functions/api/` – Pages Functions API endpoints
- `assets/` – static JSON symbol lists
- `data/symbols/` – offline symbol universe for watchlist autocomplete
- `debug/` – debug panel and diagnostics
- `DEBUG_README.md` – troubleshooting and binding setup

## How Blocks Work (example)
Each block is registered in `rv-config.js` with an `id`, `module`, and optional `api`. The loader (`rv-loader.js`) lazy-loads the module when the block scrolls into view, then the block calls `fetchJSON("/api/<endpoint>")`. The response schema is standard and the debug UI shows trace IDs, cache layer, TTL, and upstream status.

Example: Block 01 – Market Health
- UI module: `features/rv-market-health.js`
- API: `functions/api/market-health.js`
- KV cache TTL: ~420s
- Providers: alternative.me (crypto FNG), CNN (stocks FNG), CoinGecko, Yahoo

## Block Registry (current)
| Block | Feature ID | UI Module | API Endpoint | TTL / Refresh | Provider(s) |
| --- | --- | --- | --- | --- | --- |
| Hero Market Cockpit | `rv-market-cockpit` | `features/rv-market-cockpit.js` | `/api/market-cockpit` | ~15m | CBOE, Alternative.me, Marketaux, FMP |
| Yield Curve | `rv-yield-curve` | `features/rv-yield-curve.js` | `/api/yield-curve` | ~6h | US Treasury |
| Sector Rotation | `rv-sector-rotation` | `features/rv-sector-rotation.js` | `/api/sector-rotation` | ~30m | FMP |
| Central Bank Watch | `rv-central-bank-watch` | `features/rv-central-bank-watch.js` | `/api/central-bank-watch` | ~30m | Fed, ECB |
| 01 Market Health | `rv-market-health` | `features/rv-market-health.js` | `/api/market-health` | ~420s | alternative.me, CNN, CoinGecko, Yahoo |
| 02 Price Snapshot | `rv-price-snapshot` | `features/rv-price-snapshot.js` | `/api/price-snapshot` | ~180s | CoinGecko |
| 03 Top Movers | `rv-top-movers` | `features/rv-top-movers.js` | `/api/top-movers` | ~240s | CoinGecko, Yahoo |
| 04 Earnings Calendar | `rv-earnings-calendar` | `features/rv-earnings-calendar.js` | `/api/earnings-calendar` | ~3600s | Finnhub (optional key) |
| 05 News Headlines | `rv-news-headlines` | `features/rv-news-headlines.js` | `/api/news` | ~600s | Yahoo, CNBC, Reuters |
| 06 Watchlist Local | `rv-watchlist-local` | `features/rv-watchlist-local.js` | `/api/quotes`, `/api/tech-signals`, `/api/earnings-calendar` | 45–60s quotes, 15m tech, 1h earnings | stooq, Finnhub (optional) |
| 07 Export CSV | `rv-export-csv` | `features/rv-export-csv.js` | (none) | on-demand | local cache |
| 08 Macro & Rates | `rv-macro-rates` | `features/rv-macro-rates.js` | `/api/macro-rates` | ~6h | FRED, Yahoo FX |
| 09 Crypto Snapshot | `rv-crypto-snapshot` | `features/rv-crypto-snapshot.js` | `/api/crypto-snapshot` | ~90s | CoinGecko |
| 10 Sentiment Barometer | `rv-sentiment-barometer` | `features/rv-sentiment-barometer.js` | `/api/sentiment` | ~15m | Provider or heuristic |
| 11 Tech Signals | `rv-tech-signals` | `features/rv-tech-signals.js` | `/api/tech-signals` | ~15m | stooq |
| 12 News Intelligence | `rv-news-intelligence` | `features/rv-news-intelligence.js` | `/api/news-intelligence` | ~1h | Marketaux |
| 13 S&P 500 Sectors | `rv-sp500-sectors` | `features/rv-sp500-sectors.js` | `/api/sp500-sectors` | ~6h | stooq (proxy) |

## Current State (expected)
| Block | OK / FAIL / PARTIAL | Reason |
| --- | --- | --- |
| 01–11 | OK | When `RV_KV` is bound and required keys are set |
| 01–11 | FAIL | `RV_KV` missing (BINDING_MISSING) |
| 04 | PARTIAL/FAIL | Missing `FINNHUB_API_KEY` (optional for earnings) |
| 08 | FAIL | Missing `FRED_API_KEY` (required for macro block) |

Note: Trace IDs are generated per request. Use the Debug UI or `/api/health` response to capture a live example.

## API Status Cheatsheet
- `/api/health`
- `/api/market-health`
- `/api/price-snapshot`
- `/api/top-movers`
- `/api/earnings-calendar`
- `/api/news`
- `/api/news-intelligence`
- `/api/quotes?symbols=AAPL,NVDA`
- `/api/tech-signals?timeframe=daily`
- `/api/macro-rates`
- `/api/crypto-snapshot`
- `/api/sentiment`
- `/api/market-cockpit`
- `/api/yield-curve`
- `/api/sector-rotation`
- `/api/central-bank-watch`
- `/api/sp500-sectors`
- `/api/snapshots/market_health`
- `/api/snapshots/macro_rates`
- `/api/social-daily-brief`
- `/api/social-runner?secret=...`
- `/api/og-image`

## Performance Budget (estimates)
- Initial viewport load: 3–4 API calls (Market Health, Price Snapshot, Top Movers)
- Per hour (visible tab, default refresh): ~10–20 calls (includes watchlist, sentiment, macro)
- Per day: ~250–500 calls, depending on usage and visibility

Red flags for free-tier limits:
- Repeated manual refresh spamming
- Missing KV binding (no caching)
- External provider rate limits (CoinGecko, Finnhub)

## Quick Fixes (prioritized)
MUST
- KV binding `RV_KV` added for Preview + Production (High impact, Low effort)
- Provide `FRED_API_KEY` for Macro block if needed (Medium impact, Low effort)

SHOULD
- Add `FINNHUB_API_KEY` to unlock earnings data (Medium impact, Low effort)
- Monitor CoinGecko rate limits; use `COINGECKO_DEMO_KEY` (Medium impact, Low effort)

COULD
- Expand stock universe for movers and top-30 table (Low impact, Medium effort)
- Add EU/UK/JP macro series once verified (Low impact, Medium effort)

WON’T (for preview)
- Paid data providers
- Client-side API keys

## Config Setup
Required:
- KV binding: `RV_KV` (Preview + Production)
- `FMP_API_KEY` (Market cockpit proxies, sector rotation)
- `MARKETAUX_KEY` (News Intelligence + Market cockpit sentiment)
- `FINNHUB_API_KEY` (Earnings + VIX proxy fallback)

Optional (per block):
- `FRED_API_KEY` (Block 08 Macro & Rates)
- `COINGECKO_DEMO_KEY` (CoinGecko rate-limit relief)
- `QUOTES_PROVIDER` (optional routing for quotes)
- `EARNINGS_PROVIDER` (Finnhub supported)
- `CRON_SECRET` (social runner auth)
- `SOCIAL_WEBHOOK_URL` (optional autopost)
- `SOCIAL_AUTOPUBLISH` (set to `true` to enable autopost)

Preview vs Production:
- Both environments must have `RV_KV` bound
- ENV keys can differ by environment

## Security Notes
- No API keys are exposed to the client
- CORS is handled at Functions level; `/api/*` is canonical
- CSP allowlist should only include domains used by active blocks
- Avoid `unsafe-eval` and string-based timers

## Healthcheck Script
Run:

```bash
bash scripts/healthcheck.sh http://localhost:8788
```

Notes:
- `ok:false` returns `PARTIAL` (exit code 2).
- Invalid JSON or non-200 responses return `FAIL` (exit code 1).

## AI Master Context Prompt
"""
You are working in the `rubikvault-site` repo (Cloudflare Pages + Pages Functions). The site uses a block loader (`rv-loader.js`) and config registry (`rv-config.js`). Blocks 01–11 are rendered via `features/*.js` and call `/api/*` Functions for data. KV binding `RV_KV` is required; missing bindings must return BINDING_MISSING. Avoid new architectures or parallel loaders. No client-side secrets. Use free providers (CoinGecko, stooq, Yahoo, FRED, Finnhub optional). Keep Debug UI and block titles visible. Add-only changes only.
"""
