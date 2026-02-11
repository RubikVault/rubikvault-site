# P0/P1 Hardening — Fix Report (v2)

> Canonical contracts: [P0_P1_HARDENING_CONTRACTS.md](../../docs/ops/P0_P1_HARDENING_CONTRACTS.md)

## Open Issues Closed

| # | Issue | Classification | Status |
|---|---|---|---|
| 1 | PROD missing `build-meta.json` | DEPLOY GAP | **CLOSED** |
| 2 | PROD missing `marketphase/index.json` | DEPLOY GAP | **CLOSED** |
| 3 | PROD APIs old contract shape | DEPLOY GAP | **CLOSED** |
| 4 | `build-meta` commit=null quality gap | OBSERVABILITY GAP | **CLOSED** |
| 5 | Preview/Prod parity gap | DEPLOY GAP | **CLOSED** |

## Root Cause

**All issues #1-3,5 were DEPLOY GAPs**: the fix code existed only on branch `codex/workflow-green-finalizer-v12`, not in `origin/main`. Prod is deployed from `main`. Fix: merged branch into main.

**Issue #4 was OBSERVABILITY GAP**: `build-ops-daily.mjs` relied on `GITHUB_SHA`/`CF_PAGES_COMMIT_SHA` env vars which are absent locally. Fix: added `git rev-parse HEAD` fallback.

## Fixes Applied

### Phase 1 — MarketPhase index.json 404 → CLOSED
- `scripts/ops/build-ops-daily.mjs:330-346` generates `public/data/marketphase/index.json` from universe
- `.gitignore` negation added for `index.json`

### Phase 2 — meta.url null → CLOSED
- `functions/data/marketphase/[asset].js` lines 61,79-81,89,112: `url` field in all 4 response paths

### Phase 3 — build_id cohesion → CLOSED
- `scripts/ops/build-ops-daily.mjs:233-248`: shared `build-meta.json` SSOT with git fallback
- `scripts/ops/build-ops-pulse.mjs:76-78`: reads shared build-meta
- `functions/api/mission-control/summary.js:370-390`: async fetch of build-meta
- `functions/api/elliott-scanner.js:191-197`: fetchJsonSafe build-meta

### Phase 4 — Report/A → UPDATED
- Report/A/FIX_REPORT.md, EVIDENCE.md, DIFF_SUMMARY.md

### Phase 5 — Merge to main → CLOSED
- Merged `codex/workflow-green-finalizer-v12` into `main` (commit `7a67d63d`)
- Pushed to origin/main, Cloudflare deployed automatically
