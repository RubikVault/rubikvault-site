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
