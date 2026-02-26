# Quant v4.0 Current State and Implementation Log (Living)

Last updated: 2026-02-26 (local branch state)
Branch context: `codex/v2-local-prep-20260222-165918`

This file is the "where are we exactly?" answer.
Update this file whenever a meaningful Quant milestone is completed.

## 1. Current completion estimate (simple)

Approximate v4.0 progress (overall):
- `35-45%` complete (overall v4.0 target architecture)

Breakdown (rough):
- Data format + storage foundation (Stocks+ETFs): `75-85%`
- Q1 quant backbone (panels + Stage A + Stage B prep/light): `60-70%`
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
- Manifest-level proof for both caches should be refreshed after a dedicated cache-hit build (see pending tasks below).

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
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=cheapgateA_tsplits_2026-02-17/outputs/stage_b_light/stage_b_light_report.json`
- `stage_b_light_candidates.parquet`
- `survivors_B_light.parquet`
- `fold_summary.parquet`

Current observed result (top50k stage-A context):
- `stage_a_candidates_total = 8`
- `stage_a_survivors_A_total = 1`
- `survivors_B_light_total = 1`

Important:
- This is not full v4.0 Stage B yet.
- It is a stronger Q1 bridge (PSR/DSR proxies + combinational robustness proxy).

## 9. Q1 local daily runner status

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

Logs:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/`

Run status example:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772118921/q1_panel_stagea_daily_run_status.json`

## 10. Alt-assets pointer coverage (why non-stock/ETF is still thin)

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

## 11. What is done vs. not done (v4.0 checklist)

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
- local daily runner + launchd activation

### Not done yet (critical for true v4.0)
- daily delta ingest + incremental snapshot update (production-grade)
- incremental feature update (production-grade)
- real corp actions integration
- real delistings integration
- TRI_accounting and TRI_signal
- full Stage B (CPCV/Purging/Embargo + strict DSR/PSR)
- registry/champion governance (live/shadow/retired)
- portfolio/risk layer
- invalidation engine
- full test/invariant suite and red-flag reporting contract

## 12. Update protocol (must follow)

Whenever a meaningful Quant milestone is completed:
1. Append/change this file with:
   - exact script(s) used
   - exact artifact path(s)
   - exact counts / outputs
   - what is still missing
2. Update `03-critical-path-10-day-plan.md` if priorities shift
3. Do not write vague summaries without file paths

## 13. Known constraints / cautions

- Quant artifacts are local/private and should not be pushed to `main`.
- Website/UI experimental changes (Ideas tabs, live news/search) are separate and should stay isolated.
- Large generated datasets should stay off repo history (use T9/NAS and manifests).

