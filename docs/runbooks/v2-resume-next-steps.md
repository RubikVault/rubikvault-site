# V2 Resume (Next 3 Days)

## Current Local State (as of last refresh)
- Phase 0 (report-only) is implemented and green.
- `resolved_missing_in_pack = 0`
- `truly_missing_total = 0`
- `synthetic_count_in_stock_analysis_snapshot = 0`
- Feature coverage is mostly aligned; remaining gap is primarily `<200 bars` history.

## Do Not Touch (during UI-only work)
- `scripts/**`
- `mirrors/**`
- `public/data/**` (read-only)
- workflow schedules / API ingestion settings

## First Steps When Resuming (Day 1)
1. Stay on branch: `codex/v2-local-prep-20260222-165918`
2. Re-run Phase 0 status refresh:
   - `node scripts/universe-v7/start-phase0-report-only.mjs`
3. Verify outputs:
   - `mirrors/system/run_status/latest.json`
   - `mirrors/universe-v7/revalidation/revalidation_snapshot.json`
4. Review and commit local data-quality fixes (Scientific + Marketphase deep)
5. Start v2.0 Phase 1 actual integration:
   - first real `clean-bars` consumer hook (small scope)
   - first real dropout-logger hook (report-only)

## Key Truth Sources (v7)
- `public/data/universe/v7/ssot/feature_stock_universe_report.json`
- `public/data/universe/v7/reports/feature_gap_reasons_summary.json`
- `public/data/universe/v7/reports/scientific_gap_reasons_summary.json`
- `public/data/universe/v7/reports/dropout_summary.json`
- `public/data/universe/v7/reports/forecast_pack_coverage.json`
- `public/data/universe/v7/reports/forecast_missing_in_pack_found_elsewhere_report.json`

## Notes
- Scientific "effective" and Scientific "ready" are not the same metric.
- Legacy marketphase files may still be needed for UI rendering, but are not the SSOT for universe counts.
