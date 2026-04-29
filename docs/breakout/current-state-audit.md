# Breakout Current-State Audit

Generated for Breakout Engine V1.2 rollout.

## Legacy V1 Facts

- Batch logic lives in `scripts/breakout_scanner/core.mjs`.
- API copy lives in `functions/api/_shared/breakout-core.mjs`.
- Both copies import `scripts/runblock/layers/02b-breakout-state.mjs`.
- Legacy output is `public/data/snapshots/breakout-all.json`.
- Current tracked V1 artifact was generated at `2026-03-22T12:33:17.022Z`.
- Current tracked V1 artifact has `11005` items.
- Legacy states present: `NONE`, `SETUP`, `ARMED`, `TRIGGERED`, `CONFIRMED`, `FAILED`, `COOLDOWN`.

## Legacy Risks

- State machine is canonical V1 truth, so continuous market structure is compressed into discrete labels.
- Batch/API core logic is duplicated, creating drift risk.
- `functions/api/_shared/data-interface.js` calls `processTickerSeries(effectiveTicker, bars)`, but the legacy signature is `processTickerSeries(bars, config, regime)`.
- Legacy batch reads per-ticker `ndjson.gz` in Node and loops through all bars.
- `breakout-all.json` is monolithic and overwritten in place.

## V1.2 Decision

- V1 remains available for comparison only.
- V1.2 produces continuous features, deterministic scores, static manifests, and append-only outcome artifacts.
- No V1.2 production path may depend on `TRIGGERED`, `COOLDOWN`, `probability`, `ml_score`, or a buy gate.
