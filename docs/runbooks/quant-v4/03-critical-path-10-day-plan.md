# Quant v4.0 Critical Path Plan (10 Days) - Stocks+ETFs First

Last updated: 2026-02-27 (local)

Goal of this 10-day block:
- Move from "strong Q1 backbone" to "daily-updating, trustable quant engine core" for Stocks+ETFs.
- Prioritize:
  1. Daily delta ingest + incremental snapshot/features
  2. Real Stage B (not only proxy)
  3. Registry/champion governance (decision/event trail)

This is the fastest path to "mostly training/iteration" mode.

## Progress status (as of current local state)

- Day 1: implemented (delta ingest skeleton + smoke run)
- Day 2: implemented as Q1 sidecar incremental snapshot updater (smoke/no-op path verified)
- Day 3: implemented as Q1 latest-only changed-assets incremental feature updater (smoke/no-op path verified)
- Day 4: implemented as Q1 reconciliation checks (smoke verified)
- Day 5-7: partially advanced ahead of schedule (Stage B prep + Stage B light + orchestrated Stage-B Q1 runner exist)
- Day 8-9: partially advanced ahead of schedule (Q1 registry base + decision/event ledgers + first promotion record exist)
- Post-Day10 hardening already added:
  - Stage-B Q1 final survivor intersection (`survivors_B_q1` = prep-strict ∩ light)
  - registry candidate state transition events (`candidate_state_events_q1` + NDJSON ledger)
  - integrated Python daily runner now includes Stage B + Registry (not shell-only)

Remaining critical path focus:
- promote integrated Phase A mode from scratch validation to regular daily operation (with thresholds/guards)
- tighten Stage B further toward real CPCV/DSR/PSR (latest pass added stricter fold minima + CPCV quantile gates; still Q1-light)
- expand registry/champion governance from Q1 base to full live/shadow/demotion model

Latest progress update (2026-02-27):
- Overnight orchestrator hardened with stale-heartbeat watchdog + auto-retry and safe nightly wrapper script.
- Added named global lock for overnight jobs (prevents duplicate parallel runs).
- Stage-B Q1-light hardened with stricter fold-policy minima and additional CPCV/stability gates (`cpcv_light_sharpe_p25`, `ic_fold_std_proxy`).
- Contract-layer materializer now preserves existing corp-actions/delistings by default (no implicit empty overwrite).

## Day 1 - Daily delta ingest skeleton (Stocks+ETFs) ✅

Deliverables:
- new local runner for daily delta ingest (v7 -> Quant raw)
- idempotent append logic
- duplicate key guard (`asset_id,date`)

DoD:
- one dry-run over a small subset writes no duplicates
- manifest/log written for the delta ingest run

Status:
- Implemented: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_daily_delta_ingest_q1.py`
- Smoke verified (2 packs, no-op delta):
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_daily_delta_smoke_20260226/manifest.json`

## Day 2 - Incremental snapshot update (not full rebuild) ✅ (Q1 sidecar mode)

Deliverables:
- snapshot updater that applies only changed assets/time ranges
- updated `snapshot_manifest.json` with change counts

DoD:
- incremental run finishes faster than full rebuild on same delta
- snapshot counts reconcile (`rows_before + inserts - drops == rows_after`)

Q1 scope note:
- Implemented sidecar incremental snapshot manifest (`changed_assets` + `delta_files`) without rewriting materialized bars yet.
- This is the correct bridge step before a true physical incremental bars merge.

## Day 3 - Incremental feature update (rolling windows) ✅ (Q1 latest-only changed-assets)

Deliverables:
- feature updater that recalculates only affected assets and window ranges
- feature manifest with changed partitions and hashes

DoD:
- new day append reflected in feature store
- no full panel rebuild required for daily path

Q1 scope note:
- Implemented latest-only changed-assets update path first (not full multi-asof rolling-window delta yet).

## Day 4 - Reconciliation and runtime assertions ✅ (Q1 first pass)

Deliverables:
- checks for:
  - duplicate keys
  - future dates
  - invalid OHLCV
  - missing expected daily rows
- fail-fast runtime assertions

DoD:
- broken test fixture triggers fail-fast
- clean run emits "all checks passed"

Status:
- Reconciliation runner implemented and now verified on a real non-zero delta scratch run.
- Stronger expectations added (`expect_nonzero_delta`, minimum emitted rows, delta scan accounting consistency).
- Phase A is now integrated into the single local daily wrapper (optional/guardrailed) and launchd-enabled.
- Next upgrade: run regular scheduled Phase A with production-like delta expectations and monitor drift/failure rates.

## Day 5 - Stage B real foundations (fold artifacts + stricter split policy)

Deliverables:
- explicit Stage B fold builder (beyond Stage A reused folds)
- stricter purging/embargo config artifacts
- fold manifest contract for Stage B

DoD:
- fold manifests emitted and referenced by Stage B runner
- no hidden fold generation inside evaluator

## Day 6 - Stage B real metrics (first pass)

Deliverables:
- CPCV-light/realer combinational eval (improved over proxy)
- stricter OOS robustness table
- candidate-level fail reasons with thresholds

DoD:
- `survivors_B` artifact exists
- all candidate rejections reason-coded

## Day 7 - DSR/PSR integration (non-proxy or upgraded proxy with clear semantics)

Deliverables:
- DSR/PSR computation integrated in Stage B outputs
- explicit assumptions documented in report

DoD:
- Stage B report includes DSR/PSR fields per candidate
- gates can hard-pass/fail on DSR/PSR thresholds

## Day 8 - Registry/champion base schema (SQLite) ✅ (Q1 base implemented)

Deliverables:
- registry schema for runs / candidates / champions / events
- write path from Stage B outputs into registry

DoD:
- one end-to-end run inserts rows for candidate + result + run metadata

Status:
- Implemented (Q1 local base):
  - SQLite registry schema + insert path from Stage-B Q1 outputs
  - candidate metrics table
  - current champion state table
  - candidate registry state table (`live/shadow/retired`) with reason codes
- Script:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_registry_update_q1.py`

## Day 9 - Promotion/decision trail (auditable) ✅ (Q1 first pass implemented)

Deliverables:
- decision ledger (always writes)
- event ledger (promotion/demotion events only)
- query helper/index (time-window lookup)

DoD:
- "no promotion" and "promotion" both produce auditable records

Status:
- Implemented (Q1 first pass, now expanded):
  - decision ledger (always writes)
  - event ledger (promotion events)
  - promotion index helper
  - richer decision reason codes (e.g. champion present / survivor present)
- Verified both paths:
  - `PROMOTE` with reason `NO_EXISTING_CHAMPION`
  - `NO_PROMOTION` with reason `CHAMPION_ALREADY_TOP_SURVIVOR`

## Day 10 - End-to-end daily local quant backbone (Stocks+ETFs) ✅ (Q1 integrated)

Deliverables:
- single local batch runner:
  - delta ingest
  - incremental snapshot
  - incremental features
  - panel build/update
  - Stage A
  - Stage B
  - registry decision/event
- standardized run status and artifact references

DoD:
- one full local daily run completes on Mac
- all artifact references are written and inspectable
- no silent failures

Status (current):
- Daily local runner executes:
  - Phase A backbone (`delta/snapshot/features/reconciliation`) [optional/guardrailed, now integrated]
  - panel build
  - Stage A
  - Stage B prep
  - Stage B Q1 (light + stricter final `survivors_B_q1` selection)
  - registry update (optional, now enabled in launchd template and integrated in Python runner)
- Day-10 integration gap is closed at Q1 level.
- Verified integrated success run (all steps green):
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772133770/q1_panel_stagea_daily_run_status.json`
- Remaining follow-up (next block, not Day-10 blocker):
  - promote scratch-tested real-delta mode to production-like scheduled mode with tuned thresholds
  - continue de-proxying Stage B

## Out of scope for this 10-day block (but next)

- real corp actions + delistings + TRI (Data Truth deepening)
- portfolio/risk overlay
- invalidation engine
- full red-flag dashboard and complete test suite
- broad alt-assets (`crypto/forex/bond/fund`) until v7 pointer coverage is improved

## Next block after Day 10 (current active priorities)

These are the highest-leverage follow-ups after the Q1 integrated daily runner milestone:

1. Stage B de-proxying (continue)
- strengthen CPCV / purging / embargo policy (beyond Q1-light)
- replace proxy-heavy DSR/PSR pieces with less proxy / more statistically grounded implementations
- standardize robust fold + stress reports as first-class Stage B artifacts

2. Phase A hardening in scheduled mode
- calibrate production-like delta thresholds (warn/fail) for real daily behavior
- collect drift/failure metrics over multiple runs (not only scratch verification)
- tune launchd defaults based on observed deltas and false-positive rates

3. Registry/governance expansion
- evolve Q1 registry state into fuller `live/shadow/retired` transitions with demotion ladder semantics
- keep reason-code sets standardized and append-only across decision + event ledgers
- prepare champion lifecycle hooks for future Stage B (non-Q1) upgrades

Operational rule:
- every change in this block must update `02-current-state-and-implementation-log.md` with exact artifact paths and observed outputs.

## Operator notes (important)

- Keep Quant artifacts local/private.
- Do not push generated data stores to `main`.
- Keep website/UI edits isolated from Quant pipeline changes.
- Update `02-current-state-and-implementation-log.md` at the end of each day.
