# A2 Changes (Code + Tests)

## Code changes
- `functions/api/mission-control/summary.js`
  - Preview: pipeline baseline verdict returns `INFO/NOT_EXPECTED` when `expectedFlags.pipeline=false` (avoid false RISK).
  - P0/P1/P7 truth-chain severity downgraded to INFO in preview when traces are missing.
  - Snapshot freshness prefers `meta.data_date` + `meta.generated_at` when present.
  - Adds `data.owner` and `data.cards` for owner-grade endpoints.
  - Build-info mapping accepts `commitSha` + `generatedAt`.
  - Evidence: `functions/api/mission-control/summary.js:311-398`, `542-565`, `762-777`, `1490-1558`.

- `functions/api/_shared/static-only.js` and `functions/api/_shared/static-only-v3.js`
  - Owner endpoints never return 503/MAINTENANCE; they return 200 with degraded owner payload when assets missing.
  - Debug meta.status normalized to `ok/error` (no `fresh`).
  - Evidence: `functions/api/_shared/static-only.js:333-511` and `:78-141`.

- `scripts/ops/build-build-info.mjs`
  - Writes v3 snapshot to `public/data/snapshots/build-info/latest.json` with metadata + validation.
  - Adds `meta.status`, `meta.data_date`, `meta.generated_at` for owner-grade response.
  - Evidence: `scripts/ops/build-build-info.mjs:7-54`.

- `scripts/providers/market-prices-v3.mjs`
  - Adds `meta.data_date` + `meta.generated_at` to snapshots.
  - Evidence: `scripts/providers/market-prices-v3.mjs:1456-1476`.

- `scripts/ops/build-ops-daily.mjs`
  - Freshness uses `meta.data_date` when available.
  - Evidence: `scripts/ops/build-ops-daily.mjs:317-331`.

- `scripts/ops/env.config.mjs`
  - Default OPS_BASE fallback to `http://127.0.0.1:8788`.
  - Evidence: `scripts/ops/env.config.mjs:1-16`.

- `public/ops/index.html`
  - INFO status rendered as green (ok) for preview-safe UX.
  - Evidence: `public/ops/index.html:593-598`.

- `docs/ops/contract.md`
  - Canonical meta.status enum = `ok|degraded|error`.
  - Owner endpoints never return 503; ops verifier default base documented.
  - Evidence: `docs/ops/contract.md:35-75`.

## Tests added/updated
- `tests/build-info-artifact.test.mjs`
  - Verifies build-info v3 snapshot exists and passes schema expectations.
- `scripts/ops/rv_verify_truth_summary.mjs`
  - Adds owner field checks + meta.status enum enforcement + preview baseline/p1/p7 rules.

## Tests run locally
- `node tests/build-info-artifact.test.mjs`
- `npm run test:truth-chain`
