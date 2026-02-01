# OPS Truth Fix Plan (ordered, minimal)

## Commit Plan (ordered)
1) **chore(ops): add build-info artifact to /data**
   - Add `scripts/ops/build-build-info.mjs`
   - Wire into `prepare:data`
   - Commit updated `public/data/build-info.json`

2) **ci(ops): add truth validation gate (non-blocking)**
   - Add `scripts/ops/validate-truth.sh`
   - Add CI job `truth-gates` with `continue-on-error: true`
   - Document future change to make blocking

2.5) **fix(health): emit schema_version envelope for health/latest**
   - Update `scripts/refresh-health-assets.mjs` to write snapshot-envelope v3
   - Add contract-smoke assertion for `public/data/snapshots/health/latest.json`

3) **fix(pipeline): keep stage artifacts consistent with latest**
   - Re-write stage files after latest counts resolved **OR**
   - Embed `counts_source` metadata and mark stage counts as diagnostic only

4) **fix(ops): ops-daily baseline fallback to latest when stage count null**
   - If `normalizeStageCount` returns null, use `pipelineLatest` counts
   - Leave reason/missing list intact
   - **Status:** implemented (build-ops-daily now prefers latest counts when present)

5) **ci(ops): promote truth validation to blocking**
   - Remove `continue-on-error` after 2–3 green runs

6) **feat(ops): summary debug sources (optional, gated by ?debug=1)**
   - Add `_debug.sources` (path + size + hash) and `_debug.env` (env flags)
   - Do NOT include secrets

7) **policy: disable KV writes in functions**
   - Remove KV write paths from cache-law/circuit/fundamentals
   - Keep read-only KV usage only

---

## Issue-specific fix options

### Issue A: Stage artifacts contradict latest
- **Option A (preferred):** Re-write stage files after trusted latest counts
- **Option B:** Make latest counts derived only from stage files
- **Option C:** Add explicit metadata + adjust summary/ops to treat stage counts as diagnostic

### Issue B: ops-daily baseline null fetched/validated
- **Option A (preferred):** fallback to latest when stage count is null
- **Option B:** fix stage files first, then ops-daily uses stage data
- **Option C:** keep nulls and treat as NOT_AVAILABLE (requires UI changes)
