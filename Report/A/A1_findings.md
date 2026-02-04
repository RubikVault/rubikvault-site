# A1 Findings — Build-info SSOT (Option A)

## Source map (readers/writers/validators)
**Readers (canonical)**
- Ops UI build line reads canonical snapshot: `public/ops/index.html:868-875`
- Mission-control summary reads canonical snapshot: `functions/api/mission-control/summary.js:972-981`
- Debug diagnostics panel reads canonical snapshot: `public/debug/diagnostics.js:72-80`

**Writer (canonical)**
- Build-info generator writes v3 snapshot object:
  - `scripts/ops/build-build-info.mjs:7-65`
  - Output: `public/data/snapshots/build-info/latest.json`

**Validator / proof chain**
- Proof chain validates v3 schema and accepts object `data` ONLY for build-info:
  - `functions/api/_shared/static-only.js:81-86`
  - `functions/api/_shared/static-only-v3.js:122-128`
- Build-info canonical path enforced for build-info module only:
  - `functions/api/_shared/static-only.js:454-462`
  - `functions/api/_shared/static-only-v3.js:360-368`

## Canonical artifact shape (SSOT)
**File:** `public/data/snapshots/build-info/latest.json`
**Shape (v3 object data):**
- `schema_version`: "3.0"
- `meta.version`: "3.0"
- `meta.provider`: "build"
- `meta.data_date`: YYYY-MM-DD
- `meta.generated_at`: ISO
- `data` (object): `{ commitSha, generatedAt, branch, env, git_sha, build_time_utc }`

Evidence:
- `public/data/snapshots/build-info/latest.json:1-37`

## Legacy paths removed (no parallel truth)
- Removed static assets:
  - `public/data/build-info.json` (deleted)
  - `public/build-info.json` (deleted)

## Why PROOF_FAILED happened before
- Proof chain required v3 schema + metadata + data shape. Legacy build-info assets were not v3.
  - Evidence: `functions/api/_shared/static-only.js:81-86`

