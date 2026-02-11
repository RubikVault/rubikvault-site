# P0/P1 Hardening Contracts

This document defines the minimal contracts introduced for operational hardening.

## Mission Control Severity Policy
- Source: `policies/mission-control-severity.json`
- Blocking codes fail strict deploy gates (`MC_GATE_STRICT=1`):
  - `NO_API_KEY`
  - `KV_UNAVAILABLE`
  - `INVALID_CONFIG`
- Degrading codes keep runtime observable with `meta.status="degraded"` and `meta.circuitOpen=true`.

## Universe Policy (Elliott)
- Source: `policies/universe-policy.json`
- Canonical default mode: `full` (`/data/universe/all.json`).
- Prod and preview are parity-locked to `full` unless policy changes.
- `/api/elliott-scanner` now exposes:
  - `meta.universeSource`
  - `meta.universeCount`
  - `meta.returnedCount`
  - `meta.filtered`
  - `meta.mode`
  - `meta.filterReason`

## Cohesion Policy
- Source: `policies/cohesion-policy.json`
- Core artifacts:
  - `/api/mission-control/summary?debug=1`
  - `/api/elliott-scanner`
  - `/data/ops/pulse.json`
- All core artifacts must expose one shared `meta.build_id`.

## MarketPhase JSON Fail-Safe
- Route: `functions/data/marketphase/[asset].js`
- Guarantees JSON responses for `/data/marketphase/*.json`.
- Missing artifacts return explicit fallback envelopes with:
  - `meta.status="error"`
  - `meta.circuitOpen=true`
  - concrete `meta.reason` code.

## Ops Pulse
- Generator: `scripts/ops/build-ops-pulse.mjs`
- Output: `public/data/ops/pulse.json`
- Required keys:
  - `meta.build_id`
  - `meta.commit`
  - `meta.generatedAt`
  - `pipelineOk`
  - `asOfTradingDay`
  - `errors[]`
