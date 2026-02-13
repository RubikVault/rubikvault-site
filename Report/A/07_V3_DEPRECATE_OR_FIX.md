# v3 Decision: FIX path retained (with explicit blockers)

## Why not immediate archive
- v3 artifacts still feed currently consumed snapshots (`market-prices`, `market-stats`) used by API/UI paths.
- Evidence references:
  - `functions/api/stock.js` reads market-prices snapshot.
  - `functions/api/mission-control/summary.js` probes `/data/snapshots/market-prices/latest.json`.
  - `scripts/pipeline/build-ndx100-pipeline-truth.mjs` reads `public/data/snapshots/market-prices/latest.json`.

## Root-cause chain addressed
1. Missing modules registry path in v3 scrape prepare stage.
- Evidence: run `21885900868` -> `Cannot find module './public/data/registry/modules.json'`.
- Fix: fallback matrix generation (`.github/workflows/v3-scrape-template.yml:63-87`).

2. Market-stats path drift (universe/registry).
- Evidence: run `21921648478` -> ENOENT `public/data/registry/universe.v1.json`.
- Fix: fallback in `scripts/providers/market-stats-v3.mjs:78-99`.

3. Market-stats stage re-fetch inefficiency.
- Fix: reuse scraped market-prices artifact (`.github/workflows/v3-scrape-template.yml:246-263`).

## Current blocker (known, not unknown)
- v3 and wp16 continue to fail on strict provider validation thresholds:
  - run `21922259282` and `21922258342` show `VALIDATION_FAILED ... drop_ratio=0.0464 ... drop_threshold violated`.
  - Gate source: `scripts/aggregator/finalize.mjs:237-241`.

## Decision now
- `v3-scrape-template`: KEEP + REPAIR (quality/provider contract issue remains).
- `v3-finalizer`: KEEP (green on branch: `21921485186`).
- `wp16-manual-market-prices`: ARCHIVE-CANDIDATE (manual, high overlap with v3 scrape, repeatedly quality-gated failure).

## Archive criteria for wp16-manual (if chosen)
1. Confirm no workflow dependency requires `wp16-manual-market-prices.yml`.
2. Keep v3 scrape/finalizer chain as primary path.
3. Move to `.github/workflows/_archive/` in dedicated PR (non-destructive history).
