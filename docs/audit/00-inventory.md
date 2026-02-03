# Repository Inventory

## Structure
- **Code Directories:** scripts, functions, src, backend
- **UI Directories:** public
- **API Directories:** functions, functions/api, functions/internal
- **OPS Directories:** functions/api, functions/internal, scripts/ops, scripts/aggregator, scripts/providers

## Key Files
- **UI Entrypoints:** public/index.html, public/internal/health/index.html
- **API Handlers:** functions/api/_shared/static-only-v3.js (primary), functions/api/_shared/static-only.js (imported by 59 handlers)
- **OPS Scripts:** scripts/aggregator/finalize.mjs, scripts/lib/provider-state.js
- **Control Plane:** public/data/manifest.json, public/data/provider-state.json
- **Data Plane:** public/data/snapshots/{module}/latest.json (v3.0), public/data/snapshots/*.json (legacy)

## Workflows
- `.github/workflows/v3-scrape-template.yml` - Matrix scraper
- `.github/workflows/v3-finalizer.yml` - Atomic publisher
- `.github/workflows/ci-gates.yml` - Quality gates

## Statistics
- **Total JSON files in public/data:** 245+
- **v3.0 snapshots:** 7 modules (health, market-health, market-prices, market-score, market-stats, render-plan, universe)
- **Legacy flat files:** 245+ files
- **API handlers:** 95+ files
- **Scripts:** 181+ files
