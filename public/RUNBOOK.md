# RubikVault Runbook (Preview)

## Env Vars (Cloudflare Pages)
- Required: `RV_KV` (KV binding)
- Optional: `FINNHUB_API_KEY` (earnings/quotes enrichment)
- Optional: `MARKETAUX_KEY` (news intelligence sentiment)
- Optional: `FMP_API_KEY` (sector rotation/proxies)

## KV / Stale Mode
- Functions use KV-first caching. When upstream fails, stale KV (or client shadow cache) is returned.
- UI shows stale/partial badges instead of empty cells.
- If KV binding is missing, APIs return `BINDING_MISSING` and UI falls back to local shadow cache when available.

## Quick Checks
- `/api/yield-curve` and `/api/sector-rotation` should return numbers or `isStale: true`.
- `/api/news` and `/api/news-intelligence` should always return JSON (never HTML).
- Phase 1–3 endpoints (all return HTTP 200 JSON):
  - `/api/market-regime`
  - `/api/why-moved`
  - `/api/volume-anomaly`
  - `/api/hype-divergence`
  - `/api/congress-trading`
  - `/api/insider-cluster`
  - `/api/analyst-stampede`
  - `/api/smart-money`
  - `/api/alpha-performance`
  - `/api/earnings-reality`

## Social Output (Local)
- Generate daily summaries into `public/posts/`:
  - `node scripts/generate-posts.js http://localhost:8788`
- Output files: `<feature>_YYYY-MM-DD.json` (text-only captions for Twitter/LinkedIn/IG).

## New Files Added
- `functions/api/_shared/feature-contract.js` (dataQuality + confidence helpers)
- `functions/api/_shared/stooq.js` (keyless daily CSV fetch helper)
- `functions/api/*` (phase 1–3 endpoints)
- `features/rv-*` (phase 1–3 renderers)
- `assets/js/us-universes.js` (offline universe merge/search)
- `assets/js/rv-*.js` (thin wrappers)
- `scripts/generate-posts.js` (social summary generator)
- `public/posts/.gitkeep` (posts directory placeholder)
