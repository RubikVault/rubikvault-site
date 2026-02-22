# V2 Phase 1 Checklist (Local, Safe Start)

## Goal
Start Runbook v2.0 Phase 1 with minimal blast radius:
- first real `clean-bars` consumer hook
- first real dropout-logger hook (report-only)

## Preconditions
- Phase 0 report-only refresh succeeds
- Revalidation snapshot exists
- Baseline snapshot exists
- No active API/backfill run is currently writing the same artifacts

## Step 1: Revalidate Baseline
- Run: `node scripts/universe-v7/start-phase0-report-only.mjs`
- Confirm in `mirrors/system/run_status/latest.json`:
  - pointer_pack_integrity = ok
  - history_completeness_truly_missing = ok
  - synthetic_in_prod_snapshot = ok

## Step 2: Pick First Consumer (Small Scope)
Prefer one of:
- `scripts/forecast/snapshot_ingest.mjs` (ingest normalization path)
- a feature-flagged sample path in marketphase builder
Avoid first: full hot path integration with heavy rebuild cost.

## Step 3: Add `clean-bars` Hook (Report-first)
- Keep old path available behind fallback/flag
- Emit comparison stats (old vs clean-bars) to a local report
- Do not enforce or change gate thresholds yet

## Step 4: Add Dropout Logger Hook (Report-only)
- Log reason-coded drops to `mirrors/universe-v7/ledgers/dropout_ledger.ndjson`
- Regenerate summary via `scripts/generate-dropout-report.mjs`
- Verify summary is small and deterministic in `public/data/universe/v7/reports/dropout_summary.json`

## Step 5: Rebuild + Compare
- Rebuild affected artifact(s)
- Compare counts with previous baseline
- If large drift: stop and inspect reasons before any further integration

## Step 6: Commit Discipline
- Commit hook integration and report generator changes separately from generated artifacts
- Keep generated artifacts either uncommitted or in a separate review commit
