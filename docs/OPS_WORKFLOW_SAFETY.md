# Ops Workflow Safety Rules

## No-Drama Git Workflow for Artifact Generation

### Problem
Artifact generation scripts (eod-latest, ops-daily, pipeline truth) can cause commit/push failures due to:
- Merge conflicts in `public/data/*latest*` files
- Empty or failed artifact generation being committed
- Local branch out of sync with remote

### Rules

#### 1. Always Sync Before Generating Artifacts
```bash
# Before running any artifact generation locally:
git fetch origin
git reset --hard origin/main
```

**Never** resolve conflicts by hand inside `public/data/*latest*` files. Always hard-sync then re-run the CI producer if needed.

#### 2. Never Commit Empty Artifacts
Artifact generation scripts **must** exit with code 1 if:
- `expected > 0` AND `fetched = 0`
- `RATE_LIMIT` errors present AND `validated = 0`
- Any write operation fails

This is enforced in:
- `scripts/eod/build-eod-latest.mjs`
- `scripts/ops/verify-ops-pipeline.mjs`

#### 3. CI Workflow Ordering
The ops-daily workflow runs in strict order:
1. Build pipeline truth (NASDAQ-100)
2. Build mission-control summary
3. Build ops-daily snapshot
4. Commit all artifacts atomically

If any step fails, the workflow stops and does not commit.

#### 4. Verification Before Deployment
Always run verification locally before pushing:
```bash
# Generate artifacts
node scripts/pipeline/build-ndx100-pipeline-truth.mjs
node scripts/ops/build-mission-control-summary.mjs
node scripts/ops/build-ops-daily.mjs

# Verify
node scripts/ops/verify-ops-pipeline.mjs

# Only commit if verification passes
git add public/data/pipeline/*.json public/data/ops/summary.latest.json public/data/ops-daily.json
git commit -m "chore(ops): update artifacts"
git push origin main
```

#### 5. Handling Merge Conflicts
If you encounter merge conflicts in artifact files:
1. **DO NOT** manually resolve conflicts
2. Discard local changes: `git reset --hard origin/main`
3. Re-run artifact generation scripts
4. Commit and push

#### 6. Production Deployment Checks
Before deploying to production:
- Verify all pipeline truth artifacts exist and are valid
- Verify ops-daily.json contains non-null pipeline counts
- Run `VERIFY_BASE_URL=https://rubikvault.com node scripts/ops/verify-ops-pipeline.mjs`

## Fallback Detection Logic

### Summary Artifact Fallback
Both the Ops UI and verification scripts implement graceful fallback:

1. **Primary:** Try `/data/ops/summary.latest.json` (static artifact)
2. **Fallback:** If 404, use `/api/mission-control/summary` (live API)
3. **Report:** Always display which source was used

This ensures the system works whether the static summary artifact exists or not.

### Cache-Busting
All fetches use:
- `Cache-Control: no-cache` header
- `Pragma: no-cache` header
- Query parameter `?t=<timestamp>` for cache busting

## Exit Codes

### Success (0)
- All artifacts generated successfully
- `fetched > 0` when `expected > 0`
- No write failures

### Failure (1)
- Empty artifact generation (`fetched = 0` with `expected > 0`)
- Rate limit errors with no validated data
- Write operation failures
- Verification failures

## Monitoring

### Verification Output
```
OK: ops pipeline truth + wiring verification (summary source=static_summary)
```
or
```
OK: ops pipeline truth + wiring verification (summary source=mission_control_api)
```

### Ops UI Source Badge
The Ops page displays: `Source: static` or `Source: live API`

This indicates which data source is being used in real-time.
