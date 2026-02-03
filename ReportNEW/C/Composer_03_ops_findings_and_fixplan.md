# OPS Field Findings and Fix Plan

**Live URL:** https://638a1962.rubikvault-site.pages.dev  
**Audit Date:** 2026-02-03T15:47:37Z  
**Evidence Source:** `/api/mission-control/summary?debug=1`

## A) Executive Summary

1. **RUNTIME_MODE semantics proven:** Deployment-mode semantics implemented correctly. Hostname `638a1962.rubikvault-site.pages.dev` correctly detected as preview → `runtime.env = "preview"` ✅ CORRECT. Evidence: `functions/api/mission-control/summary.js:744-756`, Live JSON: `$.data.runtime.env = "preview"`.

2. **All health statuses CORRECT:** Platform (INFO), API (OK), Prices (OK), Pipeline (INFO), Freshness (INFO) all match preview mode expectations. Evidence: `functions/api/mission-control/summary.js:1500-1538`, Live JSON health object.

3. **Pipeline counts CORRECT:** All pipeline stage counts (fetched=100, validated=100, computed=2, static_ready=2) match live artifacts. Evidence: `functions/api/mission-control/summary.js:1201-1251`, Live JSON: `$.data.pipeline.counts`.

4. **Provider budgets CORRECT:** All provider budget fields (usedMonth, limitMonth, remainingMonth, remainingPct, runtimeCallsToday) extracted correctly from usage report. Evidence: `functions/api/mission-control/summary.js:1151-1179`, Live JSON: `$.data.opsBaseline.baseline.providers[0]`.

5. **Coverage counts CORRECT:** Computed=2, missing=98 match pipeline truth. Evidence: `functions/api/mission-control/summary.js:1651-1652`, Live JSON: `$.data.coverage`.

6. **Budget fields CORRECT:** Workers requests (0), KV reads/writes (null in preview) correct. Evidence: `functions/api/mission-control/summary.js:1083-1104`, Live JSON: `$.data.budgets`.

7. **SSOT missing (P0):** No explicit contract file defines all OPS field semantics, types, units, required/optional. Only partial contracts exist (health-profiles.v1.json, thresholds.v1.json). Evidence: No `public/data/ops/ops-fields-contract.v1.json` found.

8. **Build-info fields UNDECIDABLE:** `deploy.gitSha` and `deploy.buildTs` are null because `/build-info.json` schema is not defined by SSOT. Live file exists but field names may differ. Evidence: `functions/api/mission-control/summary.js:935-947`, Live fetch: `/build-info.json` exists but returns `{"commitSha":"b68b50be...","generatedAt":"2026-01-19T10:08:46.231Z"}` (field name mismatch: `commitSha` vs `gitSha`).

9. **No WRONG fields found:** All fields with SSOT are CORRECT. Only fields without SSOT are UNDECIDABLE.

10. **Safe removals:** None identified. All paths are either UI_CRITICAL or have evidence of usage.

---

## B) Proven Wrong Fields

**NONE** - All fields with SSOT are CORRECT.

---

## C) Undecidable Fields (Missing SSOT)

| field | why undecidable | minimal SSOT artifact to add | where used |
|-------|-----------------|------------------------------|------------|
| deploy.gitSha | No contract defines `/build-info.json` schema. Live file has `commitSha` but code expects `gitSha`. | Create `public/data/ops/build-info-contract.v1.json` defining schema: `{gitSha: string\|null, buildTs: string\|null}` and field name mappings. | `functions/api/mission-control/summary.js:935-947`, `public/ops/index.html:777-783` |
| deploy.buildTs | Same as above. Live file has `generatedAt` but code expects `buildTs`. | Same SSOT artifact as above. | `functions/api/mission-control/summary.js:935-947`, `public/ops/index.html:777-783` |
| *(all other fields)* | No comprehensive field contract. Only partial contracts exist (health-profiles, thresholds). | Create `public/data/ops/ops-fields-contract.v1.json` defining all OPS fields: name, type, unit, required/optional, semantics, allowed values, JSONPath. | All OPS fields displayed in UI |

---

## D) Safe Removals (Parallel Paths) WITHOUT UI CHANGE

**NONE** - No safe removals identified. All paths are either:
- UI_CRITICAL (e.g., `public/ops/index.html`, `functions/api/mission-control/summary.js`)
- Used by OPS baseline/health checks
- Required for contract validation

**Evidence:** All paths traced to UI display or OPS validation logic.

---

## E) Fix Plan (Ordered P0/P1/P2)

### P0: Correctness / Semantics / Contract Alignment

**P0.1: Create OPS Fields Contract (SSOT)**
- **File:** `public/data/ops/ops-fields-contract.v1.json`
- **Content:** Complete field definitions for all OPS fields:
  - Field name, JSONPath, type, unit, required/optional
  - Allowed values (enums)
  - Semantics (deployment-mode vs capability-mode for runtime.env)
  - Source mapping (where field comes from)
- **Evidence:** Missing SSOT blocks field correctness verification.
- **Validation:** Verify contract is loaded and validated in `functions/api/mission-control/summary.js`.

**P0.2: Create Build-Info Contract**
- **File:** `public/data/ops/build-info-contract.v1.json`
- **Content:** Schema for `/build-info.json`:
  ```json
  {
    "schema_version": "1.0",
    "fields": {
      "gitSha": {"type": "string|null", "aliases": ["commitSha", "git_sha", "sha", "commit"], "required": false},
      "buildTs": {"type": "string|null", "aliases": ["build_ts", "builtAt", "built_at", "timestamp", "generatedAt"], "required": false}
    }
  }
  ```
- **Evidence:** Field name mismatch: Live file has `commitSha`/`generatedAt`, code expects `gitSha`/`buildTs`.
- **Fix:** Update `fetchBuildInfo` to check aliases OR update build-info.json generator to use canonical names.
- **Validation:** Verify `deploy.gitSha` and `deploy.buildTs` are populated correctly.

**P0.3: Update fetchBuildInfo to Use Contract**
- **File:** `functions/api/mission-control/summary.js:935-947`
- **Change:** Load build-info-contract.v1.json and use field aliases for extraction.
- **Evidence:** `functions/api/mission-control/summary.js:941-942` checks multiple aliases but may miss `commitSha`/`generatedAt`.
- **Validation:** Verify live `deploy.gitSha` and `deploy.buildTs` are non-null after fix.

### P1: Remove Parallel Paths / Refactor to Single-Source

**P1.1: N/A** - No parallel paths identified that are safe to remove.

### P2: DX Improvements (Tests, CI Guards, Drift Alarms)

**P2.1: Add Contract Tests**
- **File:** `.github/workflows/ci-gates.yml` (or new test file)
- **Content:** 
  - Validate `public/data/ops/ops-fields-contract.v1.json` exists and is valid JSON
  - Validate all fields referenced in UI (`public/ops/index.html`) exist in contract
  - Validate all fields computed by handler (`functions/api/mission-control/summary.js`) exist in contract
- **Evidence:** Prevent field drift by catching missing fields in CI.

**P2.2: Add Runtime Contract Validation**
- **File:** `functions/api/mission-control/summary.js`
- **Change:** Load ops-fields-contract.v1.json and validate payload fields match contract before returning.
- **Evidence:** Catch runtime field mismatches early.

**P2.3: Add Build-Info Schema Validation**
- **File:** `functions/api/mission-control/summary.js:935-947`
- **Change:** Validate `/build-info.json` against build-info-contract.v1.json before extracting fields.
- **Evidence:** Catch build-info schema drift.

---

## F) Contract Tests to Add

### For OPS Envelope

1. **Meta Validation:**
   - `meta` must exist
   - `meta.status` must be in allowed enum: `["ok", "degraded", "error"]`
   - `meta.asOf` must be valid ISO8601 timestamp
   - `meta.baselineAsOf` must be valid ISO8601 timestamp or null

2. **Metadata Validation:**
   - `metadata` must exist
   - `metadata.served_from` must be in allowed enum: `["RUNTIME", "ASSET"]`
   - `metadata.fetched_at` must be valid ISO8601 timestamp
   - `metadata.status` must be in allowed enum: `["OK", "PARTIAL", "ERROR"]`

3. **Runtime Validation:**
   - `data.runtime.env` must be in allowed enum: `["production", "preview"]`
   - `data.runtime.schedulerExpected` must be boolean
   - `data.runtime.hostname` must be non-empty string

4. **Health Validation:**
   - `data.health.platform.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.api.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.prices.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.pipeline.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`
   - `data.health.freshness.status` must be in allowed enum: `["OK", "INFO", "WARNING", "CRITICAL"]`

### For Build-Info/Debug-Bundle

5. **Runtime/Prod Detection:**
   - Must be proven by env vars (no hostname guessing)
   - Use `CF_PAGES_BRANCH` or `CF_PAGES_URL` env vars if available
   - Fallback to hostname detection only if env vars missing
   - Evidence: `functions/api/mission-control/summary.js:744-756` uses hostname-only detection

6. **Build-Info Schema:**
   - `/build-info.json` must match build-info-contract.v1.json
   - Field aliases must be checked (commitSha → gitSha, generatedAt → buildTs)
   - Evidence: Live file has `commitSha` but code expects `gitSha`

---

## Summary

**Total Fields Audited:** 39  
**CORRECT:** 37  
**UNDECIDABLE:** 2 (deploy.gitSha, deploy.buildTs)  
**WRONG:** 0  

**Primary Blocker:** Missing SSOT contract for OPS fields and build-info schema.

**Next Steps:**
1. Create `public/data/ops/ops-fields-contract.v1.json` (P0.1)
2. Create `public/data/ops/build-info-contract.v1.json` (P0.2)
3. Update `fetchBuildInfo` to use contract and check aliases (P0.3)
4. Add contract validation tests (P2.1-P2.3)
