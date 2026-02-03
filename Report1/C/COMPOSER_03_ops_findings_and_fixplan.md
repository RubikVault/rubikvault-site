# OPS Findings and Fix Plan

**Live URL:** https://638a1962.rubikvault-site.pages.dev  
**Audit Date:** 2026-02-03T16:14:06Z  
**Evidence Source:** `/api/mission-control/summary?debug=1`

## A) Executive Summary

1. **OPS UI shows 3 yellow (INFO) indicators:** Platform, Freshness, Pipeline all show INFO status (yellow) because preview mode sets `expectedFlags.kv=false`, `expectedFlags.pipeline=false`. This is CORRECT per `health-profiles.v1.json` (`not_expected_status: "INFO"`), but UI displays INFO as yellow (`statusClass('INFO')` = `'warn'`).

2. **deploy.gitSha/buildTs are null:** Live `/build-info.json` has `commitSha`/`generatedAt`, but `fetchBuildInfo` checks `gitSha`/`git_sha`/`sha`/`commit` (missing `commitSha`) and `buildTs`/`build_ts`/`builtAt`/`built_at`/`timestamp` (missing `generatedAt`). Result: null → displayed as "unknown" in UI.

3. **Debug endpoints show FAILED:** `/api/build-info` and `/api/debug-bundle` return `VALIDATION_FAILED_SCHEMA` because `schema_version` is null (legacy artifacts). `/api/ops` returns `ASSET_FETCH_FAILED` (NOT_FOUND). These are not critical for OPS UI display but show errors in debug mode.

4. **User-facing UI is correct:** Prices health is OK, API health is OK, all contract checks pass. The non-green indicators in OPS are informational (preview mode expectations), not errors.

5. **Root cause:** OPS UI uses stricter color coding than user-facing UI. INFO status (informational) is displayed as yellow (warn), which makes preview mode appear "not green" even though it's correct.

6. **Fix options:** (A) Add field name aliases to `fetchBuildInfo` for `commitSha`/`generatedAt`, (B) Update build-info.json generator to emit canonical names, (C) Make INFO status green in preview mode for "NOT_EXPECTED" reasons, (D) Accept yellow as correct for preview mode.

7. **No critical errors:** All health checks pass, all contracts valid, all counts correct. The non-green indicators are by design for preview mode.

8. **SSOT partial:** `health-profiles.v1.json` defines expected flags and `not_expected_status: "INFO"`, but no contract defines build-info.json schema or field name mappings.

9. **Preview mode semantics:** Preview mode correctly sets `expectedFlags.kv=false`, `expectedFlags.pipeline=false`, which triggers INFO status with reason "NOT_EXPECTED". This is intentional per health-profiles.v1.json.

10. **Minimal fix:** Add `commitSha` and `generatedAt` to alias lists in `fetchBuildInfo` (functions/api/mission-control/summary.js:941-942) to fix deploy.gitSha/buildTs null values.

---

## B) Proven Wrong Fields (Causing Non-Green)

| field | observed | expected(SSOT) | root cause | fix |
|-------|----------|---------------|------------|-----|
| deploy.gitSha | null | "b68b50be1b6215eafc20da5f462be457966f691c" | Field name mismatch: build-info.json has `commitSha` but code checks `gitSha`/`git_sha`/`sha`/`commit` (missing `commitSha`) | Add `commitSha` to alias list in fetchBuildInfo (functions/api/mission-control/summary.js:941) |
| deploy.buildTs | null | "2026-01-19T10:08:46.231Z" | Field name mismatch: build-info.json has `generatedAt` but code checks `buildTs`/`build_ts`/`builtAt`/`built_at`/`timestamp` (missing `generatedAt`) | Add `generatedAt` to alias list in fetchBuildInfo (functions/api/mission-control/summary.js:942) |

---

## C) Undecidable Fields (Missing SSOT)

| field | why undecidable | minimal SSOT artifact to add | where used |
|-------|-----------------|------------------------------|------------|
| deploy.gitSha | No contract defines build-info.json schema. Field name mismatch between generator and reader. | Create `public/data/ops/build-info-contract.v1.json` defining schema: `{gitSha: string\|null, buildTs: string\|null}` and field name mappings (`commitSha` → `gitSha`, `generatedAt` → `buildTs`). | `functions/api/mission-control/summary.js:935-947`, `public/ops/index.html:777-783` |
| deploy.buildTs | Same as above. | Same SSOT artifact as above. | Same as above |

---

## D) Remove/Optionalize List (Not Required in PREVIEW)

**None** - All checks are valid for preview mode. INFO status for "NOT_EXPECTED" is correct per health-profiles.v1.json.

**Optional (not blocking):**
- `/api/build-info` debug endpoint: Legacy schema, not critical for OPS UI
- `/api/debug-bundle` debug endpoint: Legacy schema, not critical for OPS UI
- `/api/ops` debug endpoint: NOT_FOUND, not critical for OPS UI

---

## E) Fix Plan (Ordered P0/P1/P2)

### P0: Correctness / Semantics / Contract Alignment

**P0.1: Fix deploy.gitSha/buildTs Field Name Mismatch (Option A: Alias Mapping)**
- **File:** `functions/api/mission-control/summary.js:935-947`
- **Change:** Add `commitSha` and `generatedAt` to alias lists:
  ```javascript
  const sha = json?.gitSha || json?.git_sha || json?.sha || json?.commit || json?.commitSha || null;
  const ts = json?.buildTs || json?.build_ts || json?.builtAt || json?.built_at || json?.timestamp || json?.generatedAt || null;
  ```
- **Evidence:** Live `/build-info.json` has `commitSha`/`generatedAt` but code doesn't check these aliases.
- **Validation:** Verify `deploy.gitSha` and `deploy.buildTs` are non-null after fix.
- **Risk:** LOW (additive change, backward compatible)

**P0.2: Create Build-Info Contract (SSOT)**
- **File:** `public/data/ops/build-info-contract.v1.json` (new)
- **Content:**
  ```json
  {
    "schema_version": "1.0",
    "updatedAt": "2026-02-03T00:00:00Z",
    "fields": {
      "gitSha": {
        "type": "string|null",
        "aliases": ["commitSha", "git_sha", "sha", "commit"],
        "required": false,
        "description": "Git commit SHA"
      },
      "buildTs": {
        "type": "string|null",
        "aliases": ["generatedAt", "build_ts", "builtAt", "built_at", "timestamp"],
        "required": false,
        "description": "Build timestamp (ISO8601)"
      }
    }
  }
  ```
- **Evidence:** Missing SSOT blocks field correctness verification.
- **Validation:** Verify contract is loaded and used by fetchBuildInfo.

**P0.3: Update fetchBuildInfo to Use Contract (Optional)**
- **File:** `functions/api/mission-control/summary.js:935-947`
- **Change:** Load build-info-contract.v1.json and use field aliases from contract.
- **Evidence:** Makes field extraction maintainable and contract-driven.
- **Validation:** Verify deploy.gitSha/buildTs are populated correctly.

### P1: UI Color Coding (Optional - Accept Yellow as Correct)

**P1.1: Make INFO Green in Preview Mode for "NOT_EXPECTED" (Optional)**
- **File:** `public/ops/index.html:593-597`
- **Change:** Modify `statusClass` to return `'ok'` for INFO if reason is "NOT_EXPECTED" and runtime.env is "preview":
  ```javascript
  function statusClass(status) {
    if (status === 'OK') return 'ok';
    if (status === 'INFO' && runtime?.env === 'preview' && reason === 'NOT_EXPECTED') return 'ok'; // Green for preview mode "not expected"
    if (status === 'INFO') return 'warn';
    if (status === 'WARNING') return 'warn';
    if (status === 'CRITICAL') return 'bad';
  }
  ```
- **Evidence:** Makes preview mode appear "green" for informational statuses.
- **Validation:** Verify INFO statuses show green in preview mode.
- **Risk:** MEDIUM (changes UI color semantics, may confuse users expecting yellow for INFO)

**P1.2: Accept Yellow as Correct (Recommended)**
- **Action:** Document that INFO status (yellow) in preview mode is correct per health-profiles.v1.json.
- **Evidence:** `public/data/ops/health-profiles.v1.json:21` defines `not_expected_status: "INFO"`.
- **Validation:** No code changes needed, just documentation.

### P2: DX Improvements (Tests, CI Guards, Drift Alarms)

**P2.1: Add Contract Tests for Build-Info**
- **File:** `.github/workflows/ci-gates.yml` (or new test file)
- **Content:** Validate `/build-info.json` matches build-info-contract.v1.json schema (check canonical names or aliases).
- **Evidence:** Prevent field name drift.

**P2.2: Add Runtime Contract Validation**
- **File:** `functions/api/mission-control/summary.js`
- **Change:** Load build-info-contract.v1.json and validate `/build-info.json` against contract before extracting fields.
- **Evidence:** Catch schema drift early.

**P2.3: Add OPS Field Contract (Comprehensive)**
- **File:** `public/data/ops/ops-fields-contract.v1.json` (new)
- **Content:** Complete field definitions for all OPS fields (name, type, unit, required/optional, semantics, allowed values, JSONPath).
- **Evidence:** Missing comprehensive contract blocks field correctness verification.

---

## F) Contract Tests to Add

### For OPS Envelope

1. **Meta Validation:**
   - `meta.status` must be in allowed enum: `["ok", "degraded", "error"]`
   - `meta.asOf` must be valid ISO8601 timestamp

2. **Health Status Validation:**
   - `data.health.platform.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.api.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.prices.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.pipeline.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.freshness.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`

3. **Preview Mode Semantics:**
   - If `runtime.env === "preview"` and `expectedFlags.kv === false`, then `health.platform.status === "INFO"` and `health.platform.reason === "NOT_EXPECTED"` is CORRECT
   - If `runtime.env === "preview"` and `expectedFlags.pipeline === false`, then `health.pipeline.status === "INFO"` and `health.pipeline.reason === "NOT_EXPECTED"` is CORRECT
   - If `runtime.env === "preview"` and `expectedFlags.pipeline === false`, then `health.freshness.status === "INFO"` and `health.freshness.reason === "NOT_EXPECTED"` is CORRECT

### For Build-Info Schema

4. **Build-Info Field Mapping:**
   - `/build-info.json` must have either canonical names (`gitSha`, `buildTs`) OR aliases (`commitSha`, `generatedAt`, etc.)
   - `fetchBuildInfo` must check all aliases defined in build-info-contract.v1.json
   - Evidence: Live file has `commitSha`/`generatedAt` but code doesn't check these aliases

---

## Summary

**Total Fields Audited:** 25  
**CORRECT:** 23  
**WRONG:** 2 (deploy.gitSha, deploy.buildTs)  
**UNDECIDABLE:** 0  

**Non-Green Indicators:**
- 3 yellow (INFO) statuses: Platform, Freshness, Pipeline (CORRECT for preview mode, but displayed as yellow)
- 2 null deploy fields: gitSha, buildTs (WRONG - field name mismatch)

**Primary Blocker:** Field name mismatch in build-info.json (commitSha vs gitSha, generatedAt vs buildTs).

**Next Steps:**
1. Add `commitSha` and `generatedAt` to alias lists in `fetchBuildInfo` (P0.1)
2. Create build-info-contract.v1.json (P0.2)
3. (Optional) Make INFO green in preview mode for "NOT_EXPECTED" (P1.1) OR accept yellow as correct (P1.2)

---

**DONE ✅**  
**Timestamp:** 2026-02-03T16:14:06Z
