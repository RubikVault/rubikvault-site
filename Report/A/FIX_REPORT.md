# P0/P1 Hardening — Fix Report

> Canonical contracts: [P0_P1_HARDENING_CONTRACTS.md](../../docs/ops/P0_P1_HARDENING_CONTRACTS.md)

## Fixes Applied

### Phase 1 — MarketPhase index.json 404 (P0-2)
- **Root cause**: `public/data/marketphase/` directory did not exist; no build step generated it.
- **Fix**: `scripts/ops/build-ops-daily.mjs` now generates `public/data/marketphase/index.json` from the universe (`all.json`) when it is missing or malformed.
- **Fallback**: `functions/data/marketphase/[asset].js` already had a runtime fallback for `index.json` returning a `circuitOpen` envelope — this remains as defense-in-depth.
- **Evidence**: `build-ops-daily.mjs:327-343`, file exists with 517 symbols.

### Phase 2 — MarketPhase meta.url null (P0-3)
- **Root cause**: `meta.url` field was not set in any of the 3 error response paths or the static pass-through.
- **Fix**: Added `url: /data/marketphase/<asset>` to all 4 response paths in `[asset].js`.
- **Evidence**: `functions/data/marketphase/[asset].js:61,79-81,89,112`

### Phase 3 — Build_id Cohesion (P0-4)
- **Root cause**: `build-ops-pulse.mjs`, `summary.js`, `elliott-scanner.js` each computed `build_id` independently using env vars, producing different values.
- **Fix**: `build-ops-daily.mjs` now writes `public/data/ops/build-meta.json` as SSOT. Pulse reads it at build time; runtime functions (`summary.js`, `elliott-scanner.js`) fetch it via same-origin.
- **Evidence**: build-meta and pulse `build_id` match after generation.

### Phase 4 — Report/A Evidence Pack
- Created `Report/A/FIX_REPORT.md`, `EVIDENCE.md`, `DIFF_SUMMARY.md`.
