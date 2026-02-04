# A2 Changes — Build-info v3 SSOT

## Changed files (with reason)
- `scripts/ops/build-build-info.mjs`
  - Writes canonical v3 artifact at `public/data/snapshots/build-info/latest.json`.
  - Data is an object with `commitSha` + `generatedAt` (SSOT fields) and compatibility fields.
  - Adds `meta.version`, `meta.provider`, `meta.data_date`, `meta.generated_at`.
- `functions/api/_shared/static-only.js`
  - Proof chain now accepts `data` object shape for module `build-info` (without weakening others).
- `functions/api/_shared/static-only-v3.js`
  - Same module-specific schema acceptance for `build-info`.
- `tests/build-info-artifact.test.mjs`
  - Enforces v3 artifact shape + meta.version/provider + data fields.

## Artifact updated
- `public/data/snapshots/build-info/latest.json`
  - Now v3 schema with object `data` as SSOT.

## Tests run
- `node tests/build-info-artifact.test.mjs`
- `npm run test:truth-chain`
