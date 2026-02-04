# A1 Findings — Build-info v3 SSOT (Option A)

## Source map (readers/writers/validators)
**Readers**
- `/api/build-info?debug=1` is served by static-only pipeline; proof chain validation requires v3 snapshot:
  - `functions/api/_shared/static-only.js:63-85, 137-141` (SCHEMA check + PROOF_FAILED)
  - `functions/api/_shared/static-only-v3.js:104-138` (same check in v3 variant)
- Mission-control summary reads `/build-info.json` for deploy info (not the v3 snapshot):
  - `functions/api/mission-control/summary.js:935-943`
- Ops UI reads `/data/build-info.json` (not the v3 snapshot):
  - `public/ops/index.html:870-884`

**Writer**
- Build-info generator writes the canonical v3 artifact at:
  - `scripts/ops/build-build-info.mjs:7-66`
  - Output: `public/data/snapshots/build-info/latest.json`

**Validator / Proof chain**
- Proof chain requires v3: `snapshot.schema_version === "3.0"`, metadata present, and data shape check:
  - `functions/api/_shared/static-only.js:78-85` (now allows object for build-info)
  - `functions/api/_shared/static-only-v3.js:116-124`

## Current canonical artifact shape (SSOT)
**File:** `public/data/snapshots/build-info/latest.json`
**Shape (v3 object data):**
- `schema_version`: "3.0"
- `meta.version`: "3.0"
- `meta.provider`: "build"
- `meta.data_date`: YYYY-MM-DD
- `meta.generated_at`: ISO
- `data` (object): { commitSha, generatedAt, branch, env, git_sha, build_time_utc }

Evidence:
- `public/data/snapshots/build-info/latest.json` (file contents in repo)

## Why PROOF_FAILED happened before
- Proof chain in `static-only` requires v3 schema + metadata + data shape.
- Legacy/non-v3 build-info assets failed SCHEMA check and emitted `PROOF_FAILED`.
  - Evidence: `functions/api/_shared/static-only.js:78-85, 137-141`

## Owner-grade requirement alignment
- Owner endpoints should return HTTP 200 with in-body verdicts, never 503.
- This runbook scopes only build-info SSOT; owner endpoint changes tracked separately.

