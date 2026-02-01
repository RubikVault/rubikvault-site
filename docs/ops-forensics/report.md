# OPS Truth Forensics Report (RubikVault)

Date: 2026-02-01

## 1) What is 100% proven true (with proof outputs)

### Repo identity
- `pwd`: `/Users/michaelpuchowezki/Dev/rubikvault-site`
- `git rev-parse HEAD`: `9ef89cb48ec555cd3b675f7ed3d4e801049638f9`
- `git branch`: `main`

### /ops UI reads only mission-control summary
**Proof:** `public/ops/index.html:864-871`
```
864-871  const summaryUrl = `/api/mission-control/summary${debugEnabled ? '?debug=1' : ''}${debugEnabled ? '&' : '?'}t=${t}`;
```
The `/ops` page fetches the summary endpoint and does not read other endpoints directly.

### /ops pipeline table uses summary.data.pipeline.counts
**Proof:** `public/ops/index.html:624-647`
```
624-629  const counts = data?.pipeline?.counts || {};
624-647  document.getElementById('pipeline-marketphase').innerHTML =
          stageRow('Fetched', fetched, expected, health?.pipeline?.status) + ...
```
So the displayed MarketPhase counts must be traceable to summary payload fields.

### /api/mission-control/summary reads static artifacts
**Proof:** `functions/api/mission-control/summary.js:577-587` and `706-712`
```
577-587  fetchAssetJson(... '/data/ops-daily.json' ... '/data/ops/health-profiles.v1.json' ... '/data/eod/manifest.latest.json')
706-712  fetchAssetJson(... '/data/pipeline/nasdaq100.fetched.json' ... 'nasdaq100.latest.json' ... 'nasdaq100.pipeline-truth.json')
```
Summary reads from static `/data/...` artifacts to compute pipeline counts.

### Pipeline artifacts on disk show conflicting counts
**Proof:** local artifact outputs
```
$ jq -r '.counts.expected, .counts.fetched, .counts.validated, .counts.computed, .counts.static_ready' public/data/pipeline/nasdaq100.latest.json
100
100
100
2
2

$ jq -r '.expected, .count, (.missing|length)' public/data/pipeline/nasdaq100.fetched.json
100
0
100

$ jq -r '.expected, .count, (.missing|length)' public/data/pipeline/nasdaq100.validated.json
100
0
100
```
Latest shows 100/100 fetched+validated, but stage files show count=0 and missing length=100.

### ops-daily baseline pipeline fetched/validated are null
**Proof:** `public/data/ops-daily.json`
```
$ jq -r '.baseline.pipeline.expected, .baseline.pipeline.fetched, .baseline.pipeline.validatedStored' public/data/ops-daily.json
100
null
null
```
So ops-daily (baseline) does not carry fetched/validated counts.

### build-ndx100-pipeline-truth writes stage files BEFORE trusting latest counts
**Proof:** `scripts/pipeline/build-ndx100-pipeline-truth.mjs:231-240, 253-257`
```
231-234  write nasdaq100.fetched/validated/computed/static-ready stage files
237-240  reads nasdaq100.latest.json and TRUSTS its counts
253-257  updates in-memory payload counts, but does NOT rewrite stage files
```
This proves stage files can remain stale/partial even when latest counts are accurate.

### build-ops-daily prefers stage files and nulls counts when stage is empty
**Proof:** `scripts/ops/build-ops-daily.mjs:86-93, 360-371`
```
86-92 normalizeStageCount returns null when count=0 and missing length >= expected
360-371 ops-daily baseline fetched/validated use stage truth first, then latest only if stage missing
```
This explains why ops-daily baseline fetched/validated are null even when latest counts exist.

---

## 2) Issues list (symptom → root cause → proof → fix options)

### Issue A — Stage artifacts contradict latest counts
**Observed:** `/data/pipeline/nasdaq100.fetched.json` and `validated.json` show count=0/missing=100 while `/data/pipeline/nasdaq100.latest.json` shows fetched=100/validated=100.

**Expected (policy in code):** `nasdaq100.latest.json` is treated as canonical counts (see “TRUST nasdaq100.latest.json” comment), so stage artifacts should not contradict canonical counts unless explicitly marked diagnostic.
**Proof:** `scripts/pipeline/build-ndx100-pipeline-truth.mjs:239-242`.

**Root cause (proved):** `scripts/pipeline/build-ndx100-pipeline-truth.mjs` writes stage files before loading and trusting `nasdaq100.latest.json`, and never re-writes the stage files after trusting latest counts.

**Proof:** `scripts/pipeline/build-ndx100-pipeline-truth.mjs:231-234` (writes stage files), `237-257` (reads latest and overwrites counts in-memory only).

**Fix options (A/B/C):**
- **A (minimal):** Re-write stage files after `finalCounts` is resolved from latest counts. 
  - **Pros:** stage files align with latest; summary and ops-daily become consistent.
  - **Cons:** stage missing lists may still be stale (requires careful recomputation or explicit note).
- **B:** Change latest derivation: compute latest counts strictly from stage files. 
  - **Pros:** single truth source; stage files become canonical.
  - **Cons:** if stage files are partial (market-prices snapshot limited), latest becomes incorrect.
- **C:** Add `counts_source` and `count_override` metadata in stage files and have summary/ops treat stage counts as diagnostic only.
  - **Pros:** keeps current stage meaning; no data loss.
  - **Cons:** requires UI/summary logic updates and CI expectations changes.

**Chosen fix (recommended):** Option A, plus explicit metadata to signal missing list source, in a later commit if needed.

---

### Issue B — ops-daily baseline fetched/validated are null despite latest counts
**Observed:** `public/data/ops-daily.json` has `fetched=null` and `validatedStored=null` but `nasdaq100.latest.json` has `fetched=validated=100`.

**Expected (policy in tests):** `scripts/ops/rv_verify_truth_summary.mjs` enforces summary counts equal latest counts whenever latest exists.
**Proof:** `scripts/ops/rv_verify_truth_summary.mjs:18-33`.

**Root cause (proved):** `normalizeStageCount()` converts stage count 0 + missing>=expected to `null`, and ops-daily uses stage truth before latest. Since stage files have `count=0`, `fetched` and `validatedStored` become `null`.

**Proof:** `scripts/ops/build-ops-daily.mjs:86-93` and `360-371`.

**Fix options (A/B/C):**
- **A (minimal):** If stage count resolves to `null`, fall back to `pipelineLatest` counts. 
  - **Pros:** keeps baseline truthful; no change to stage generation required.
  - **Cons:** still hides diagnostic stage artifact issues unless surfaced elsewhere.
- **B:** Fix stage artifacts first (Issue A), so `normalizeStageCount` no longer returns null.
  - **Pros:** cleaner data lineage.
  - **Cons:** depends on Issue A fix; may still require fallback when artifacts missing.
- **C:** Change `normalizeStageCount` to return 0 instead of null. 
  - **Pros:** simpler counts; no fallback.
  - **Cons:** turns “unknown” into “0”, which is less truthful (violates Truth > Green).

**Chosen fix (recommended):** Option A + Issue A.

---

### Issue C — provenance/build identity under `/data/`
**Symptom:** Build provenance should be available in `/data/` for static-first debugging.

**Proof (current state):** `public/data/build-info.json` exists and is populated.
```
$ cat public/data/build-info.json
{
  "git_sha": "9ef89cb48ec555cd3b675f7ed3d4e801049638f9",
  "build_time_utc": "2026-02-01T10:56:09.827Z",
  "env": {
    "node": "v25.2.1",
    "ci": false,
    "github_actions": false,
    "cf_pages": false,
    "branch": "main"
  }
}
```

**Fix options (A/B/C):**
- **A:** Add a build step to write `public/data/build-info.json` with git SHA + build time (recommended).
- **B:** Reference `public/build-info.json` from summary (not in `/data/`).
- **C:** Embed build info inside summary only (no artifact).

**Chosen fix (recommended):** Option A. **Status:** implemented in this runblock.

---

## 3) Workflow map (writers/readers) + dedup plan

**TRUTH-CRITICAL writers (proven):**
- `.github/workflows/ops-daily.yml` → writes `public/data/pipeline/*.json`, `public/data/ops/summary.latest.json`, `public/data/ops-daily.json`.
- `.github/workflows/eod-latest.yml` → writes `public/data/eod/*`, and re-runs ops summary/daily.

**Readers:**
- `/api/mission-control/summary` → reads `/data/ops-daily.json`, `/data/pipeline/*.json`, `/data/eod/manifest.latest.json`.
- `/ops` UI → reads summary only.

**Dedup plan:** Ensure `ops-daily` is the single writer of pipeline truth artifacts and ops-daily summary, and that other workflows (eod-latest) do not overwrite pipeline stage artifacts unless pipeline generator is executed in the same run.

---

## 4) Remaining unknowns + exact commands to resolve

**Unknown:** Which workflow generates `public/data/pipeline/nasdaq100.latest.json` (writer not found in repo scripts).

**Command to resolve (needs GitHub Actions logs):**
```
# Using gh CLI
gh run list --workflow "Ops Daily Snapshot" --limit 5
# Then inspect the latest run logs:
gh run view <RUN_ID> --log | rg "nasdaq100.latest.json|pipeline" -n
```
If CI logs show a step writing `nasdaq100.latest.json`, capture the step and map it in the workflow map.

---

## 5) PR/commit plan (minimal, ordered)

1. **Add build provenance artifact**
   - `scripts/ops/build-build-info.mjs`
   - update `package.json` build/prepare to emit `public/data/build-info.json`

2. **Add truth validation gate (non-blocking)**
   - `scripts/ops/validate-truth.sh` + CI job `truth-gates` (continue-on-error)

3. **Fix Issue A (stage artifacts align with latest)**
   - re-write stage files after trusted latest counts OR mark metadata for overrides.

4. **Fix Issue B (ops-daily fallback to latest when stage null)**
   - prefer latest counts when stage count is null.

5. **Make CI gate blocking**
   - remove `continue-on-error` once Issue A/B fixes are merged and stable.
