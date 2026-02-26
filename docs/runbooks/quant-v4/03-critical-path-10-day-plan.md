# Quant v4.0 Critical Path Plan (10 Days) - Stocks+ETFs First

Last updated: 2026-02-26 (local)

Goal of this 10-day block:
- Move from "strong Q1 backbone" to "daily-updating, trustable quant engine core" for Stocks+ETFs.
- Prioritize:
  1. Daily delta ingest + incremental snapshot/features
  2. Real Stage B (not only proxy)
  3. Registry/champion governance (decision/event trail)

This is the fastest path to "mostly training/iteration" mode.

## Day 1 - Daily delta ingest skeleton (Stocks+ETFs)

Deliverables:
- new local runner for daily delta ingest (v7 -> Quant raw)
- idempotent append logic
- duplicate key guard (`asset_id,date`)

DoD:
- one dry-run over a small subset writes no duplicates
- manifest/log written for the delta ingest run

## Day 2 - Incremental snapshot update (not full rebuild)

Deliverables:
- snapshot updater that applies only changed assets/time ranges
- updated `snapshot_manifest.json` with change counts

DoD:
- incremental run finishes faster than full rebuild on same delta
- snapshot counts reconcile (`rows_before + inserts - drops == rows_after`)

## Day 3 - Incremental feature update (rolling windows)

Deliverables:
- feature updater that recalculates only affected assets and window ranges
- feature manifest with changed partitions and hashes

DoD:
- new day append reflected in feature store
- no full panel rebuild required for daily path

## Day 4 - Reconciliation and runtime assertions

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

## Day 8 - Registry/champion base schema (SQLite)

Deliverables:
- registry schema for runs / candidates / champions / events
- write path from Stage B outputs into registry

DoD:
- one end-to-end run inserts rows for candidate + result + run metadata

## Day 9 - Promotion/decision trail (auditable)

Deliverables:
- decision ledger (always writes)
- event ledger (promotion/demotion events only)
- query helper/index (time-window lookup)

DoD:
- "no promotion" and "promotion" both produce auditable records

## Day 10 - End-to-end daily local quant backbone (Stocks+ETFs)

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

## Out of scope for this 10-day block (but next)

- real corp actions + delistings + TRI (Data Truth deepening)
- portfolio/risk overlay
- invalidation engine
- full red-flag dashboard and complete test suite
- broad alt-assets (`crypto/forex/bond/fund`) until v7 pointer coverage is improved

## Operator notes (important)

- Keep Quant artifacts local/private.
- Do not push generated data stores to `main`.
- Keep website/UI edits isolated from Quant pipeline changes.
- Update `02-current-state-and-implementation-log.md` at the end of each day.

