# 08_NEXT_RUNBOOK_READY_SPEC

## Purpose
Deterministic execution spec for the next implementation agent. This spec assumes analysis files `00`..`07` are authoritative inputs.

## Inputs
- `Report/A/00_REPO_REALITY.md`
- `Report/A/01_EODHD_TIER_COMPATIBILITY.md`
- `Report/A/02_REUSE_GAP_MATRIX.md`
- `Report/A/03_TARGET_ARCHITECTURE.md`
- `Report/A/04_IMPLEMENTATION_BLUEPRINT.md`
- `Report/A/05_WORKFLOW_PLAN.md`
- `Report/A/06_UI_INTEGRATION_PLAN.md`
- `Report/A/07_VALIDATION_PROOFS.md`

## Non-negotiable gates
1. Do not change current UI fetch paths until parity window passes.
2. No EODHD locked endpoints in active producers.
3. No empty publish over existing last_good.
4. Single-writer ownership per critical artifact path.

## Execution Order (Strict)

## Step 1 — Enforce Tier Safety First
1. Remove/replace EODHD fundamentals usage from active universe producer.
   - Current violation: `scripts/universe/fetch-constituents.mjs:50`.
2. Add CI scan for forbidden EODHD endpoint families.
3. Verify with `rg` scan and CI gate.

Stop if fails.

## Step 2 — Close Producer Ownership Gap
1. Assign one active workflow to own `public/data/snapshots/market-prices/latest.json`.
2. Remove ambiguity by either:
   - wiring canonical producer workflow, or
   - migrating consumers to DP1/v2 compatibility adapter.
3. Document ownership in workflow summary.

Stop if no single owner proven.

## Step 3 — Add P0 Safety Artifacts
1. Implement global pointer: `public/data/_meta/latest.json`.
2. Implement quality report: `public/data/quality/latest.json`.
3. Add UI-provider-URL drift CI check.
4. Ensure publish logic preserves last_good on failure.

Run checks from `07_VALIDATION_PROOFS.md` sections A-D.

## Step 4 — Build v2 Shadow Outputs (No UI switch)
1. Extend eod pipeline to write v2 shadow outputs.
2. Add corporate-actions producer.
3. Add exchanges reference sync.
4. Add pulse composer.

All outputs must include mandatory `meta` lineage fields.

## Step 5 — Workflow Reliability Hardening
1. Fix shared concurrency for overlapping writers (`eod-latest` + `ops-daily`).
2. Keep current monitor/ci gates; extend with new contracts.
3. Add retention workflow in dry-run mode first.

## Step 6 — Additive UI Integration
1. Add global health/fallback banner component.
2. Keep existing feature render logic intact.
3. Read active-version pointer in resolver layer only.

## Step 7 — 30-day Parallel Validation
1. Run v1 and v2 in parallel daily.
2. Store diff/parity report (counts, asOf, schema, status).
3. Do not flip active version until stable threshold achieved.

## Step 8 — Controlled Cutover
1. Flip `currentVersion` pointer from v1 to v2.
2. Keep rollback path (`lastGoodVersion`) available.
3. Monitor with existing `monitor-prod` and CI artifact gates.

## Required Verification Commands (minimum)
```bash
npm ci
npm run test:contracts
node scripts/ci/verify-artifacts.mjs
node scripts/eod/check-eod-artifacts.mjs
rg -n "https?://(api\.)?(eodhd|eodhistoricaldata|tiingo|stooq|polygon|alphavantage|finnhub|twelvedata|fred)" public src
```

## Stop/Fail Conditions
- Forbidden EODHD endpoint usage remains in active producers.
- Critical artifact producer ownership still ambiguous.
- Any UI regression in 4 feature pages.
- Any publish path writes empty artifact over last_good.

## Done Criteria
1. Tier-safe endpoint usage proven by scans and CI.
2. Single-writer ownership documented for critical outputs.
3. P0 safety artifacts present and validated.
4. v2 shadow products generated and quality-gated.
5. UI unchanged in behavior during shadow phase.
6. Cutover only after parity window success.
