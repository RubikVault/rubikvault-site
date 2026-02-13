# EXEC_SUMMARY

Generated: 2026-02-11T18:42:20Z

Top blockers: WAF/403 access, low-success core pipelines, v3 registry drift.

## Decision totals
- KEEP: 5
- REPAIR: 12
- ARCHIVE: 3
- DELETE: 0

## Priority totals
- P0: 7
- P1: 7
- P2: 1
- P3: 5

## Top 3 blockers
- `.github/workflows/eod-latest.yml`: GHA_ERROR: run	UNKNOWN STEP	2026-02-09T22:55:26.1445662Z ##[error]Process completed with exit code 1.
- `.github/workflows/forecast-daily.yml`: CIRCUIT_OPEN: Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9557662Z   ❌ CIRCUIT OPEN: Missing price data 80.7% exceeds threshold 5%
- `.github/workflows/monitor-prod.yml`: HTTP_CURL_22: liveness	Check required artifact endpoints	2026-02-11T06:55:40.0042455Z curl: (22) The requested URL returned error: 403

## Do this first
1. Fix WAF/403 path for scheduler/monitor.
2. Stabilize eod-latest and ops-daily with deterministic failure signatures.
3. Add/normalize writer concurrency + explicit permissions.