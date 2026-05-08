# Decision Engine V3.3 Status Audit

Date: 2026-05-07
Scope: Decision Engine V3.3, accelerated historical certification, BUY breadth gate, Green-State release readiness.

## 1. Problem Definition

RubikVault has a structurally valid Decision-Core safety layer, but it is not production-switch ready because it currently produces no actionable BUY signals and the release/certification gates remain red.

Current local evidence:

- Decision-Core bundle builds and validates structurally.
- Decision-Core safety tests pass.
- Stock Analyzer Random20 UI proof passes.
- Current Decision-Core output has `buy_count=0`, `eligible_assets=0`, `decision_grade_rate=0`.
- BUY Breadth gate has `us_stock_etf_buy_count=0` and `eu_stock_etf_buy_count=0`.
- Final Integrity Seal is failed because the data-plane is not current.
- Live Shadow Ledger has one valid day, not twenty.
- Historical replay certification is not complete because local history packs are unavailable; current snapshot rows are no longer allowed to masquerade as PIT history.

Core problem is not UI renderability. Core problem is Decision-Core is implemented as a P0 safety layer but not yet connected to a current NAS data-plane plus real historical PIT replay certification that can produce production-usable, invariant-safe BUY breadth.

## 2. Status Quo

Relevant architecture:

- NAS is the production pipeline owner via `scripts/nas/rv-nas-night-supervisor.sh`.
- Static-first data path is EOD/NAS history packs to public artifacts to Page-Core to UI.
- Decision-Core V3.3 source lives under `scripts/decision-core/`.
- Public Decision-Core artifacts live under `public/data/decision-core/`.
- UI mapping is centralized in `public/js/decision-core-ui-map.js`.
- Page-Core and Best-Setups support source switching via `RV_DECISION_CORE_SOURCE` and `BEST_SETUPS_DECISION_SOURCE`.
- Accelerated gate and BUY Breadth gate exist:
  - `scripts/decision-core/build-accelerated-certification.mjs`
  - `scripts/decision-core/build-buy-breadth-proof.mjs`
  - `scripts/validate/stock-decision-core-ui-buy-breadth.mjs`

Current report state:

- `public/data/decision-core/status/latest.json`: Decision-Core status is structurally OK, but all rows are unavailable.
- `public/data/reports/decision-core-buy-breadth-latest.json`: BUY Breadth failed with zero US and zero EU STOCK/ETF BUYs.
- `public/data/reports/stock-decision-core-ui-random20-latest.json`: UI proof passed for 20 random real assets, but BUY category was not available.
- `public/data/decision-core/status/shadow-ledger-latest.json`: live shadow ledger remains real-only with one valid day.
- `public/data/ops/final-integrity-seal-latest.json`: release readiness failed because data-plane freshness and target-date chain are red.
- `public/data/decision-core/status/accelerated-certification-latest.json`: accelerated certification failed because historical replay, BUY breadth, BUY UI proof, and data-plane current gates are not satisfied.

## 3. Evidence

Repository evidence:

- Product Green-State and NAS ownership are defined in `PROJECT.md`.
- Accelerated replay must not inflate live shadow ledgers is documented in `docs/ops/lessons-learned.md`.
- Decision-Core public status fields are written by `scripts/decision-core/build-minimal-decision-bundles.mjs`.
- Historical replay now uses `scripts/decision-core/load-historical-bars-asof.mjs`, which requires history-pack PIT slices.
- Replay orchestration is in `scripts/decision-core/run-historical-certification.mjs`.
- BUY breadth proof and failure diagnostics are in `scripts/decision-core/build-buy-breadth-proof.mjs`.
- Release gate Decision-Core mode checks are in `scripts/ops/release-gate-check.mjs`.
- Final Seal Decision-Core integration is in `scripts/ops/final-integrity-seal.mjs`.

New guardrail implemented in this audit pass:

- `scripts/decision-core/load-historical-bars-asof.mjs` no longer certifies current registry snapshots as historical PIT data.
- `scripts/decision-core/build-minimal-decision-bundles.mjs` supports `--registry-override`.
- `scripts/decision-core/run-historical-certification.mjs` uses PIT-sliced registry override files for executed historical replays.
- Missing local/NAS history packs now fail with `HISTORY_PACKS_UNAVAILABLE` and `PIT_HISTORY_ROWS_UNAVAILABLE`.
- Partial local replay is explicit only: `--allow-partial-history --min-pit-rows=<n>` writes `history_coverage_mode=partial_pit_available_rows`; strict mode remains the default.
- BUY Breadth failure report now includes cause buckets by action, eligibility status, EV bucket, tail bucket, blocker, wait subtype, and region/type/action.

Current local diagnostic output:

- US/EU STOCK/ETF rows examined by BUY Breadth: 76,233.
- All examined US/EU STOCK/ETF rows are `UNAVAILABLE`.
- Eligibility status for all examined rows: `NOT_DECISION_GRADE`.
- Main blockers are dominated by `STALE_PRICE` and `SUSPICIOUS_ADJUSTED_DATA`.
- EV bucket is `unavailable`.
- Tail risk bucket is `UNKNOWN`.

This supports the conclusion that current zero-BUY state is caused by data-plane/evidence/eligibility blockage, not by a proven market regime with no opportunities.

## 4. Why This Is A Problem

The current system proves different layers independently, but not the complete release objective:

- Random20 UI proof proves rendering, not BUY availability.
- Decision-Core status OK proves bundle shape, not production signal breadth.
- Safety tests prove no unsafe BUYs, not that the core can generate useful BUYs.
- Accelerated certification fails because historical PIT replay and BUY breadth are not satisfied.
- Best-Setups would be empty after a core switch because the core currently emits zero BUY rows.

Root causes:

- Current data-plane reports are stale/failed.
- Eligibility is fully blocked.
- EV proxy and tail risk cannot evaluate.
- Local repo does not contain the required NAS history packs for real PIT replay.
- Historical replay previously risked using current snapshots; this is now blocked.

Operational risks:

- Loosening gates without PIT/holdout proof would create false-green BUYs.
- Counting historical replay days as live shadow days would corrupt rollout auditability.
- Re-enabling legacy BUY fallback would invalidate V3.3 as a Decision-Core authority.
- Deploying with a red Final Seal would require force/skip behavior, which is disallowed.

## 5. Target State

Required target:

- P0 Decision-Core remains a safety core, not alpha proof.
- NAS data-plane is current.
- Historical replay uses real PIT slices from history packs.
- Accelerated certification explicitly reports `switch_mode=accelerated_historical_certification`.
- Live shadow ledger remains real-only.
- Current production core emits at least 10 US and 10 EU STOCK/ETF canonical Decision-Core BUY rows.
- Best-Setups consumes only canonical Decision-Core BUY rows.
- The 20 BUY breadth pages render as BUY in UI with entry guard, invalidation, reliability tooltip, and no legacy/data-quality narrative.
- Final Seal and Release Gate pass without force or skipped smokes.
- P1 outcome store starts from historical replay decisions, but does not auto-promote P0 weights.

Not yet satisfied:

- NAS data-plane current.
- 60 valid PIT historical replay days.
- 10 US and 10 EU BUY breadth.
- BUY breadth UI proof.
- Accelerated certification OK.
- Production source switch.
- Final Seal OK.

## 6. Best Solution

Best solution remains Accelerated Historical Champion/Holdout Certification:

1. Make NAS data-plane current.
2. Use real NAS history packs as PIT data source.
3. Run at least 60 valid historical replay dates, preferably 120.
4. Calibrate only safe P0 parameters: candidate selection thresholds, evidence bootstrap availability, cost/liquidity buckets, region/type handling, stale/evidence integration.
5. Do not weaken BUY invariant.
6. Validate on holdout windows.
7. Build current production core bundle.
8. Enforce BUY Breadth: at least 10 US and 10 EU STOCK/ETF BUY rows.
9. Verify all 20 BUY pages in UI.
10. Allow one-time accelerated switch only when all reports are green.

This is better than waiting because it uses historical data immediately. It is better than a hidden shortcut because it keeps audit fields explicit and keeps `alpha_proof=false`.

## 7. Implementation Path

### Phase 1: Current NAS Data-Plane

Run NAS pipeline, clear stale target-date and publish-chain blockers, rebuild Final Seal.

### Phase 2: Real PIT Replay

Mount or sync NAS history packs so `scripts/decision-core/load-historical-bars-asof.mjs` can resolve registry `pointers.history_pack`.

Run:

```bash
node scripts/decision-core/run-historical-certification.mjs --min-days 60 --prefer-days 120 --target-market-date <current_market_date> --replace
```

### Phase 3: Safe Calibration

Use replay output and BUY Breadth diagnostics to tune only safe P0 policy thresholds. No bypass of decision grade, hard vetos, entry guard, invalidation, EV positive, tail risk, or reason-code mapping.

### Phase 4: BUY Breadth Proof

Run current production core, build Best-Setups core-only, rebuild Page-Core, then run:

```bash
node scripts/decision-core/build-buy-breadth-proof.mjs --target-market-date <current_market_date>
node scripts/validate/stock-decision-core-ui-buy-breadth.mjs
```

### Phase 5: Accelerated Certification

Run:

```bash
node scripts/decision-core/build-accelerated-certification.mjs --target-market-date <current_market_date>
```

### Phase 6: Release

Use:

```bash
RV_DECISION_CORE_SOURCE=core RV_DECISION_CORE_SWITCH_MODE=accelerated_historical_certification node scripts/ops/final-integrity-seal.mjs --target-market-date <current_market_date>
RV_DECISION_CORE_SOURCE=core RV_DECISION_CORE_SWITCH_MODE=accelerated_historical_certification node scripts/ops/release-gate-check.mjs --dry-run
RV_DECISION_CORE_SOURCE=core RV_DECISION_CORE_SWITCH_MODE=accelerated_historical_certification node scripts/ops/release-gate-check.mjs
```

No `--force`. No `--skip-smokes`.

## 8. Expected Effect

Expected improvements:

- Historical acceleration without fake live shadow days.
- Clear audit trail for why a switch was allowed.
- No empty Best-Setups after core switch.
- EU BUY availability becomes a measured release requirement.
- Current data-plane blockers cannot be hidden by UI render success.
- P1 outcome learning starts without changing P0 live weights.

Largest leverage:

1. Current NAS data-plane.
2. Real history-pack PIT replay.
3. Region/type-aware evidence and cost calibration.
4. BUY Breadth proof through UI.

## 9. Open Points

Open and critical:

- Local Mac repo does not currently expose the required history packs under the expected roots.
- NAS path or sync path for full PIT-capable history packs must be provided to `RV_DECISION_CORE_HISTORY_ROOT` or `RV_UNIVERSE_V7_MIRROR_ROOT`.
- It remains unproven whether current EU data quality and cost proxies can satisfy 10 safe EU BUYs without calibration.
- Current Final Seal is blocked by stale data-plane and target mismatch.
- BUY Breadth requirement is a product release requirement, not a statistical theorem. If it fails after current data-plane plus real PIT calibration, then either the logic is miscalibrated for product use or the available data basis is insufficient.

Decision:

Proceed with accelerated historical champion/holdout certification. Do not fake live shadow days. Do not re-enable legacy BUY. Do not deploy while Final Seal or BUY Breadth is red.
