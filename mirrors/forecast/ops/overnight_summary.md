# Overnight Forecast Run Summary

- run_id: `20260206221832_16073_tqqqf0`
- head_sha: `cc5a434c`
- started_at: 2026-02-06T22:18:34.745Z
- ended_at: 2026-02-06T22:18:45.127Z
- duration_minutes: 0
- universe_count: 517

## Bars Backfill
- done: 0
- failed: 8
- missing_resolved: 0
- stale_resolved: 0
- fresh_skipped: 509
- resume_skipped: 0
- failed_tickers_top20: DAY, BRK.B, BF.B, FI, K, IPG, WBA, MMC

## Training (Per-Ticker)
- trained: 0
- skipped_insufficient_history: 0
- failed: 0
- resume_skipped: 0
- failed_tickers_top20: none

## Training (Global)
- success: false
- skipped: false
- reason: n/a

## Forecast Artifacts
- latest.json exists: false
- latest_report_ref exists: false
- registry valid: false

## Test Results
- validate:forecast-schemas: FAIL
- validate:forecast-registry: FAIL
- test:determinism: FAIL
- test:forecast-ui: FAIL

## Next Actions
- Rerun bars for failed tickers: `node scripts/forecast/run_overnight.mjs --phases=BARS --tickers=DAY,BRK.B,BF.B,FI,K,IPG,WBA,MMC`
- Rerun global training: `node scripts/forecast/run_overnight.mjs --phases=TRAIN_GLOBAL`
- Rerun UI smoke only: `npm run -s test:forecast-ui`

❌ FAILED
