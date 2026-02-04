# A2 Changes — Build-info SSOT (Option A)

## Files changed
- `scripts/ops/build-build-info.mjs`
  - Removed legacy `/public/data/build-info.json` writer; only writes canonical snapshot `public/data/snapshots/build-info/latest.json`.
- `functions/api/mission-control/summary.js`
  - Reads build-info from canonical snapshot and maps `data.commitSha` + `data.generatedAt`.
- `public/ops/index.html`
  - Ops UI “Build:” line reads canonical snapshot and parses `data.commitSha`/`data.generatedAt`.
- `public/debug/diagnostics.js`
  - Debug diagnostics build-info fetch now uses canonical snapshot.
- `functions/api/_shared/static-only.js`
  - For module `build-info`, only `/data/snapshots/build-info/latest.json` is considered (no legacy fallbacks).
- `functions/api/_shared/static-only-v3.js`
  - Same canonical-only path enforcement for build-info.
- `scripts/ops/validate-truth.sh`
  - Validates canonical build-info snapshot instead of `/data/build-info.json`.
- `scripts/generate-eod-market.mjs`
  - Removed legacy `public/build-info.json` writer to avoid parallel truth.
- `public/DEBUG_README.md`
  - Updated build-info path documentation.
- `docs/ops/contract.md`
  - Added build-info SSOT note (canonical path + fields).

## Files removed
- `public/data/build-info.json`
- `public/build-info.json`

## Tests
- `node tests/build-info-artifact.test.mjs`
- `npm run test:truth-chain`

