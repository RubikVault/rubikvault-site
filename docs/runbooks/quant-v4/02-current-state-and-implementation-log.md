# Quant v4.0 Current State and Implementation Log (Living)

Last updated: 2026-02-26 (local branch state)
Branch context: `codex/v2-local-prep-20260222-165918`

This file is the "where are we exactly?" answer.
Update this file whenever a meaningful Quant milestone is completed.

## 1. Current completion estimate (simple)

Approximate v4.0 progress (overall):
- `40-50%` complete (overall v4.0 target architecture)

Breakdown (rough):
- Data format + storage foundation (Stocks+ETFs): `75-85%`
- Q1 quant backbone (panels + Stage A + Stage B prep/light + Stage-B orchestration): `70-80%`
- Full v4.0 governance/data truth/portfolio/testing stack: much lower (still ahead)

## 2. Current data/storage topology (active)

### 2.1 v7 history archive (moved off Mac internal)
- Repo compatibility path (symlink):
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/universe-v7/history`
- Actual archive location:
  - `/Volumes/T9/rubikvault-archive/mirrors/universe-v7/history`

### 2.2 Quant warm storage (T9)
- `/Volumes/T9/rubikvault-quantlab`

### 2.3 Quant hot storage (Mac)
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab`

Convenience symlink inside repo:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/quantlab/local_hot_data`

## 3. Quant export status (v7 history -> Quant raw Parquet)

### 3.1 Stocks + ETFs export (completed)
Job state:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_stock_etf_export_20260225_221558/state.json`

Expected final values (verify in file):
- `packs_done = 3092 / 3092`
- `packs_failed = 0` (effective data failures)
- `meta_only_failed_packs = 176` (historical state-write race; metadata-only issue)
- `assets_emitted = 95149`
- `bars_written = 292062009`

Manifest:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_stock_etf_export_20260225_221558/manifest.json`

### 3.2 Alt-assets export (wrapper flow completed, coverage-limited)
Job state:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_altassets_export_20260225_213100/state.json`

Observed result:
- only `2` assets exported (coverage-limited by v7 `history_pack` pointers)

## 4. Snapshot layer (Q1)

### 4.1 Materialized snapshot (current anchor)
Snapshot root:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/snapshots/snapshot_id=2026-02-26_670417f6fae7_q1step2bars`

Key artifacts:
- `snapshot_manifest.json`
- `universe.parquet`
- `bars/` (materialized bars dataset)
- `bars_schema_contract.json`
- `bars_dataset_manifest.json`
- `bars_files_manifest.ndjson`
- `corp_actions.parquet` (contracted placeholder in Q1)
- `delistings.parquet` (contracted placeholder in Q1)

### 4.2 Snapshot counts (use `snapshot_manifest.json -> counts`)
Known values from current run:
- `source_files_total = 3101`
- `universe_rows_total = 97305`
- `universe_rows_by_asset_class`:
  - `stock = 74841`
  - `etf = 20312`
  - `crypto = 2087`
  - `index = 65`
- `bars_materialized_rows_total = 292064569`
- `bars_materialized_files_total = 3101`

Interpretation:
- Quant-format data is already strong for Stocks+ETFs.
- Alt-assets are present in universe snapshot, but broad raw history coverage for them is not yet there.

## 5. Feature stores (Q1)

### 5.1 Latest-only feature store (Q1 minimal)
Path:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1min`

Status:
- Used for early Q1 tests and scaling benchmarks.

### 5.2 Full multi-asof panel (first successful full panel)
Manifest:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1panel_fullchunk/feature_panel_manifest.json`

Key counts (`counts.*`):
- `rows_total = 906334`
- `files_total = 414`
- `asof_dates_total = 27`
- `rows_by_asset_class.stock = 701033`
- `rows_by_asset_class.etf = 205301`

### 5.3 Larger chunked/cached full panel (current heavy run)
Manifest:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1panel_fullchunk_cached/feature_panel_manifest.json`

Key counts (`counts.*`):
- `rows_total = 2746571`
- `files_total = 848`
- `asof_dates_total = 46`
- `rows_by_asset_class.stock = 2157113`
- `rows_by_asset_class.etf = 589458`

Performance (captured during build):
- approx `638.95s` wall time
- peak RSS approx `9.1 GiB`

## 6. Panel builder optimization status

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_feature_store_q1_panel.py`

Implemented:
1. Full-panel chunking via registry pointer (asset chunks, not naive file batching)
2. Persistent registry cache:
   - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/cache/v7_registry_packkey_cache.json`
3. Persistent bars-pack-file index cache:
   - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/cache/v7_bars_pack_file_index.stock_etf.json`

Cache behavior:
- Helper-level verified: `built -> hit`
- Manifest-level proof for both caches is now available (see 6.1 below).

### 6.1 Explicit manifest proof (`cache = hit` for both caches)
Probe build manifest (full mode, short panel range, cache verification run):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1panel_fullchunk_cachehitproof10/feature_panel_manifest.json`

Verified in `scan_plan`:
- `registry_packkey_cache.status = "hit"`
- `bars_pack_file_index.status = "hit"`
- sample preprune modes:
  - `registry_lookup_mode = "registry_packkey_cache"`
  - `bars_file_lookup_mode = "pack_index"`

Probe counts (`counts.*`):
- `rows_total = 7542`
- `files_total = 14`
- `asof_dates_total = 2`

## 7. Stage A (temporal folds) status

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_cheap_gate_stage_a_time_splits_q1.py`

### 7.1 Time-split methodology status
- Anchored temporal folds (3 folds)
- Embargo applied
- Stage A is no longer single-slice proxy-only

### 7.2 Scaled runs on chunked full panel (saved reports)
Directory:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=cheapgateA_tsplits_2026-02-17/outputs/scales`

Saved examples:
- `cheap_gate_A_time_splits_report.fullchunk_cached_top20k.json`
- `cheap_gate_A_time_splits_report.fullchunk_cached_top30k.json`
- `cheap_gate_A_time_splits_report.fullchunk_cached_top40k.json`
- `cheap_gate_A_time_splits_report.fullchunk_cached_top50k.json`

Observed outcomes:
- `top20k -> survivors_A = 3`
- `top30k -> survivors_A = 3`
- `top40k -> survivors_A = 1`
- `top50k -> survivors_A = 1`

Note:
- `candidates_total = 8` in current Q1 candidate set
- `folds_total = 3`

## 8. Stage B status (Q1)

### 8.1 Stage B prep (strict proxy gates + fold robustness summaries)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/prepare_stage_b_q1.py`

Artifacts (for current `cheapgateA_tsplits_2026-02-17` run):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=cheapgateA_tsplits_2026-02-17/outputs/stage_b_prep/stage_b_prep_report.json`
- `fold_summary.parquet`
- `candidate_fold_robustness.parquet`
- `stage_b_prep_shortlist.parquet`
- `stage_b_prep_strict_survivors.parquet`

### 8.2 Stage B light (closer to real Stage B, but still Q1-light)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`

Artifacts:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-17/artifacts/stage_b_light_report.json`
- Stage-B-light candidate artifacts are referenced via the Stage-B Q1 run outputs/artifacts layer
- `stage_b_light_candidates.parquet`
- `survivors_B_light.parquet`
- `fold_summary.parquet`

Current observed result (top50k stage-A context):
- `stage_a_candidates_total = 8`
- `stage_a_survivors_A_total = 1`
- `survivors_B_light_total = 1`

Observed Stage-B-light fail pressure (same report, top50k context):
- strongest fail reasons are dominated by strict Sharpe / PSR / DSR / CPCV-light robustness gates
- examples include:
  - `g_sharpe_mean`
  - `g_bootstrap_neg_sharpe`
  - `g_cpcv_light_neg_share`
  - `g_cpcv_light_sharpe_min`
  - `g_psr_proxy`
  - `g_dsr_proxy`

Important:
- This is not full v4.0 Stage B yet.
- It is a stronger Q1 bridge (PSR/DSR proxies + combinational robustness proxy).

### 8.3 Stage B Q1 orchestrated runner (single entrypoint)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`

Purpose:
- Runs `prepare_stage_b_q1.py` + `run_stage_b_q1_light.py` as a single auditable Stage-B entrypoint.
- Writes a consolidated run report with hashes and artifact refs.
- Computes a stricter Q1 final survivor set (`survivors_B_q1`) as the intersection of:
  - `stage_b_prep_strict_survivors`
  - `survivors_B_light`

Example run report:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-17/stage_b_q1_run_report.json`

Observed result (current top50k Stage-A context):
- `ok = true`
- `stage_b_prep_strict_survivors_total = 1`
- `survivors_B_light_total = 1`
- `stage_b_q1_final.selection_mode = intersection_prep_strict_and_light`
- `stage_b_q1_final.survivors_B_q1_total = 1`
- Stage-B-light fail pressure dominated by:
  - `g_sharpe_mean`, `g_bootstrap_neg_sharpe`
  - `g_cpcv_light_neg_share`, `g_cpcv_light_sharpe_min`
  - `g_psr_proxy`, `g_dsr_proxy`

Interpretation:
- This is still Q1-light (not final CPCV/DSR/PSR), but it is now a **real Stage-B run step**, not just an isolated prep script.

### 8.4 Stage B -> Registry/Champion bridge (Q1 local governance base)
Scripts:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_registry_update_q1.py`

Purpose:
- Reads Stage-B Q1 outputs (`stage_b_q1_run_report` + Stage-B-light candidates/survivors)
- Prefers `survivors_B_q1` (strict final intersection) when present; falls back to `survivors_B_light`
- Writes:
  - SQLite registry base tables

## 9. Quant V4 code correctness audit (2026-02-26) - validation of external review

External LLM feedback was reviewed against the actual local codebase and current artifacts.

### 9.1 Outcome summary

- Several reported feature-builder correctness issues were **already fixed** in the current code (stale feedback).
- One real correctness issue was valid and is now fixed:
  - `build_regime_q1_min.py` statefulness (`days_in_state`, `regime_flip_flag`) + timeseries overwrite behavior.
- Some optimization notes were valid; one was implemented immediately (`Stage-B-light DSR baseline / stricter CPCV-light combo policy`), others remain backlog items.

### 9.2 Findings that were stale (already fixed in code before this audit pass)

The following points from the external audit are not current anymore:

1. RSI "SMA not Wilder"
- Current builder uses Wilder-style EWM smoothing (not simple rolling mean) in:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_feature_store_q1_panel.py`

2. `ewma_vol_20/60` naming mismatch vs rolling std
- Current builder computes EWMA-style volatility proxies (not plain `rolling_std`) in:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_feature_store_q1_panel.py`

3. `vov_20` based on price-vol instead of vol-of-vol
- Current builder computes `vov_20` from volatility series (not nested price std) in:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_feature_store_q1_panel.py`

4. `dist_vwap_20` being a mislabeled SMA proxy
- Current builder uses a 20-day EOD volume-weighted close proxy (Q1 approximation), not SMA50.

5. `fwd_ret_5d` filter in feature store removing latest days
- Current panel builder no longer drops rows globally on `fwd_ret_5d.is_not_null()`.
- Forward-return null handling is done in Stage-A evaluation scope.

### 9.3 Valid issue that required a code fix (now fixed)

#### Regime engine was stateless (hardcoded `days_in_state`, `regime_flip_flag`)

File fixed:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_regime_q1_min.py`

What changed:
- Regime timeseries is now appended/updated by `date` (dedup on date, keep latest row).
- `days_in_state` is derived from persisted regime history.
- `regime_flip_flag` and `regime_flips_lookback10` are derived from the last 10 observations.

Why it matters:
- Regime output is now a true stateful timeseries foundation (still Q1-minimal), instead of a stateless snapshot with placeholder state fields.

Verification:
- Re-running the regime builder twice for the same `asof_date` produces one deduped row for that date and valid state fields in:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/regime_timeseries_q1.parquet`

### 9.4 Valid optimization/quality notes (partially implemented)

Implemented now:

1. Stage-B-light DSR/CPCV-light robustness tightening
- File:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`
- Changes:
  - `_dsr_proxy()` baseline now scales with candidate count (instead of fixed `8`)
  - CPCV-light combo policy broadened to all combo sizes from `ceil(n/2)` to `n-1`
- Evidence:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-17/artifacts/stage_b_light_report.json`
  - `method.cpcv_light_combo_policy = "all_combo_sizes_from_ceil_half_to_n_minus_1"`

2. Registry/governance auditability expansion (Q1)
- File:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_registry_update_q1.py`
- Changes:
  - `candidate_state_events_q1` SQLite table
  - `candidate_state_events.ndjson` append-only ledger
  - richer state transition reason codes and `state_before/state_after` tracking
  - registry now prefers `survivors_B_q1` (strict final Stage-B survivors) over `survivors_B_light`

3. Reconciliation strengthening for real-delta path
- File:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_reconciliation_checks_q1.py`
- Changes:
  - non-zero delta expectations
  - delta scan/accounting consistency checks
  - stronger delta stats in report

4. Feature math consistency propagated beyond panel builder
- Files:
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_feature_store_q1_min.py`
  - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_incremental_feature_update_q1.py`
- Changes aligned with panel builder:
  - Wilder RSI smoothing
  - EWMA volatility proxies
  - `vov_20` from volatility series
  - 20d EOD volume-weighted `dist_vwap_20` proxy

Backlog (valid but not yet implemented here):
- Stage-A Spearman IC Python-loop -> Polars/native vectorized path (performance)
- utility function dedup (`utc_now_iso`, `atomic_write_json`, `stable_hash_obj`) -> centralize in `q1_common.py`
- feature-store partition append/write strategy for true multi-file incremental append semantics

## 10. Phase A backbone (real-delta path) status

### 10.1 Real-delta non-no-op test mode (implemented)

Runner updated:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py`

New capabilities:
- `--real-delta-test-mode`
- `--real-delta-min-emitted-rows`
- real-delta run fail-fast if emitted rows are below expected threshold
- stronger reconciliation expectations passed through automatically

Reconciliation runner upgraded:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_reconciliation_checks_q1.py`

Added checks:
- `delta_scan_accounting_consistent`
- `delta_rows_emitted_nonzero_when_expected`
- `delta_assets_emitted_nonzero_when_expected`
- plus explicit scan/accounting stats in report

### 10.2 Real-delta test run (successful, scratch quant-root)

Scratch root used (isolated from main quant root):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest`

Backbone run report:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest/runs/run_id=q1backbone_1772127976/q1_daily_data_backbone_run_report.json`

Result:
- `ok = true`
- `real_delta_test_mode = true`
- `expected_min_rows = 1000`
- `bars_rows_emitted_delta = 1437` (PASS)

Step status:
- `daily_delta_ingest` ✅
- `incremental_snapshot_update` ✅
- `incremental_feature_update` ✅
- `reconciliation_checks` ✅

Reconciliation report:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest/runs/run_id=q1recon_20260226T175020Z/q1_reconciliation_report.json`

Key checks all `true`:
- duplicate-key check
- no-future-date check
- invalid-OHLCV check
- delta scan accounting consistency
- non-zero delta expectations

Observed delta stats:
- `selected_packs_total = 1`
- `bars_rows_emitted_delta = 1437`
- `assets_emitted_delta = 3`
- `bars_rows_scanned_in_selected_packs = 1437`

Interpretation:
- Phase A is no longer only smoke/no-op validated.
- A real non-zero delta path now runs end-to-end with strict reconciliation in an isolated scratch quant-root.

## 11. Q1 registry/champion governance status (extended)

### 11.1 Registry schema expansion (Q1)

Updated script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_registry_update_q1.py`

New/expanded behavior:
- `candidate_registry_state_q1` table populated per candidate with state:
  - `live`
  - `shadow`
  - `retired`
- stores reason codes / score / metrics JSON for auditability

Decision/event reason code improvements:
- decisions now persist richer `reason_codes`, e.g.:
  - `STAGE_B_SURVIVOR_PRESENT`
  - `CURRENT_CHAMPION_PRESENT`
  - `CHAMPION_ALREADY_TOP_SURVIVOR`

### 11.2 Verified registry paths (both promotion + no-promotion)

Registry update report (current):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-17/q1_registry_update_report.json`

Verified outcomes:
- `PROMOTE` path exists (first run, no existing champion)
- `NO_PROMOTION` path exists (same top survivor remains champion)

Current observed counts (latest report / DB):
- `stage_b_candidates_total = 8`
- `stage_b_survivors_B_light_total = 1`
- `stage_b_survivors_selected_total = 1`
- `stage_b_survivors_selected_source = stage_b_q1_final`
- `candidate_registry_state_counts`:
  - `live = 1`
  - `shadow = 0`
  - `retired = 7`
- `candidate_state_events_written = 0` (latest no-change rerun)

Registry DB:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/registry/experiments.db`

## 12. Daily local runner (Q1) - current production-like local wiring

Daily runner wrapper:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.sh`

LaunchAgent template:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/launchd/com.rubikvault.quantlab.q1panel-stagea.daily.plist.template`

Current local LaunchAgent install:
- `/Users/michaelpuchowezki/Library/LaunchAgents/com.rubikvault.quantlab.q1panel-stagea.daily.plist`

Current env flags enabled in launchd:
- `Q1_DAILY_RUN_PHASEA_BACKBONE=1`
- `Q1_DAILY_PHASEA_INCLUDE_TYPES=STOCK,ETF`
- `Q1_DAILY_PHASEA_REAL_DELTA_TEST_MODE=0`
- `Q1_DAILY_RUN_STAGEB_PREP=1`
- `Q1_DAILY_RUN_STAGEB_Q1=1`
- `Q1_DAILY_RUN_REGISTRY_Q1=1`
- `Q1_DAILY_TOP_LIQUID_N=20000`

Meaning:
- local daily run can now execute:
  - Phase A backbone (`delta ingest -> incremental snapshot -> incremental feature -> reconciliation`)
  - panel build
  - Stage A
  - Stage B prep
  - Stage B Q1
  - registry update
- Phase A is now wired into the same wrapper (optional/guardrailed) and enabled in the local launchd config.
- Real-delta mode remains configurable (`Q1_DAILY_PHASEA_REAL_DELTA_TEST_MODE=1`) and is recommended for explicit validation runs rather than every scheduled run.
  - promotion decision ledger (always)
  - promotion event ledger (events only)
  - promotion index helper
  - current champion state (Q1 local)

### 12.1 Daily local runner with integrated Phase A (verification)

Python runner:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`

What changed:
- optional `--run-phasea-backbone` step added before panel/Stage A pipeline
- status JSON now stores:
  - `artifacts.phasea_backbone_run_report`
  - `hashes.phasea_backbone_run_report_hash`
  - `references.phasea` summary (nested Phase-A refs/config)

Scratch verification (strict real-delta expected fail path):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest/runs/run_id=q1panel_daily_local_1772129396/q1_panel_stagea_daily_run_status.json`
- `ok = false`, `exit_code = 91` (guard correctly blocked low/nonzero delta expectation miss)

Scratch verification (integrated success path):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest/runs/run_id=q1panel_daily_local_1772129464/q1_panel_stagea_daily_run_status.json`

Observed:
- `ok = true`
- `steps` include:
  - `run_q1_daily_data_backbone_q1`
  - `run_q1_panel_stage_a_pipeline`
- `phasea_backbone_run_report` reference + hash populated

Interpretation:
- Single local daily entrypoint now covers the data backbone plus panel/screening chain.
- This closes the earlier Day-10 wrapper wiring gap at Q1 level.

### 12.2 Daily local runner with integrated Phase A + Stage B + Registry (verification)

Python runner now optionally integrates:
- `run_stage_b_q1`
- `run_registry_update_q1`

Wrapper defaults now support integrated mode while disabling legacy shell post-steps:
- `Q1_DAILY_USE_LEGACY_SHELL_POST_STEPS=0`
- `Q1_DAILY_RUN_STAGEB_Q1=1`
- `Q1_DAILY_RUN_REGISTRY_Q1=1`

Verified full integrated local run (production-like local settings, `top_liquid_n=20000`):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772133770/q1_panel_stagea_daily_run_status.json`

Observed:
- `ok = true`
- `steps` include:
  - `run_q1_daily_data_backbone_q1`
  - `run_q1_panel_stage_a_pipeline`
  - `run_stage_b_q1`
  - `run_registry_update_q1`
- `artifacts` include:
  - `phasea_backbone_run_report`
  - `orchestrator_run_report`
  - `stage_b_q1_run_report`
  - `q1_registry_update_report`
- `references.stage_b_q1.stage_b_q1_final.survivors_B_q1_total = 1`
- `references.q1_registry.counts.stage_b_survivors_selected_source = stage_b_q1_final`
- `references.q1_registry.decision = NO_PROMOTION`

Note:
- An earlier integrated run failed at Stage B because `run_stage_b_q1.py` was being edited during execution (path briefly unavailable during save). The subsequent rerun above completed successfully with the finalized code.

Registry root (local, private):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/registry`

Artifacts:
- `experiments.db`
- `ledgers/promotion_decisions.ndjson`
- `ledgers/promotion_events.ndjson`
- `promotion_index.json`
- `champions/current_champion.json`
- `champions/history/*.json`

Verified runs (promotion + no-promotion):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-17/q1_registry_update_report.json`

Observed results:
- First run:
  - `decision = PROMOTE`
  - `reason_codes = ["NO_EXISTING_CHAMPION"]`
  - first live champion created from current Stage-B-light survivor
- Second run (same Stage-B input, idempotent decision path):
  - `decision = NO_PROMOTION`
  - `reason_codes = ["CHAMPION_ALREADY_TOP_SURVIVOR"]`

Current registry table counts (after promotion + no-promotion verification):
- `runs_stage_b_q1 = 1`
- `stage_b_candidates_q1 = 8`
- `champion_state_q1 = 1`
- `promotion_decisions_q1 = 2`
- `promotion_events_q1 = 1`

## 13. Phase A (Daily Data Backbone) status [historical baseline entries]

### 13.1 Daily delta ingest (Q1 skeleton, implemented)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_daily_delta_ingest_q1.py`

Capabilities (implemented):
- v7 history packs -> Quant raw delta append
- idempotent append by `(asset_id, date)` vs latest-known-date cache
- pack-state cache (changed packs only)
- run status + manifest + packs manifest + latest success pointer

Persistent caches:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/cache/q1_daily_delta_latest_date_index.stock_etf.json`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/cache/q1_daily_delta_v7_pack_state.stock_etf.json`

First cache build (observed):
- `files_total = 3099`
- `assets_total = 95149`
- `rows_scanned = 292062009`

Smoke run artifacts:
- Job manifest:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_daily_delta_smoke_20260226/manifest.json`
- Run status:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1delta_20260226T163508Z/q1_daily_delta_ingest_run_status.json`

Smoke result:
- `selected_packs_total = 2`
- `packs_done = 2`
- `packs_failed = 0`
- `bars_rows_emitted_delta = 0` (expected no-op)
- `rows_skipped_old_or_known = 4238`
- `rows_emitted_matches_keys = true`

### 13.2 Incremental snapshot update (Q1 sidecar manifest mode, implemented)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_incremental_snapshot_update_q1.py`

Current mode:
- `delta_sidecar_snapshot_increment`
- writes changed-assets + delta-files manifests into snapshot `increments/ingest_date=...`
- does **not** rewrite the materialized bars dataset yet (intentional Q1 step)

Example artifact:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/snapshots/snapshot_id=2026-02-26_670417f6fae7_q1step2bars/increments/ingest_date=2026-02-26/incremental_snapshot_manifest.json`

Current smoke result:
- `delta_files_total = 0`
- `changed_assets_total = 0`
- `rows_declared_matches_scanned = true`

### 13.3 Incremental feature update (Q1 latest-only changed-assets mode, implemented)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_incremental_feature_update_q1.py`

Current mode:
- `incremental_latest_only_changed_assets`
- reads changed-assets from incremental snapshot sidecar
- computes latest-only features for changed assets
- writes delta feature manifest + latest success pointer

Example artifact:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1inc/asof_date=2026-02-26/feature_manifest.delta_2026-02-26.json`

Current smoke result:
- `changed_assets_total = 0`
- `feature_rows_total = 0`
- no-op path verified

### 13.4 Reconciliation checks (Q1, implemented)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_reconciliation_checks_q1.py`

Checks include:
- delta rows/keys reconciliation
- duplicate `(asset_id,date)` in delta outputs
- future dates in delta outputs
- invalid OHLCV in delta outputs
- cross-manifest consistency (delta -> incremental snapshot -> incremental feature)

Example report:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260226T165924Z/q1_reconciliation_report.json`

Current smoke result:
- `ok = true`

### 13.5 Phase A backbone orchestrator (Q1, implemented)
Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py`

Chain:
- `daily_delta_ingest -> incremental_snapshot_update -> incremental_feature_update -> reconciliation_checks`

Verified smoke run:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772125159/q1_daily_data_backbone_run_report.json`
- `ok = true`

Observed step timings (no-op delta scenario):
- delta ingest ~`4.239s` (cache hits, `selected_packs_total = 0`)
- incremental snapshot ~`0.655s`
- incremental feature ~`0.264s`
- reconciliation ~`0.155s`

## 14. Q1 local daily runner status [historical baseline entries]

Python orchestrator:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`

Shell wrapper:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.sh`

Launchd template:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/launchd/com.rubikvault.quantlab.q1panel-stagea.daily.plist.template`

Installed local LaunchAgent (active):
- `/Users/michaelpuchowezki/Library/LaunchAgents/com.rubikvault.quantlab.q1panel-stagea.daily.plist`

Current schedule:
- Daily at `07:45` local

Wrapper env defaults (current template):
- `Q1_DAILY_PANEL_MAX_ASSETS=0` (full panel)
- `Q1_DAILY_TOP_LIQUID_N=20000`
- `Q1_DAILY_RUN_STAGEB_PREP=1`
- `Q1_DAILY_RUN_STAGEB_Q1=1`
- `Q1_DAILY_RUN_REGISTRY_Q1=1`

Logs:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/`

Run status example:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772118921/q1_panel_stagea_daily_run_status.json`

## 15. Alt-assets pointer coverage (why non-stock/ETF is still thin)

Quant-side report script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/report_alt_assets_pointer_coverage_q1.py`

v7 report output:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/universe/v7/reports/quant_alt_assets_pointer_coverage_report.json`

Key finding:
- The bottleneck is v7 `history_pack` pointer coverage, not the Quant exporter.

Examples (see `totals` / `by_type` in report):
- `CRYPTO` has many rows but almost no `history_pack` pointers
- `FOREX/BOND/INDEX` similar problem
- `FUND` dominates non-stock/ETF counts and has mixed pointer coverage

## 16. What is done vs. not done (v4.0 checklist)

### Done (Q1/Q1.5)
- v7 history -> T9 Parquet exporter
- robust exporter writes + job lock
- materialized snapshot builder (bars dataset)
- contracted corp actions/delistings placeholders
- full multi-asof panel (stock+etf)
- chunked full panel builder
- persistent registry and bars index caches
- Stage A temporal fold runner
- Stage A scaling to 50k top-liquid
- Stage B prep
- Stage B light
- Stage B -> Registry/Champion bridge (Q1 local governance base)
- local daily runner + launchd activation
- Phase A backbone integrated into local daily runner (guardrailed, launchd-enabled)

### Not done yet (critical for true v4.0)
- daily delta ingest + incremental snapshot update (production-grade)
- incremental feature update (production-grade)
- real corp actions integration
- real delistings integration
- TRI_accounting and TRI_signal
- full Stage B (CPCV/Purging/Embargo + strict DSR/PSR)
- full registry/champion governance (live/shadow/retired/demotion ladder)
- portfolio/risk layer
- invalidation engine
- full test/invariant suite and red-flag reporting contract

## 17. Update protocol (must follow)

Whenever a meaningful Quant milestone is completed:
1. Append/change this file with:
   - exact script(s) used
   - exact artifact path(s)
   - exact counts / outputs
   - what is still missing
2. Update `03-critical-path-10-day-plan.md` if priorities shift
3. Do not write vague summaries without file paths

## 18. Known constraints / cautions

- Quant artifacts are local/private and should not be pushed to `main`.
- Website/UI experimental changes (Ideas tabs, live news/search) are separate and should stay isolated.
- Large generated datasets should stay off repo history (use T9/NAS and manifests).

## 19. External audit feedback (2026-02-26) — validation result and fixes

An external LLM audit flagged 6 correctness issues and 4 optimization items. We re-checked each claim against the current repo state.

### 19.1 Audit verdict (what was valid vs stale)

Result:
- `5/6` reported "correctness bugs" were **stale findings** (already fixed in current code).
- `1/6` was valid (Regime engine statefulness) and is now fixed in the active codebase.
- Several optimization/hardening suggestions were valid and have been incorporated into Q1 flows.

Stale findings (already fixed in current `build_feature_store_q1_panel.py`):
- RSI already uses Wilder-style EWM smoothing (not SMA)
- `ewma_vol_20/60` are EWM variance-based proxies (not plain rolling std)
- `vov_20` is based on `ewma_vol_20` (not price std)
- `dist_vwap_20` is an EOD volume-weighted proxy, not `sma_50`
- `fwd_ret_5d` null filtering is handled in Stage A, not globally in the panel builder

Valid finding (fixed):
- Regime engine was effectively stateless (`days_in_state`, `regime_flip_flag` placeholders)

### 19.2 Regime statefulness fix (applied)

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/build_regime_q1_min.py`

What changed:
- Timeseries now merges/updates by `date` (dedup-safe)
- `days_in_state` is computed from the historical sequence
- `regime_flips_lookback10` and `regime_flip_flag` are computed from the recent sequence
- report reflects true state values instead of hardcoded placeholders

### 19.3 Stage B de-proxy hardening (Q1 light, improved)

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`

Added/changed:
- fold policy validation artifact (`fold_policy_validation.json`)
- stress-lite candidate/fold scenario summaries
- bootstrap-based PSR/DSR proxy metrics (`psr_bootstrap_proxy`, `dsr_bootstrap_proxy`)
- stronger gate set (fold policy + stress-lite + bootstrap proxies)
- broader CPCV-light combinations (not just a single combo width)

Verified output (example):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=cheapgateA_tsplits_2026-02-23/outputs/stage_b_light/stage_b_light_report.json`

Observed fields present:
- `fold_policy_validation.ok = true`
- `stress_lite_summary`
- artifacts for fold/stress summaries are persisted and hash-referenced

### 19.4 Phase A backbone hardening (thresholds + ops metrics ledger)

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py`

Added:
- warning/fail thresholds for daily delta rows
- stronger reconciliation/accounting summary in backbone report
- append-only ops ledger for daily backbone metrics

Example behavior (expected strict fail on no-op delta):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest/runs/run_id=q1backbone_1772136573/q1_daily_data_backbone_run_report.json`
- `ok = false`, `exit_code = 91`
- `warnings = ['WARN_MIN_DELTA_ROWS:0<1000']`

Interpretation:
- the backbone no longer silently reports green under strict real-delta expectations.

### 19.5 Registry / governance auditability expansion (Q1)

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_registry_update_q1.py`

Added:
- `candidate_state_events_q1` SQLite table
- `candidate_state_events.ndjson` ledger
- `live/shadow/retired` state writes with standardized reason codes
- champion-slot demotion handling without promotion (audit event path)
- post-state-eval decision ledger refresh (reason codes / summary metrics corrected after demotion logic)

Verified example:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-23/q1_registry_update_report.json`

Notes:
- In the current run, no demotion event was emitted (`extra_events_written = 0`) because the champion remained `live`.
- The code path is implemented and exercised via integrated runner without runtime errors.

### 19.6 Integrated daily local runner (Phase A + Panel + Stage B + Registry) re-verified

Integrated success run after the registry state-event fix:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest/runs/run_id=q1panel_daily_local_1772136778/q1_panel_stagea_daily_run_status.json`

Result:
- `ok = true`
- steps green:
  - `run_q1_daily_data_backbone_q1`
  - `run_q1_panel_stage_a_pipeline`
  - `run_stage_b_q1`
  - `run_registry_update_q1`

This confirms the new Q1 hardening changes did not break the end-to-end local daily orchestration.

## 20. Overnight Q1 training sweep (local, resumable) — runner added

Purpose:
- use overnight compute on the Mac efficiently without touching API providers
- run repeated heavy Q1 slices (`panel -> Stage A -> Stage B Q1 -> registry`) over multiple `asof_date`, `panel_days`, and `top_liquid_n` combinations
- preserve resume state and per-task logs for morning review

Script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`

What it does:
- builds a deterministic task queue from recent panel `asof_date`s
- runs tasks sequentially (heaviest-first) with a global time budget (`--max-hours`)
- persists job state in:
  - `jobs/<job>/state.json`
- writes per-task logs and a driver log:
  - `jobs/<job>/logs/*.log`
- supports resume and retry:
  - `--resume-from`
  - `--retry-failed`
- includes robustness features:
  - per-job lock file (prevents accidental duplicate orchestrators)
  - resume recovery for `running` tasks (reset to pending on restart)
  - per-task timeout (`--task-timeout-minutes`) to avoid overnight hangs

Notes:
- Run via a persistent session (not shell background `nohup` in tool-managed shells), because tool wrappers may reap detached child processes.
- This is a compute/orchestration layer; it does not alter provider data or call external APIs.

### 20.1 Overnight sweep safe-mode hardening (freeze prevention)

Reason:
- the MacBook froze during a heavy overnight task (`p90/top50k`) and the original runner started with the heaviest task first.

Safety improvements added to:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`

Added safe controls:
- safer task ordering (`safe_light_first`) to warm caches before heavy tasks
- per-task niceness (`task_nice`) to reduce UI contention
- thread caps (`POLARS_MAX_THREADS`, BLAS/OpenMP caps)
- process-tree RSS watchdog (`max_rss_gib`) with kill-on-exceed
- periodic metrics logging (`rss_gib`, `peak_rss_gib`, elapsed)
- optional cooldown between tasks
- stop after consecutive failures

Validation:
- smoke test with forced timeout proved real RSS monitoring (not wrapper-process RSS):
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_smoketest_safe3/state.json`
  - `monitor.peak_rss_gib = 8.441`

Current overnight run (safe mode, started):
- job dir:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260226_2159`
- initial task:
  - `asof2026-02-17_p60_top20000` (safe-light-first)

Configured safe mode (current run):
- `task_order = safe_light_first`
- `threads_cap = 4`
- `max_rss_gib = 11.5`
- `task_nice = 15`
- `sleep_between_tasks_sec = 25`
- `stop_after_consecutive_failures = 2`
- `task_timeout_minutes = 210`

### 20.2 Morning check (2026-02-27 CET)

Overnight safe run status (current):
- job dir:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260226_2159`
- progress snapshot:
  - `done = 38`
  - `pending = 26`
  - `failed = 0`

Observed runtime issue:
- one running task (`asof2026-02-12_p90_top40000`) appears stalled (worker process alive, but no fresh monitor heartbeat for an extended period).
- this is an orchestration robustness issue, not a data-integrity failure.

Follow-up hardening target:
- add stale-heartbeat watchdog to the overnight runner (kill/retry task if monitor heartbeat exceeds a hard threshold).

Note:
- a state-summary consistency fix was added to the runner code so future resumes correctly reset stop flags and keep `running` counters accurate while tasks are active.

### 20.3 Overnight runner hardening v2 (stale heartbeat + auto-retry)

Updated script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`

New robustness controls:
- stale-heartbeat watchdog per task:
  - `--stale-heartbeat-minutes`
  - `--stale-min-elapsed-minutes`
  - `--stale-cpu-pct-max`
  - kills stale low-CPU tasks with exit code `142`
- auto-retry policy:
  - `--max-retries-per-task`
  - `--retry-cooldown-sec`
  - `--retryable-exit-codes` (default `124,137,142`)
- monitor now logs `cpu_pct`, `peak_cpu_pct`, and stale output age in driver log
- task attempt history persisted into `state.json` (`attempt_history`, `attempt_logs`)

Nightly repeatable launch wrapper added:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep_safe.sh`
- behavior:
  - auto-picks latest snapshot if `SNAPSHOT_ID` is not set
  - uses safe defaults (nice/thread cap/RSS cap/stale watchdog/retry)
  - suitable as standard nightly entry command

Nightly scheduler template added:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/launchd/com.rubikvault.quantlab.q1panel.overnight.safe.plist.template`

Smoke validation:
- plan mode:
  - `quantlab/.venv/bin/python scripts/quantlab/run_overnight_q1_training_sweep.py --quant-root /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab --snapshot-id 2026-02-26_670417f6fae7_q1step2bars --asof-dates-count 2 --panel-days-list 60 --top-liquid-list 20000 --plan-only`
  - result: tasks planned successfully (`tasks_total=2`)

### 20.4 Stage B de-proxy hardening (Q1 light stricter policy)

Updated script:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`

Changes:
- stricter fold-policy validation gates:
  - `fold_count_min`, `embargo_days_min`, `test_days_min`, `min_train_days_min`
- stronger CPCV-light robustness metrics:
  - supports `cpcv_light_min_combo_size`
  - adds `cpcv_light_sharpe_p25` and `cpcv_light_sharpe_p10`
- stricter gating additions:
  - `g_ic_fold_std`
  - `g_cpcv_light_sharpe_p25`
- stress-lite now includes `correlation_spike` scenario

Validation run:
- `quantlab/.venv/bin/python scripts/quantlab/run_stage_b_q1_light.py --quant-root /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab --stage-a-run-id cheapgateA_tsplits_2026-02-12 --strict-survivors-max 6`
- output report:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=cheapgateA_tsplits_2026-02-12/outputs/stage_b_light/stage_b_light_report.json`
- runtime status: command succeeded, stricter gates active, survivors in this sample run = `0` (expected with stricter thresholds).

### 20.5 Overnight orchestration guardrail: global lock (no parallel duplicates)

Updated:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep_safe.sh`

Change:
- new runner arg: `--global-lock-name` (default: `overnight_q1_training_sweep`)
- lock path:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/_locks/<name>.lock.json`
- behavior:
  - blocks startup if another live PID already holds the same named lock
  - prevents duplicate parallel overnight jobs with identical logical purpose
- resume semantics hardened:
  - when resuming with `--retry-failed`, failed tasks are reset to `attempts=0` before retry scheduling
  - avoids misleading `attempt=3/2` style counters after long-running resumes
- safe wrapper now always uses:
  - `--global-lock-name overnight_q1_training_sweep_safe`

### 20.6 Data-Truth contract-layer fix (no accidental overwrite to empty)

Updated:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/materialize_snapshot_contract_layers_q1.py`

Issue fixed:
- previous default behavior could overwrite existing `corp_actions.parquet` and `delistings.parquet` with empty placeholders.

New behavior:
- default is preserve-existing contract layers if files already exist.
- explicit empty rewrite is now opt-in only:
  - `--force-empty`
- contract manifest now records:
  - `source_mode` (`preserved_existing_snapshot_layer`, `empty_contracted_placeholder`, `repaired_to_empty_placeholder`)
  - actual row counts written into snapshot manifest.

Validation:
- run:
  - `quantlab/.venv/bin/python scripts/quantlab/materialize_snapshot_contract_layers_q1.py --quant-root /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab --snapshot-id 2026-02-26_670417f6fae7_q1step2bars`
- observed:
  - `corp_actions_rows=0 mode=preserved_existing_snapshot_layer`
  - `delistings_rows=0 mode=preserved_existing_snapshot_layer`
