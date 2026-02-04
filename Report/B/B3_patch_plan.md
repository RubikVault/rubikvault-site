# B3 Patch Plan — v2.1 Lawbook Compliance

## Summary

**Current State**: v2.1 target state is ACHIEVED for P0 requirements.
- `data.system` canonical root: ✅ Implemented (commit 674bdfe)
- Aliases bit-identical: ✅ Verified
- TDZ bugs fixed: ✅ (commits 7b21b74, 674bdfe)
- SSOT consistency: ✅ Ops UI reads only from `/api/mission-control/summary`

**No P0 patches required.**

---

## P1 Recommendations (Optional)

### 1. Add Schema Validation to CI

**File**: `.github/workflows/ci.yml` (or equivalent)

```yaml
# Add after build step
- name: Validate Summary Contract
  run: |
    npm install -g ajv-cli
    ajv validate -s schemas/api/mission-control.summary.schema.json \
      -d <(curl -sS "$PREVIEW_URL/api/mission-control/summary") \
      --strict=false
```

### 2. Create Schema File

**File**: `schemas/api/mission-control.summary.schema.json`

See B2_contracts_and_schemas.md for full schema definition.

---

## v2.1 Doc Clarification (If Needed)

If v2.1 doc claims `public/data/status.json` is the canonical Ops SSOT, add this clarification:

```diff
- Single Status Truth = public/data/status.json

+ Canonical Ops SSOT (Runtime):
+   /api/mission-control/summary
+   - This is the single truth source for Ops UI.
+   - UI MUST NOT recompute system verdict.
+
+ Build Artifact (Input):
+   public/data/status.json
+   - Pipeline build status aggregation.
+   - Read by summary.js as input, NOT consumed directly by UI.
```

---

## Verification Commands

```bash
# Confirm data.system exists
curl -sS 'http://127.0.0.1:8788/api/mission-control/summary' \
  | jq '.data.system.status, .data.health.system.status, .data.cards.system.status'

# Expected output (all identical):
# "STALE"
# "STALE"
# "STALE"
```

---

## Conclusion

| Requirement | Status |
|-------------|--------|
| data.system canonical root | ✅ DONE |
| Aliases bit-identical | ✅ DONE |
| No TDZ bugs | ✅ DONE |
| UI reads from one SSOT | ✅ DONE |
| Schema validation in CI | ⏳ P1 (recommended) |
| status.json role documented | ⏳ P2 (recommended) |

**TARGET STATE: ACHIEVED**
