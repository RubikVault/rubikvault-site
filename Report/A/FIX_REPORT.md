# P0/P1 Hardening Fix Report

## Scope
Implemented P0/P1 hardening for Mission Control severity semantics, MarketPhase JSON safety, Elliott universe/contract parity, preflight/pulse ops signaling, and CI/monitoring gates.

## What Was Broken (evidence)
1. `/data/marketphase/index.json` returned HTML 404 on both PROD and PREVIEW (JSON contract break).
2. `/api/mission-control/summary?debug=1` reported `meta.status="error"` with reason `EOD_BATCH_MISSING` and no blocking/degrading policy split.
3. `/api/elliott-scanner` lacked explicit universe-mode contract fields (`mode`, `universeSource`, `returnedCount`, `filtered`) and build cohesion markers.
4. No strict deploy preflight to stop scheduled jobs on blocking config/key failures.
5. No `pulse.json` heartbeat artifact for daily pipeline liveness/DR semantics.

## What Changed
1. Mission Control severity law implemented:
   - Added `policies/mission-control-severity.json`.
   - `functions/api/mission-control/summary.js` now computes observed failure codes, applies blocking/degrading policy, and emits:
     - `meta.status` in `{ok,degraded,error}`
     - `meta.circuitOpen`
     - `meta.blockingCodes`, `meta.degradingCodes`
     - `meta.build_id`, `meta.commit`, `meta.generatedAt`
2. MarketPhase JSON fail-safe route added:
   - `functions/data/marketphase/[asset].js` guarantees JSON envelopes for missing `/data/marketphase/*.json` artifacts (no HTML-silent failure path for JSON consumers).
3. Elliott contract + policyized universe mode:
   - Added `policies/universe-policy.json`.
   - `functions/api/elliott-scanner.js` now resolves mode via policy + env parity lock and emits:
     - `meta.mode`, `meta.universeSource`, `meta.universeCount`, `meta.returnedCount`, `meta.filtered`, `meta.filterReason`
     - `meta.build_id`, `meta.commit`, `meta.generatedAt`
4. Ops preflight + pulse:
   - Added `scripts/ops/preflight-check.mjs` (blocking env/key validation + pulse write).
   - Added `scripts/ops/build-ops-pulse.mjs` (builds `public/data/ops/pulse.json` from ops summary + severity policy).
   - Added seed artifact `public/data/ops/pulse.json`.
5. CI/Workflow gates:
   - Added `scripts/ci/assert-mission-control-gate.mjs`.
   - Added `scripts/ci/check-elliott-parity.mjs`.
   - Wired gates/workflow steps in:
     - `.github/workflows/eod-latest.yml`
     - `.github/workflows/ops-daily.yml`
     - `.github/workflows/ci-gates.yml`
     - `.github/workflows/monitor-prod.yml`
6. UI degrade signal (no redesign):
   - `public/index.html` now surfaces explicit Elliott circuit-open reason when marketphase payload is unavailable/circuit-open.

## Why This Is UI-Safe
- No route/path changes in UI fetch URLs.
- Added only defensive JSON/fallback handling and explicit status disclosure.
- Existing success-path rendering remains unchanged.

## Policy Files Added
- `policies/universe-policy.json`
- `policies/cohesion-policy.json`
- `policies/mission-control-severity.json`
- Documentation: `docs/ops/P0_P1_HARDENING_CONTRACTS.md`

## Verification Outcome (local)
- Syntax checks: PASS (JS + workflow YAML parse).
- Artifact semantic check: PASS (`node scripts/ci/verify-artifacts.mjs`).
- Unit tests: PASS (`test:drop-threshold`, `test:fetch-retry`).
- Mission-control gate:
  - non-strict mode: warns on blocking (`NO_API_KEY`)
  - strict mode: fails as expected (fail-loud behavior).
- Preflight:
  - missing keys/env: fails and writes pulse with blocking errors
  - provided test env vars: passes.

## Notes
- Deployed PROD/PREVIEW probes remain unchanged until this branch is merged/deployed.
- Existing `Report/A/*` forensic files from earlier audits were left untouched; this report adds runbook-specific fix evidence files only.
