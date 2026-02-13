=== DIAGNOSIS: forecast-daily ===

## Workflow File
.github/workflows/forecast-daily.yml

## Script Paths
          node scripts/forecast/run_daily.mjs $DATE_ARG 2>&1 | tee pipeline.log
✅ EXISTS: scripts/forecast/run_daily.mjs

## Node Version
          node-version: ${{ env.NODE_VERSION }}

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
❌ NOT SET

## Recent Failure
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:46.6991395Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.8677300Z [36;1m  echo "status=failed" >> $GITHUB_OUTPUT[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.8708313Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9555524Z   Missing price data: 80.7%
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9557662Z   ❌ CIRCUIT OPEN: Missing price data 80.7% exceeds threshold 5%
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9636120Z ##[error]Process completed with exit code 1.
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:50.6811286Z [36;1m  echo "❌ Pipeline failed" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:50.6843328Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
