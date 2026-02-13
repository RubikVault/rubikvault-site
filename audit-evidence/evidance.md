# Audit Evidence Consolidated

- Source root: /Users/michaelpuchowezki/Dev/rubikvault-site/audit-evidence
- Generated at (UTC): 2026-02-11T07:01:17Z
- Total files included: 91

## File Index
   1. README.txt
   2. classification/README.txt
   3. classification/workflow-categories.csv
   4. dependencies/README.txt
   5. dependencies/deletion-log.txt
   6. dependencies/deprecation-checklist.txt
   7. dependencies/deprecation-monitoring.txt
   8. dependencies/legacy-candidates.txt
   9. dependencies/orphan-candidates.txt
  10. dependencies/publish-lines.raw
  11. dependencies/publish-paths.txt
  12. dependencies/race-conditions.txt
  13. dependencies/reference-graph.csv
  14. inventory/README.txt
  15. inventory/action-pinning.txt
  16. inventory/actions-used.txt
  17. inventory/referenced-scripts.txt
  18. inventory/script-existence.txt
  19. inventory/workflow-file-count.txt
  20. inventory/workflow-files.txt
  21. inventory/workflow-metadata.txt
  22. reality/CI_Determinism_Check_runs.json
  23. reality/CI_Gates___Quality___Budget_Checks_runs.json
  24. reality/CI_Policy_Check_runs.json
  25. reality/Cleanup_Daily_Snapshots_runs.json
  26. reality/EOD_History_Refresh_runs.json
  27. reality/EOD_Latest__NASDAQ_100__runs.json
  28. reality/Forecast_Daily_Pipeline_runs.json
  29. reality/Forecast_Monthly_Report_runs.json
  30. reality/Forecast_Rollback_runs.json
  31. reality/Forecast_Weekly_Training_runs.json
  32. reality/Monitor_Production_Artifacts_runs.json
  33. reality/Ops_Auto_Alerts_runs.json
  34. reality/Ops_Daily_Snapshot_runs.json
  35. reality/README.txt
  36. reality/Refresh_Health_Assets_runs.json
  37. reality/Scheduler_Kick_runs.json
  38. reality/Universe_Refresh_runs.json
  39. reality/WP16_Manual___Market_Prices__Stooq__runs.json
  40. reality/e2e_playwright_runs.json
  41. reality/failure-logs/224941564_v3_Finalizer.log
  42. reality/failure-logs/225058763_v3_Scrape_Template.log
  43. reality/failure-logs/225061032_CI_Gates___Quality___Budget_Checks.log
  44. reality/failure-logs/226498514_WP16_Manual___Market_Prices__Stooq_.log
  45. reality/failure-logs/227442620_Ops_Daily_Snapshot.log
  46. reality/failure-logs/227511913_EOD_Latest__NASDAQ_100_.log
  47. reality/failure-logs/228731024_Scheduler_Kick.log
  48. reality/failure-logs/228798833_e2e_playwright.log
  49. reality/failure-logs/230643544_Forecast_Daily_Pipeline.log
  50. reality/failure-logs/230643545_Forecast_Monthly_Report.log
  51. reality/failure-logs/230903513_CI_Determinism_Check.log
  52. reality/failure-logs/230907136_Forecast_Rollback.log
  53. reality/failure-logs/232183192_Monitor_Production_Artifacts.log
  54. reality/runs_224941564.json
  55. reality/runs_225058763.json
  56. reality/runs_225061032.json
  57. reality/runs_225061033.json
  58. reality/runs_226498514.json
  59. reality/runs_227016585.json
  60. reality/runs_227442620.json
  61. reality/runs_227511913.json
  62. reality/runs_228731024.json
  63. reality/runs_228798833.json
  64. reality/runs_230643544.json
  65. reality/runs_230643545.json
  66. reality/runs_230643546.json
  67. reality/runs_230903513.json
  68. reality/runs_230903514.json
  69. reality/runs_230903515.json
  70. reality/runs_230907136.json
  71. reality/runs_230907137.json
  72. reality/runs_231381266.json
  73. reality/runs_232183192.json
  74. reality/stale-workflows.txt
  75. reality/success-rates.csv
  76. reality/v3_Finalizer_runs.json
  77. reality/v3_Scrape_Template_runs.json
  78. reality/workflow-map.tsv
  79. reality/workflows.json
  80. repairs/ci-determinism.md
  81. repairs/ci-gates.md
  82. repairs/e2e-playwright.md
  83. repairs/eod-latest.md
  84. repairs/forecast-daily.md
  85. repairs/monitor-prod.md
  86. repairs/ops-daily.md
  87. repairs/scheduler-kick.md
  88. repairs/v3-finalizer.md
  89. repairs/v3-scrape-template.md
  90. repairs/wp16-manual-market-prices.md
  91. runs/runs_.json

## Directory: README.txt

### File: README.txt
===== FILE: README.txt =====
Generated: 2026-02-10T22:49:56Z
inventory files: 8
reality files: 46
dependencies files: 10
classification files: 2
repairs files: 11

===== END FILE: README.txt =====

## Directory: classification

### File: classification/README.txt
===== FILE: classification/README.txt =====
Generated: classification
ACTIVE_HEALTHY: 5
ACTIVE_BROKEN: 8
STALE: 3
MANUAL_TOOL: 1
LEGACY: 0
DANGEROUS: 3

===== END FILE: classification/README.txt =====

### File: classification/workflow-categories.csv
===== FILE: classification/workflow-categories.csv =====
WORKFLOW,CATEGORY,PRIORITY,REASON
ci-determinism,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
ci-gates,DANGEROUS,P0,Broken + writes prod paths without concurrency
ci-policy,STALE,P2,Low activity or unclear status
cleanup-daily-snapshots,ACTIVE_HEALTHY,P3,"High success rate, recent runs"
e2e-playwright,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
eod-history-refresh,ACTIVE_HEALTHY,P3,"High success rate, recent runs"
eod-latest,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
forecast-daily,DANGEROUS,P0,Broken + writes prod paths without concurrency
forecast-monthly,STALE,P2,No runs in 30+ days
forecast-rollback,MANUAL_TOOL,P3,"Manual-only, infrequent use"
forecast-weekly,ACTIVE_HEALTHY,P3,"High success rate, recent runs"
monitor-prod,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
ops-auto-alerts,ACTIVE_HEALTHY,P3,"High success rate, recent runs"
ops-daily,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
refresh-health-assets,STALE,P2,Low activity or unclear status
scheduler-kick,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
universe-refresh,ACTIVE_HEALTHY,P3,"High success rate, recent runs"
v3-finalizer,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time
v3-scrape-template,DANGEROUS,P0,Broken + writes prod paths without concurrency
wp16-manual-market-prices,ACTIVE_BROKEN,P0,Runs regularly but fails >20% of time

===== END FILE: classification/workflow-categories.csv =====

## Directory: dependencies

### File: dependencies/README.txt
===== FILE: dependencies/README.txt =====
Generated: 2026-02-10T22:47:18Z
Reference rows: 20
Publish-path entries: 60
Orphan candidates: 4

===== END FILE: dependencies/README.txt =====

### File: dependencies/deletion-log.txt
===== FILE: dependencies/deletion-log.txt =====
No deletions performed.

===== END FILE: dependencies/deletion-log.txt =====

### File: dependencies/deprecation-checklist.txt
===== FILE: dependencies/deprecation-checklist.txt =====
No LEGACY workflows classified in this run.

===== END FILE: dependencies/deprecation-checklist.txt =====

### File: dependencies/deprecation-monitoring.txt
===== FILE: dependencies/deprecation-monitoring.txt =====
No LEGACY workflows to monitor for deletion.

===== END FILE: dependencies/deprecation-monitoring.txt =====

### File: dependencies/legacy-candidates.txt
===== FILE: dependencies/legacy-candidates.txt =====

===== END FILE: dependencies/legacy-candidates.txt =====

### File: dependencies/orphan-candidates.txt
===== FILE: dependencies/orphan-candidates.txt =====
ci-determinism
e2e-playwright
ops-auto-alerts
scheduler-kick

===== END FILE: dependencies/orphan-candidates.txt =====

### File: dependencies/publish-lines.raw
===== FILE: dependencies/publish-lines.raw =====
.github/workflows/refresh-health-assets.yml:40:          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json
.github/workflows/ci-gates.yml:6:      - 'public/data/**'
.github/workflows/ci-gates.yml:13:      - 'public/data/**'
.github/workflows/ci-gates.yml:29:            SENTINEL_PATH="public/data/.budget_sentinel.json"
.github/workflows/ci-gates.yml:64:          for module_dir in public/data/snapshots/*/; do
.github/workflows/ci-gates.yml:154:          if [ -f public/data/manifest.json ] && [ -f schemas/manifest.schema.json ]; then
.github/workflows/ci-gates.yml:156:            npx --yes ajv-cli@5 validate -s schemas/manifest.schema.json -d public/data/manifest.json
.github/workflows/ci-gates.yml:160:          if [ -f public/data/provider-state.json ] && [ -f schemas/provider-state.schema.json ]; then
.github/workflows/ci-gates.yml:162:            npx --yes ajv-cli@5 validate -s schemas/provider-state.schema.json -d public/data/provider-state.json
.github/workflows/ci-gates.yml:168:            for snapshot in public/data/snapshots/*/latest.json; do
.github/workflows/ci-gates.yml:186:          if [ -f public/data/manifest.json ]; then
.github/workflows/ci-gates.yml:187:            if ! jq empty public/data/manifest.json 2>/dev/null; then
.github/workflows/ci-gates.yml:194:              SCHEMA_VERSION=$(jq -r '.schema_version // "missing"' public/data/manifest.json)
.github/workflows/ci-gates.yml:200:              ACTIVE_BUILD_ID=$(jq -r '.active_build_id // "missing"' public/data/manifest.json)
.github/workflows/ci-gates.yml:209:          if [ -f public/data/provider-state.json ]; then
.github/workflows/ci-gates.yml:210:            if ! jq empty public/data/provider-state.json 2>/dev/null; then
.github/workflows/ci-gates.yml:221:          for snapshot in public/data/snapshots/*/latest.json; do
.github/workflows/ci-gates.yml:289:          if [ ! -f public/data/manifest.json ]; then
.github/workflows/ci-gates.yml:295:          PUBLISHED_MODULES=$(jq -r '.modules | to_entries | .[] | select(.value.published == true) | .key' public/data/manifest.json)
.github/workflows/ci-gates.yml:308:            MANIFEST_DIGEST=$(jq -r ".modules[\"$module\"].digest" public/data/manifest.json)
.github/workflows/ci-gates.yml:311:            SNAPSHOT_PATH="public/data/snapshots/$module/latest.json"
.github/workflows/ci-gates.yml:364:          if grep -nE '^(public/data/|mirrors/)$' .gitignore; then
.github/workflows/ci-gates.yml:365:            echo "❌ VIOLATION: .gitignore contains blanket ignore for public/data/ or mirrors/"
.github/workflows/forecast-monthly.yml:72:          git add public/data/forecast/reports/monthly/ || true
.github/workflows/forecast-weekly.yml:76:          git add mirrors/forecast/challengers/ || true
.github/workflows/forecast-weekly.yml:77:          git add mirrors/forecast/champion/ || true
.github/workflows/forecast-weekly.yml:78:          git add mirrors/forecast/ledger/promotions/ || true
.github/workflows/forecast-weekly.yml:79:          git add public/data/forecast/ || true
.github/workflows/wp16-manual-market-prices.yml:89:          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
.github/workflows/wp16-manual-market-prices.yml:90:          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true
.github/workflows/v3-scrape-template.yml:65:            const registry = require('./public/data/registry/modules.json');
.github/workflows/v3-finalizer.yml:171:            path="public/data/snapshots/${module}/latest.json"
.github/workflows/v3-finalizer.yml:209:          git add public/data/snapshots 2>/dev/null || echo "No snapshot files to add"
.github/workflows/v3-finalizer.yml:210:          git add public/data/state/modules/*.json 2>/dev/null || echo "No module state files to add"
.github/workflows/v3-finalizer.yml:211:          git add public/data/manifest.json 2>/dev/null || echo "No manifest to add"
.github/workflows/v3-finalizer.yml:212:          git add public/data/provider-state.json 2>/dev/null || echo "No provider-state to add"
.github/workflows/v3-finalizer.yml:243:          if [ -f public/data/manifest.json ]; then
.github/workflows/forecast-daily.yml:72:          git add mirrors/forecast/ledger/ || true
.github/workflows/forecast-daily.yml:73:          git add mirrors/forecast/snapshots/ || true
.github/workflows/forecast-daily.yml:74:          git add public/data/forecast/ || true
.github/workflows/eod-latest.yml:98:          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md
.github/workflows/universe-refresh.yml:35:          ls -la public/data/universe/
.github/workflows/universe-refresh.yml:38:          for f in public/data/universe/*.json; do
.github/workflows/universe-refresh.yml:47:          git add public/data/universe/
.github/workflows/forecast-rollback.yml:43:          cat > public/data/forecast/system/status.json << EOF
.github/workflows/forecast-rollback.yml:58:            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
.github/workflows/forecast-rollback.yml:65:          git add public/data/forecast
.github/workflows/ops-daily.yml:94:          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json
.github/workflows/ci-policy.yml:7:      - 'mirrors/forecast/**'
.github/workflows/eod-history-refresh.yml:34:          UNIVERSE_FILE="./public/data/universe/all.json"
.github/workflows/eod-history-refresh.yml:37:             UNIVERSE_FILE="./public/data/universe/nasdaq100.json"
.github/workflows/eod-history-refresh.yml:47:          git add public/data/eod/bars

===== END FILE: dependencies/publish-lines.raw =====

### File: dependencies/publish-paths.txt
===== FILE: dependencies/publish-paths.txt =====
.github/workflows/ci-policy.yml	mirrors/forecast/
.github/workflows/forecast-weekly.yml	mirrors/forecast/challengers/
.github/workflows/forecast-weekly.yml	mirrors/forecast/champion/
.github/workflows/forecast-daily.yml	mirrors/forecast/ledger/
.github/workflows/forecast-weekly.yml	mirrors/forecast/ledger/promotions/
.github/workflows/forecast-daily.yml	mirrors/forecast/snapshots/
.github/workflows/ci-gates.yml	public/data/.budget_sentinel.json
.github/workflows/refresh-health-assets.yml	public/data/blocks/health.latest.json
.github/workflows/eod-latest.yml	public/data/eod
.github/workflows/eod-history-refresh.yml	public/data/eod/bars
.github/workflows/forecast-rollback.yml	public/data/forecast
.github/workflows/forecast-daily.yml	public/data/forecast/
.github/workflows/forecast-weekly.yml	public/data/forecast/
.github/workflows/forecast-rollback.yml	public/data/forecast/latest.json
.github/workflows/forecast-monthly.yml	public/data/forecast/reports/monthly/
.github/workflows/forecast-rollback.yml	public/data/forecast/system/status.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/ci-gates.yml	public/data/manifest.json
.github/workflows/v3-finalizer.yml	public/data/manifest.json
.github/workflows/v3-finalizer.yml	public/data/manifest.json
.github/workflows/wp16-manual-market-prices.yml	public/data/manifest.json
.github/workflows/eod-latest.yml	public/data/ops
.github/workflows/ops-daily.yml	public/data/ops
.github/workflows/eod-latest.yml	public/data/ops-daily.json
.github/workflows/ops-daily.yml	public/data/ops-daily.json
.github/workflows/eod-latest.yml	public/data/pipeline
.github/workflows/ops-daily.yml	public/data/pipeline/
.github/workflows/ci-gates.yml	public/data/provider-state.json
.github/workflows/ci-gates.yml	public/data/provider-state.json
.github/workflows/ci-gates.yml	public/data/provider-state.json
.github/workflows/ci-gates.yml	public/data/provider-state.json
.github/workflows/v3-finalizer.yml	public/data/provider-state.json
.github/workflows/wp16-manual-market-prices.yml	public/data/provider-state.json
.github/workflows/v3-scrape-template.yml	public/data/registry/modules.json
.github/workflows/v3-finalizer.yml	public/data/snapshots
.github/workflows/wp16-manual-market-prices.yml	public/data/snapshots
.github/workflows/ci-gates.yml	public/data/snapshots/
.github/workflows/ci-gates.yml	public/data/snapshots/
.github/workflows/ci-gates.yml	public/data/snapshots/
.github/workflows/ci-gates.yml	public/data/snapshots/
.github/workflows/v3-finalizer.yml	public/data/snapshots/
.github/workflows/refresh-health-assets.yml	public/data/snapshots/health.json
.github/workflows/refresh-health-assets.yml	public/data/snapshots/health/latest.json
.github/workflows/wp16-manual-market-prices.yml	public/data/snapshots/market-prices/
.github/workflows/wp16-manual-market-prices.yml	public/data/snapshots/market-prices/latest.json
.github/workflows/v3-finalizer.yml	public/data/state/modules/
.github/workflows/wp16-manual-market-prices.yml	public/data/state/modules/
.github/workflows/refresh-health-assets.yml	public/data/system-health.json
.github/workflows/universe-refresh.yml	public/data/universe/
.github/workflows/universe-refresh.yml	public/data/universe/
.github/workflows/universe-refresh.yml	public/data/universe/
.github/workflows/eod-history-refresh.yml	public/data/universe/all.json
.github/workflows/eod-history-refresh.yml	public/data/universe/nasdaq100.json

===== END FILE: dependencies/publish-paths.txt =====

### File: dependencies/race-conditions.txt
===== FILE: dependencies/race-conditions.txt =====
=== POTENTIAL RACE CONDITIONS ===
PATH: public/data/forecast/
.github/workflows/forecast-daily.yml
.github/workflows/forecast-monthly.yml
.github/workflows/forecast-rollback.yml
.github/workflows/forecast-weekly.yml
  ⚠️ NO CONCURRENCY: forecast-daily.yml
  ⚠️ NO CONCURRENCY: forecast-monthly.yml
  ⚠️ NO CONCURRENCY: forecast-weekly.yml

PATH: public/data/manifest.json
.github/workflows/ci-gates.yml
.github/workflows/v3-finalizer.yml
.github/workflows/wp16-manual-market-prices.yml
  ⚠️ NO CONCURRENCY: ci-gates.yml

PATH: public/data/ops
.github/workflows/eod-latest.yml
.github/workflows/ops-daily.yml

PATH: public/data/ops-daily.json
.github/workflows/eod-latest.yml
.github/workflows/ops-daily.yml

PATH: public/data/provider-state.json
.github/workflows/ci-gates.yml
.github/workflows/v3-finalizer.yml
.github/workflows/wp16-manual-market-prices.yml
  ⚠️ NO CONCURRENCY: ci-gates.yml

PATH: public/data/snapshots
.github/workflows/ci-gates.yml
.github/workflows/refresh-health-assets.yml
.github/workflows/v3-finalizer.yml
.github/workflows/wp16-manual-market-prices.yml
  ⚠️ NO CONCURRENCY: ci-gates.yml
  ⚠️ NO CONCURRENCY: refresh-health-assets.yml

PATH: public/data/snapshots/
.github/workflows/ci-gates.yml
.github/workflows/refresh-health-assets.yml
.github/workflows/v3-finalizer.yml
.github/workflows/wp16-manual-market-prices.yml
  ⚠️ NO CONCURRENCY: ci-gates.yml
  ⚠️ NO CONCURRENCY: refresh-health-assets.yml

PATH: public/data/state/modules/
.github/workflows/v3-finalizer.yml
.github/workflows/wp16-manual-market-prices.yml

PATH: public/data/universe/
.github/workflows/eod-history-refresh.yml
.github/workflows/universe-refresh.yml
  ⚠️ NO CONCURRENCY: universe-refresh.yml


===== END FILE: dependencies/race-conditions.txt =====

### File: dependencies/reference-graph.csv
===== FILE: dependencies/reference-graph.csv =====
WORKFLOW,PUBLISHES,REQUIRES_SECRETS,CALLED_BY,CALLS_SCRIPTS
ci-determinism,"NONE","NONE","NONE","NONE"
ci-gates,"      - 'public/data/**';      - 'public/data/**';          mkdir -p public/data;          if ! find public/data -type f -name ""*.json"" -print -quit | grep -q .; then;            SENTINEL_PATH=""public/data/.budget_sentinel.json"";            echo ""ℹ️ Created budget sentinel at $SENTINEL_PATH (no tracked public/data json artifacts in checkout)"";          # Count files in public/data;          TOTAL_FILES=$(find public/data -type f -name ""*.json"" | wc -l | tr -d ' ');          LARGE_FILES=$(find public/data -type f -name ""*.json"" -size +${MAX_SIZE_MB}M || true);            find public/data -type f -name ""*.json"" -size +${MAX_SIZE_MB}M -exec ls -lh {} \;;          for module_dir in public/data/snapshots/*/; do;          TOTAL_SIZE=$(du -sb public/data 2>/dev/null | cut -f1 || true);            TOTAL_SIZE=$(du -sk public/data 2>/dev/null | awk '{print $1 * 1024}' || true);          if [ -f public/data/manifest.json ] && [ -f schemas/manifest.schema.json ]; then;            npx --yes ajv-cli@5 validate -s schemas/manifest.schema.json -d public/data/manifest.json;          if [ -f public/data/provider-state.json ] && [ -f schemas/provider-state.schema.json ]; then;            npx --yes ajv-cli@5 validate -s schemas/provider-state.schema.json -d public/data/provider-state.json;            for snapshot in public/data/snapshots/*/latest.json; do;          if [ -f public/data/manifest.json ]; then;            if ! jq empty public/data/manifest.json 2>/dev/null; then;              SCHEMA_VERSION=$(jq -r '.schema_version // ""missing""' public/data/manifest.json);              ACTIVE_BUILD_ID=$(jq -r '.active_build_id // ""missing""' public/data/manifest.json);          if [ -f public/data/provider-state.json ]; then;            if ! jq empty public/data/provider-state.json 2>/dev/null; then;          for snapshot in public/data/snapshots/*/latest.json; do;          if [ ! -f public/data/manifest.json ]; then;          PUBLISHED_MODULES=$(jq -r '.modules | to_entries | .[] | select(.value.published == true) | .key' public/data/manifest.json);            MANIFEST_DIGEST=$(jq -r "".modules[\""$module\""].digest"" public/data/manifest.json);            SNAPSHOT_PATH=""public/data/snapshots/$module/latest.json""; No blanket ignores for public/data or mirrors;          if grep -nE '^(public/data/|mirrors/)$' .gitignore; then; .gitignore contains blanket ignore for public/data/ or mirrors/"";","NONE","NONE","scripts/ci/verify-artifacts.mjs;scripts/ci/assert-mission-control-gate.mjs;scripts/ci/check-elliott-parity.mjs;scripts/ci/forbid-kv-writes-in-api.sh;scripts/eod/check-eod-artifacts.mjs;scripts/ops/validate-truth.sh;"
ci-policy,"      - 'mirrors/forecast/**';","NONE","NONE","scripts/forecast/validate_policy.mjs;"
cleanup-daily-snapshots,"          if git diff --quiet public/data; then;            git diff --stat public/data;          git add public/data;","NONE","NONE","NONE"
e2e-playwright,"NONE","NONE","NONE","NONE"
eod-history-refresh,"          UNIVERSE_FILE=""./public/data/universe/all.json"";             UNIVERSE_FILE=""./public/data/universe/nasdaq100.json"";          git add public/data/eod/bars;","EODHD_API_KEY;","NONE","scripts/providers/eodhd-backfill-bars.mjs;"
eod-latest," node scripts/eod/build-eod-latest.mjs --universe ""$RV_UNIVERSE"" --chunk-size 500 --out public/data;          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md;","GITHUB_TOKEN;TIIANGO_API_KEY;TIINGO_API_KEY;","NONE","scripts/ops/preflight-check.mjs;scripts/eod/build-eod-latest.mjs;scripts/ops/build-safety-snapshot.mjs;scripts/ops/build-mission-control-summary.mjs;scripts/ops/build-ops-pulse.mjs;scripts/ops/validate-ops-summary.mjs;scripts/ci/assert-mission-control-gate.mjs;"
forecast-daily,"          git add mirrors/forecast/ledger/ || true;          git add mirrors/forecast/snapshots/ || true;          git add public/data/forecast/ || true;","NONE","NONE","scripts/forecast/run_daily.mjs;"
forecast-monthly,"          git add public/data/forecast/reports/monthly/ || true;","NONE","NONE","scripts/forecast/run_monthly.mjs;"
forecast-rollback,"          cat > public/data/forecast/system/status.json << EOF;            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo ""Could not restore latest.json"";          git add public/data/forecast;","NONE","NONE","NONE"
forecast-weekly,"          git add mirrors/forecast/challengers/ || true;          git add mirrors/forecast/champion/ || true;          git add mirrors/forecast/ledger/promotions/ || true;          git add public/data/forecast/ || true;","NONE","NONE","scripts/forecast/run_weekly.mjs;"
monitor-prod,"          fetch_json ""$BASE_URL/data/snapshots/market-prices/latest.json"" /tmp/market_prices.json;          fetch_json ""$BASE_URL/data/forecast/latest.json"" /tmp/forecast_latest.json;          fetch_json ""$BASE_URL/data/forecast/system/status.json"" /tmp/forecast_status.json;          fetch_json ""$BASE_URL/data/marketphase/index.json"" /tmp/marketphase_index.json;          fetch_json ""$BASE_URL/data/ops/pulse.json"" /tmp/ops_pulse.json;          echo ""✅ /data/ops/pulse semantic checks passed"";          curl -fsS ""$BASE_URL/data/ops/pulse.json"" -o /tmp/ops_pulse.json;          curl -sS ""$BASE_URL/data/forecast/latest.json"" -o /tmp/forecast_latest.json;","NONE","NONE","NONE"
ops-auto-alerts,"NONE","NONE","NONE","NONE"
ops-daily,"          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json;","CF_ACCOUNT_ID;CF_API_TOKEN;GITHUB_TOKEN;","NONE","scripts/ops/preflight-check.mjs;scripts/pipeline/build-marketphase-from-kv.mjs;scripts/pipeline/build-ndx100-pipeline-truth.mjs;scripts/ops/build-safety-snapshot.mjs;scripts/ops/build-ops-daily.mjs;scripts/ops/build-mission-control-summary.mjs;scripts/ops/build-ops-pulse.mjs;scripts/ops/validate-ops-summary.mjs;scripts/ci/assert-mission-control-gate.mjs;"
refresh-health-assets,"          if git diff --quiet public/data; then;          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json;","GITHUB_TOKEN;","NONE","scripts/refresh-health-assets.mjs;"
scheduler-kick,"NONE","RV_ADMIN_TOKEN;","NONE","NONE"
universe-refresh,"          ls -la public/data/universe/;          for f in public/data/universe/*.json; do;          git add public/data/universe/;","EODHD_API_KEY;","NONE","scripts/universe/fetch-constituents.mjs;"
v3-finalizer,"            path=""public/data/snapshots/${module}/latest.json"";          if git diff --quiet public/data; then;            git diff --stat public/data;          git add public/data/snapshots 2>/dev/null || echo ""No snapshot files to add"";          git add public/data/state/modules/*.json 2>/dev/null || echo ""No module state files to add"";          git add public/data/manifest.json 2>/dev/null || echo ""No manifest to add"";          git add public/data/provider-state.json 2>/dev/null || echo ""No provider-state to add"";          if [ -f public/data/manifest.json ]; then;","GITHUB_TOKEN;","NONE","scripts/aggregator/finalize.mjs;scripts/wp16/guard-market-prices.mjs;"
v3-scrape-template,"            const registry = require('./public/data/registry/modules.json');;","ALPHAVANTAGE_API_KEY;FINNHUB_API_KEY;FMP_API_KEY;FRED_API_KEY;POLYGON_API_KEY;TWELVEDATA_API_KEY;","NONE","scripts/providers/market-prices-v3.mjs;scripts/providers/market-stats-v3.mjs;scripts/aggregator/finalize.mjs;"
wp16-manual-market-prices,"          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true;          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true;","GITHUB_TOKEN;","NONE","scripts/providers/market-prices-v3.mjs;scripts/aggregator/finalize.mjs;scripts/wp16/guard-market-prices.mjs;"

===== END FILE: dependencies/reference-graph.csv =====

## Directory: inventory

### File: inventory/README.txt
===== FILE: inventory/README.txt =====
Generated: 2026-02-10T22:44:27Z
Workflow files: 20
Referenced scripts: 26
Actions used: 5

===== END FILE: inventory/README.txt =====

### File: inventory/action-pinning.txt
===== FILE: inventory/action-pinning.txt =====
=== ACTION PINNING STATUS ===
⚠️  TAG-ONLY: actions/checkout@v4
⚠️  TAG-ONLY: actions/github-script@v7
⚠️  TAG-ONLY: actions/setup-node@v4
⚠️  TAG-ONLY: actions/upload-artifact@v4
⚠️  TAG-ONLY: dawidd6/action-download-artifact@v6
⚠️  TAG-ONLY: - actions/checkout@v4
⚠️  TAG-ONLY: - actions/setup-node@v4

===== END FILE: inventory/action-pinning.txt =====

### File: inventory/actions-used.txt
===== FILE: inventory/actions-used.txt =====
        actions/checkout@v4
        actions/github-script@v7
        actions/setup-node@v4
        actions/upload-artifact@v4
        dawidd6/action-download-artifact@v6
      - actions/checkout@v4
      - actions/setup-node@v4

===== END FILE: inventory/actions-used.txt =====

### File: inventory/referenced-scripts.txt
===== FILE: inventory/referenced-scripts.txt =====

scripts/aggregator/finalize.mjs
scripts/forecast/run_daily.mjs
scripts/forecast/run_monthly.mjs
scripts/forecast/run_weekly.mjs
scripts/forecast/validate_policy.mjs
scripts/providers/eodhd-backfill-bars.mjs
scripts/providers/market-prices-v3.mjs
scripts/providers/market-stats-v3.mjs
scripts/wp16/guard-market-prices.mjs

===== END FILE: inventory/referenced-scripts.txt =====

### File: inventory/script-existence.txt
===== FILE: inventory/script-existence.txt =====
✅ scripts/aggregator/finalize.mjs
✅ scripts/ci/assert-mission-control-gate.mjs
✅ scripts/ci/check-elliott-parity.mjs
✅ scripts/ci/forbid-kv-writes-in-api.sh
✅ scripts/ci/verify-artifacts.mjs
✅ scripts/eod/build-eod-latest.mjs
✅ scripts/eod/check-eod-artifacts.mjs
✅ scripts/forecast/run_daily.mjs
✅ scripts/forecast/run_monthly.mjs
✅ scripts/forecast/run_weekly.mjs
✅ scripts/forecast/validate_policy.mjs
✅ scripts/ops/build-mission-control-summary.mjs
✅ scripts/ops/build-ops-daily.mjs
✅ scripts/ops/build-ops-pulse.mjs
✅ scripts/ops/build-safety-snapshot.mjs
✅ scripts/ops/preflight-check.mjs
✅ scripts/ops/validate-ops-summary.mjs
✅ scripts/ops/validate-truth.sh
✅ scripts/pipeline/build-marketphase-from-kv.mjs
✅ scripts/pipeline/build-ndx100-pipeline-truth.mjs
✅ scripts/providers/eodhd-backfill-bars.mjs
✅ scripts/providers/market-prices-v3.mjs
✅ scripts/providers/market-stats-v3.mjs
✅ scripts/refresh-health-assets.mjs
✅ scripts/universe/fetch-constituents.mjs
✅ scripts/wp16/guard-market-prices.mjs
❌ MISSING: 
✅ scripts/aggregator/finalize.mjs
✅ scripts/forecast/run_daily.mjs
✅ scripts/forecast/run_monthly.mjs
✅ scripts/forecast/run_weekly.mjs
✅ scripts/forecast/validate_policy.mjs
✅ scripts/providers/eodhd-backfill-bars.mjs
✅ scripts/providers/market-prices-v3.mjs
✅ scripts/providers/market-stats-v3.mjs
✅ scripts/wp16/guard-market-prices.mjs
❌ MISSING: 
✅ scripts/aggregator/finalize.mjs
✅ scripts/forecast/run_daily.mjs
✅ scripts/forecast/run_monthly.mjs
✅ scripts/forecast/run_weekly.mjs
✅ scripts/forecast/validate_policy.mjs
✅ scripts/providers/eodhd-backfill-bars.mjs
✅ scripts/providers/market-prices-v3.mjs
✅ scripts/providers/market-stats-v3.mjs
✅ scripts/wp16/guard-market-prices.mjs

===== END FILE: inventory/script-existence.txt =====

### File: inventory/workflow-file-count.txt
===== FILE: inventory/workflow-file-count.txt =====
      20 audit-evidence/inventory/workflow-files.txt

===== END FILE: inventory/workflow-file-count.txt =====

### File: inventory/workflow-files.txt
===== FILE: inventory/workflow-files.txt =====
.github/workflows/ci-determinism.yml
.github/workflows/ci-gates.yml
.github/workflows/ci-policy.yml
.github/workflows/cleanup-daily-snapshots.yml
.github/workflows/e2e-playwright.yml
.github/workflows/eod-history-refresh.yml
.github/workflows/eod-latest.yml
.github/workflows/forecast-daily.yml
.github/workflows/forecast-monthly.yml
.github/workflows/forecast-rollback.yml
.github/workflows/forecast-weekly.yml
.github/workflows/monitor-prod.yml
.github/workflows/ops-auto-alerts.yml
.github/workflows/ops-daily.yml
.github/workflows/refresh-health-assets.yml
.github/workflows/scheduler-kick.yml
.github/workflows/universe-refresh.yml
.github/workflows/v3-finalizer.yml
.github/workflows/v3-scrape-template.yml
.github/workflows/wp16-manual-market-prices.yml

===== END FILE: inventory/workflow-files.txt =====

### File: inventory/workflow-metadata.txt
===== FILE: inventory/workflow-metadata.txt =====
=== ci-determinism.yml ===
TRIGGERS:
on:
  push:
    paths:
      - 'scripts/forecast/**'
      - 'tests/determinism/**'
  pull_request:
    paths:
      - 'scripts/forecast/**'
      - 'tests/determinism/**'
  workflow_dispatch:

concurrency:
  group: forecast-determinism-${{ github.ref }}
  cancel-in-progress: true

env:
  # MEM v1.2 Determinism: Lock threads for reproducible runs
  OMP_NUM_THREADS: '1'
  MKL_NUM_THREADS: '1'
  OPENBLAS_NUM_THREADS: '1'

SCRIPTS:
        run: npm ci
        run: npm run test:determinism
        run: npm run validate:forecast-registry
        run: npm run validate:forecast-schemas
PERMISSIONS:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-determinism-${{ github.ref }}
  cancel-in-progress: true

env:
PUBLISHES:

=== ci-gates.yml ===
TRIGGERS:
on:
  pull_request:
    paths:
      - 'public/data/**'
      - 'scripts/**'
      - '.github/workflows/**'
  push:
    branches:
      - main
    paths:
      - 'public/data/**'
      - 'scripts/**'

jobs:
  asset-budget:
    name: Asset Budget Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

SCRIPTS:
        run: npm ci
        run: node scripts/ci/verify-artifacts.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
        run: node scripts/ci/check-elliott-parity.mjs
        run: bash scripts/ci/forbid-kv-writes-in-api.sh
        run: npm run test:contracts
        run: node scripts/eod/check-eod-artifacts.mjs
        run: npm ci
        run: bash scripts/ops/validate-truth.sh
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
      - 'public/data/**'
      - 'public/data/**'
          mkdir -p public/data
          if ! find public/data -type f -name "*.json" -print -quit | grep -q .; then
            SENTINEL_PATH="public/data/.budget_sentinel.json"
            echo "ℹ️ Created budget sentinel at $SENTINEL_PATH (no tracked public/data json artifacts in checkout)"
          # Count files in public/data
          TOTAL_FILES=$(find public/data -type f -name "*.json" | wc -l | tr -d ' ')
          LARGE_FILES=$(find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M || true)
            find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M -exec ls -lh {} \;
          for module_dir in public/data/snapshots/*/; do
          TOTAL_SIZE=$(du -sb public/data 2>/dev/null | cut -f1 || true)
            TOTAL_SIZE=$(du -sk public/data 2>/dev/null | awk '{print $1 * 1024}' || true)
          if [ -f public/data/manifest.json ] && [ -f schemas/manifest.schema.json ]; then
            npx --yes ajv-cli@5 validate -s schemas/manifest.schema.json -d public/data/manifest.json
          if [ -f public/data/provider-state.json ] && [ -f schemas/provider-state.schema.json ]; then
            npx --yes ajv-cli@5 validate -s schemas/provider-state.schema.json -d public/data/provider-state.json
            for snapshot in public/data/snapshots/*/latest.json; do
          if [ -f public/data/manifest.json ]; then
            if ! jq empty public/data/manifest.json 2>/dev/null; then
              SCHEMA_VERSION=$(jq -r '.schema_version // "missing"' public/data/manifest.json)
              ACTIVE_BUILD_ID=$(jq -r '.active_build_id // "missing"' public/data/manifest.json)
          if [ -f public/data/provider-state.json ]; then
            if ! jq empty public/data/provider-state.json 2>/dev/null; then
          for snapshot in public/data/snapshots/*/latest.json; do
          if [ ! -f public/data/manifest.json ]; then
          PUBLISHED_MODULES=$(jq -r '.modules | to_entries | .[] | select(.value.published == true) | .key' public/data/manifest.json)
            MANIFEST_DIGEST=$(jq -r ".modules[\"$module\"].digest" public/data/manifest.json)
            SNAPSHOT_PATH="public/data/snapshots/$module/latest.json"
          # Check: No blanket ignores for public/data or mirrors
          if grep -nE '^(public/data/|mirrors/)$' .gitignore; then
            echo "❌ VIOLATION: .gitignore contains blanket ignore for public/data/ or mirrors/"

=== ci-policy.yml ===
TRIGGERS:
on:
  push:
    paths:
      - 'policies/**'
      - 'mirrors/forecast/**'
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: true

jobs:
  validate-policy:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
SCRIPTS:
PERMISSIONS:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: true

jobs:
PUBLISHES:
      - 'mirrors/forecast/**'

=== cleanup-daily-snapshots.yml ===
TRIGGERS:
on:
  schedule:
    # Run weekly on Sundays at 02:00 UTC
    - cron: "0 2 * * 0"
  workflow_dispatch:
    inputs:
      days_to_keep:
        description: 'Days to keep (default: 7)'
        required: false
        default: '7'
      dry_run:
        description: 'Dry run (true/false)'
        required: false
        default: 'false'

jobs:
  cleanup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
SCRIPTS:
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run Cleanup Script
        env:
          DAYS_TO_KEEP: ${{ github.event.inputs.days_to_keep || '7' }}
SECRETS:
CONCURRENCY:
PUBLISHES:
          if git diff --quiet public/data; then
            git diff --stat public/data
          git add public/data

=== e2e-playwright.yml ===
TRIGGERS:
on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  ops-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      BASE_URL: ${{ vars.PREVIEW_BASE || vars.RV_PROD_BASE || 'https://rubikvault.com' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
SCRIPTS:
        run: npm ci
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:

=== eod-history-refresh.yml ===
TRIGGERS:
on:
  schedule:
    - cron: '20 21 * * 1-5' # 21:20 UTC, Mon-Fri (After market close)
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  refresh-history:
    runs-on: ubuntu-latest
    timeout-minutes: 120  # Increased for ~520 symbols
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
SCRIPTS:
        run: npm ci || npm install node-fetch
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
SECRETS:
          EODHD_API_KEY: ${{ secrets.EODHD_API_KEY }}
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
PUBLISHES:
          UNIVERSE_FILE="./public/data/universe/all.json"
             UNIVERSE_FILE="./public/data/universe/nasdaq100.json"
          git add public/data/eod/bars

=== eod-latest.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "10 22 * * 1-5"
  workflow_dispatch:
    inputs:
      universe:
        description: "Universe"
        default: "nasdaq100"
        required: false

permissions:
  contents: write

concurrency:
  group: eod-latest
  cancel-in-progress: true

jobs:
  dry-run:
    name: EOD Latest Dry-Run (no secrets)
    if: ${{ vars.RV_CI_MODE == 'dry' }}
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
        run: npm ci
        run: node scripts/ops/preflight-check.mjs --mode eod-latest
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
        run: node scripts/ops/build-safety-snapshot.mjs
        run: npm run rv:ops
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: eod-latest
  cancel-in-progress: true

jobs:
  dry-run:
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
          if [ -n "${{ secrets.TIINGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIINGO_API_KEY }}" >> "$GITHUB_ENV"
          elif [ -n "${{ secrets.TIIANGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIIANGO_API_KEY }}" >> "$GITHUB_ENV"
CONCURRENCY:
concurrency:
  group: eod-latest
  cancel-in-progress: true

jobs:
PUBLISHES:
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md

=== forecast-daily.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      date:
        description: 'Trading date (YYYY-MM-DD), empty for auto'
        required: false
        type: string
  schedule:
    # Run at 21:00 UTC (16:00 ET after market close)
    - cron: '0 21 * * 1-5'

defaults:
  run:
    shell: bash

env:
  NODE_VERSION: '20'
  # MEM v1.2 Determinism: Lock threads for reproducible runs
  OMP_NUM_THREADS: '1'
  MKL_NUM_THREADS: '1'
  OPENBLAS_NUM_THREADS: '1'
SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add mirrors/forecast/ledger/ || true
          git add mirrors/forecast/snapshots/ || true
          git add public/data/forecast/ || true
        uses: actions/upload-artifact@v4

=== forecast-monthly.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      month:
        description: 'Month (YYYY-MM), empty for previous month'
        required: false
        type: string
  schedule:
    # Run 1st of each month at 08:00 UTC
    - cron: '0 8 1 * *'

defaults:
  run:
    shell: bash

env:
  NODE_VERSION: '20'

jobs:
  forecast-monthly:
    name: 'Monthly Report Generation'
SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add public/data/forecast/reports/monthly/ || true
        uses: actions/upload-artifact@v4

=== forecast-rollback.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for rollback (required)'
        required: true
        type: string
      target_commit:
        description: 'Target commit SHA to rollback to (optional, defaults to last_good)'
        required: false
        type: string

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  rollback:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
SCRIPTS:
PERMISSIONS:
    permissions:
      contents: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
PUBLISHES:
          cat > public/data/forecast/system/status.json << EOF
            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
          git add public/data/forecast

=== forecast-weekly.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      date:
        description: 'Trading date (YYYY-MM-DD), empty for auto'
        required: false
        type: string
  schedule:
    # Run Sundays at 06:00 UTC
    - cron: '0 6 * * 0'

defaults:
  run:
    shell: bash

env:
  NODE_VERSION: '20'

jobs:
  forecast-weekly:
    name: 'Weekly Challenger Training'
SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add mirrors/forecast/challengers/ || true
          git add mirrors/forecast/champion/ || true
          git add mirrors/forecast/ledger/promotions/ || true
          git add public/data/forecast/ || true
        uses: actions/upload-artifact@v4

=== monitor-prod.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "0 6,18 * * *"
  workflow_dispatch:

jobs:
  liveness:
    runs-on: ubuntu-latest
    steps:
      - name: Ensure jq
        run: |
          if ! command -v jq >/dev/null 2>&1; then
            sudo apt-get update
            sudo apt-get install -y jq
          fi
          jq --version

      - name: Check required artifact endpoints
        env:
          BASE_URL: https://rubikvault.com
          MIN_MARKET_PRICE_ROWS: "517"
SCRIPTS:
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          fetch_json "$BASE_URL/data/snapshots/market-prices/latest.json" /tmp/market_prices.json
          fetch_json "$BASE_URL/data/forecast/latest.json" /tmp/forecast_latest.json
          fetch_json "$BASE_URL/data/forecast/system/status.json" /tmp/forecast_status.json
          fetch_json "$BASE_URL/data/marketphase/index.json" /tmp/marketphase_index.json
          fetch_json "$BASE_URL/data/ops/pulse.json" /tmp/ops_pulse.json
          echo "✅ /data/ops/pulse semantic checks passed"
          curl -fsS "$BASE_URL/data/ops/pulse.json" -o /tmp/ops_pulse.json
          curl -sS "$BASE_URL/data/forecast/latest.json" -o /tmp/forecast_latest.json

=== ops-auto-alerts.yml ===
TRIGGERS:
on:
  schedule:
    - cron: '0 22 * * 1-5' # Daily after market close
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  check-alerts:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
SCRIPTS:
PERMISSIONS:
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
PUBLISHES:

=== ops-daily.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "5 7 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true

jobs:
  dry-run:
    name: Ops Daily Dry-Run (no secrets)
    if: ${{ vars.RV_CI_MODE == 'dry' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
        run: npm ci
        run: node scripts/ops/preflight-check.mjs --mode ops-daily
        run: node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100
        run: node scripts/pipeline/build-ndx100-pipeline-truth.mjs
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-ops-daily.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true

jobs:
  dry-run:
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
CONCURRENCY:
concurrency:
  group: ops-daily
  cancel-in-progress: true

jobs:
PUBLISHES:
          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json

=== refresh-health-assets.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: "${{ secrets.GITHUB_TOKEN }}"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
SCRIPTS:
        run: npm ci
        run: node scripts/refresh-health-assets.mjs
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: "${{ secrets.GITHUB_TOKEN }}"

      - name: Setup Node
SECRETS:
          token: "${{ secrets.GITHUB_TOKEN }}"
CONCURRENCY:
PUBLISHES:
          if git diff --quiet public/data; then
          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json

=== scheduler-kick.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "15 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
    if: ${{ vars.RV_CI_MODE == 'dry' || vars.RV_PROD_BASE == '' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
PERMISSIONS:
permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
    if: ${{ vars.RV_CI_MODE == 'dry' || vars.RV_PROD_BASE == '' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
SECRETS:
          RV_ADMIN_TOKEN: ${{ secrets.RV_ADMIN_TOKEN }}
CONCURRENCY:
PUBLISHES:

=== universe-refresh.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      indices:
        description: 'Which indices to fetch (all, sp500, nasdaq100, dowjones, russell2000)'
        required: false
        default: 'all'

jobs:
  fetch-constituents:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
SCRIPTS:
        run: node scripts/universe/fetch-constituents.mjs
PERMISSIONS:
    permissions:
      contents: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
SECRETS:
          EODHD_API_KEY: ${{ secrets.EODHD_API_KEY }}
CONCURRENCY:
PUBLISHES:
          ls -la public/data/universe/
          for f in public/data/universe/*.json; do
          git add public/data/universe/

=== v3-finalizer.yml ===
TRIGGERS:
on:
  workflow_run:
    workflows: 
      - "v3 Pilot - Market Health"
      - "v3 Scrape Template"
    types:
      - completed
  workflow_dispatch:
    inputs:
      artifact_name:
        description: 'Artifact name to finalize (default: all)'
        required: false
        default: ''
      skip_kv_write:
        description: 'Skip KV writes (for testing)'
        required: false
        default: 'false'

jobs:
  finalize:
    runs-on: ubuntu-latest
SCRIPTS:
        run: npm ci
PERMISSIONS:
    permissions:
      contents: write
      actions: read
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
CONCURRENCY:
    concurrency:
      group: rv-finalizer
      cancel-in-progress: true
    
    permissions:
PUBLISHES:
            path="public/data/snapshots/${module}/latest.json"
          if git diff --quiet public/data; then
            git diff --stat public/data
          git add public/data/snapshots 2>/dev/null || echo "No snapshot files to add"
          git add public/data/state/modules/*.json 2>/dev/null || echo "No module state files to add"
          git add public/data/manifest.json 2>/dev/null || echo "No manifest to add"
          git add public/data/provider-state.json 2>/dev/null || echo "No provider-state to add"
          if [ -f public/data/manifest.json ]; then

=== v3-scrape-template.yml ===
TRIGGERS:
on:
  schedule:
    # Run at 22:30 UTC on market days
    - cron: "30 22 * * 1-5"
  workflow_dispatch:
    inputs:
      modules:
        description: 'Modules to scrape (comma-separated, or "all")'
        required: false
        default: 'all'

jobs:
  # Determine which modules to scrape
  prepare:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      matrix: ${{ steps.set-matrix.outputs.matrix }}
    steps:
      - name: "WP16 DEBUG: dump market-prices artifacts"
        if: always()
SCRIPTS:
        run: npm ci
        run: npm ci
PERMISSIONS:
    permissions:
      contents: read
      actions: read
    
    strategy:
      matrix: ${{ fromJson(needs.prepare.outputs.matrix) }}
      fail-fast: false  # Continue even if one module fails
      max-parallel: 5   # Limit parallel jobs to avoid rate limits
    
SECRETS:
          POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
          ALPHAVANTAGE_API_KEY: ${{ secrets.ALPHAVANTAGE_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          TWELVEDATA_API_KEY: ${{ secrets.TWELVEDATA_API_KEY }}
CONCURRENCY:
PUBLISHES:
            const registry = require('./public/data/registry/modules.json');
        uses: actions/upload-artifact@v4

=== wp16-manual-market-prices.yml ===
TRIGGERS:
SCRIPTS:
        run: npm ci
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true

jobs:
  run:
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
CONCURRENCY:
concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true

jobs:
PUBLISHES:
          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true

=== ci-determinism.yml ===
TRIGGERS:
on:
  push:
    paths:
      - 'scripts/forecast/**'
      - 'tests/determinism/**'
  pull_request:
    paths:
      - 'scripts/forecast/**'
      - 'tests/determinism/**'
  workflow_dispatch:

SCRIPTS:
        run: npm ci
        run: npm run test:determinism
        run: npm run validate:forecast-registry
        run: npm run validate:forecast-schemas
PERMISSIONS:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-determinism-${{ github.ref }}
  cancel-in-progress: true

PUBLISHES:

=== ci-gates.yml ===
TRIGGERS:
on:
  pull_request:
    paths:
      - 'public/data/**'
      - 'scripts/**'
      - '.github/workflows/**'
  push:
    branches:
      - main
    paths:
      - 'public/data/**'
SCRIPTS:
        run: npm ci
        run: node scripts/ci/verify-artifacts.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
        run: node scripts/ci/check-elliott-parity.mjs
        run: bash scripts/ci/forbid-kv-writes-in-api.sh
        run: npm run test:contracts
        run: node scripts/eod/check-eod-artifacts.mjs
        run: npm ci
        run: bash scripts/ops/validate-truth.sh
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
      - 'public/data/**'
      - 'public/data/**'
          mkdir -p public/data
          if ! find public/data -type f -name "*.json" -print -quit | grep -q .; then
            SENTINEL_PATH="public/data/.budget_sentinel.json"
            echo "ℹ️ Created budget sentinel at $SENTINEL_PATH (no tracked public/data json artifacts in checkout)"
          # Count files in public/data
          TOTAL_FILES=$(find public/data -type f -name "*.json" | wc -l | tr -d ' ')
          LARGE_FILES=$(find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M || true)
            find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M -exec ls -lh {} \;
          for module_dir in public/data/snapshots/*/; do
          TOTAL_SIZE=$(du -sb public/data 2>/dev/null | cut -f1 || true)
            TOTAL_SIZE=$(du -sk public/data 2>/dev/null | awk '{print $1 * 1024}' || true)
          if [ -f public/data/manifest.json ] && [ -f schemas/manifest.schema.json ]; then
            npx --yes ajv-cli@5 validate -s schemas/manifest.schema.json -d public/data/manifest.json
          if [ -f public/data/provider-state.json ] && [ -f schemas/provider-state.schema.json ]; then
            npx --yes ajv-cli@5 validate -s schemas/provider-state.schema.json -d public/data/provider-state.json
            for snapshot in public/data/snapshots/*/latest.json; do
          if [ -f public/data/manifest.json ]; then
            if ! jq empty public/data/manifest.json 2>/dev/null; then
              SCHEMA_VERSION=$(jq -r '.schema_version // "missing"' public/data/manifest.json)
              ACTIVE_BUILD_ID=$(jq -r '.active_build_id // "missing"' public/data/manifest.json)
          if [ -f public/data/provider-state.json ]; then
            if ! jq empty public/data/provider-state.json 2>/dev/null; then
          for snapshot in public/data/snapshots/*/latest.json; do
          if [ ! -f public/data/manifest.json ]; then
          PUBLISHED_MODULES=$(jq -r '.modules | to_entries | .[] | select(.value.published == true) | .key' public/data/manifest.json)
            MANIFEST_DIGEST=$(jq -r ".modules[\"$module\"].digest" public/data/manifest.json)
            SNAPSHOT_PATH="public/data/snapshots/$module/latest.json"
          # Check: No blanket ignores for public/data or mirrors
          if grep -nE '^(public/data/|mirrors/)$' .gitignore; then
            echo "❌ VIOLATION: .gitignore contains blanket ignore for public/data/ or mirrors/"

=== ci-policy.yml ===
TRIGGERS:
on:
  push:
    paths:
      - 'policies/**'
      - 'mirrors/forecast/**'
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: true

SCRIPTS:
PERMISSIONS:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: true

PUBLISHES:
      - 'mirrors/forecast/**'

=== cleanup-daily-snapshots.yml ===
TRIGGERS:
on:
  schedule:
    # Run weekly on Sundays at 02:00 UTC
    - cron: "0 2 * * 0"
  workflow_dispatch:
    inputs:
      days_to_keep:
        description: 'Days to keep (default: 7)'
        required: false
        default: '7'
      dry_run:
SCRIPTS:
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

SECRETS:
CONCURRENCY:
PUBLISHES:
          if git diff --quiet public/data; then
            git diff --stat public/data
          git add public/data

=== e2e-playwright.yml ===
TRIGGERS:
on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  ops-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
SCRIPTS:
        run: npm ci
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:

=== eod-history-refresh.yml ===
TRIGGERS:
on:
  schedule:
    - cron: '20 21 * * 1-5' # 21:20 UTC, Mon-Fri (After market close)
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  refresh-history:
SCRIPTS:
        run: npm ci || npm install node-fetch
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
SECRETS:
          EODHD_API_KEY: ${{ secrets.EODHD_API_KEY }}
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

PUBLISHES:
          UNIVERSE_FILE="./public/data/universe/all.json"
             UNIVERSE_FILE="./public/data/universe/nasdaq100.json"
          git add public/data/eod/bars

=== eod-latest.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "10 22 * * 1-5"
  workflow_dispatch:
    inputs:
      universe:
        description: "Universe"
        default: "nasdaq100"
        required: false

permissions:
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
        run: npm ci
        run: node scripts/ops/preflight-check.mjs --mode eod-latest
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
        run: node scripts/ops/build-safety-snapshot.mjs
        run: npm run rv:ops
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: eod-latest
  cancel-in-progress: true
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
          if [ -n "${{ secrets.TIINGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIINGO_API_KEY }}" >> "$GITHUB_ENV"
          elif [ -n "${{ secrets.TIIANGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIIANGO_API_KEY }}" >> "$GITHUB_ENV"
CONCURRENCY:
concurrency:
  group: eod-latest
  cancel-in-progress: true

PUBLISHES:
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md

=== forecast-daily.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      date:
        description: 'Trading date (YYYY-MM-DD), empty for auto'
        required: false
        type: string
  schedule:
    # Run at 21:00 UTC (16:00 ET after market close)
    - cron: '0 21 * * 1-5'

SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add mirrors/forecast/ledger/ || true
          git add mirrors/forecast/snapshots/ || true
          git add public/data/forecast/ || true
        uses: actions/upload-artifact@v4

=== forecast-monthly.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      month:
        description: 'Month (YYYY-MM), empty for previous month'
        required: false
        type: string
  schedule:
    # Run 1st of each month at 08:00 UTC
    - cron: '0 8 1 * *'

SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add public/data/forecast/reports/monthly/ || true
        uses: actions/upload-artifact@v4

=== forecast-rollback.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for rollback (required)'
        required: true
        type: string
      target_commit:
        description: 'Target commit SHA to rollback to (optional, defaults to last_good)'
        required: false
        type: string
SCRIPTS:
PERMISSIONS:
    permissions:
      contents: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

PUBLISHES:
          cat > public/data/forecast/system/status.json << EOF
            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
          git add public/data/forecast

=== forecast-weekly.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      date:
        description: 'Trading date (YYYY-MM-DD), empty for auto'
        required: false
        type: string
  schedule:
    # Run Sundays at 06:00 UTC
    - cron: '0 6 * * 0'

SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add mirrors/forecast/challengers/ || true
          git add mirrors/forecast/champion/ || true
          git add mirrors/forecast/ledger/promotions/ || true
          git add public/data/forecast/ || true
        uses: actions/upload-artifact@v4

=== monitor-prod.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "0 6,18 * * *"
  workflow_dispatch:

jobs:
  liveness:
    runs-on: ubuntu-latest
    steps:
      - name: Ensure jq
        run: |
SCRIPTS:
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          fetch_json "$BASE_URL/data/snapshots/market-prices/latest.json" /tmp/market_prices.json
          fetch_json "$BASE_URL/data/forecast/latest.json" /tmp/forecast_latest.json
          fetch_json "$BASE_URL/data/forecast/system/status.json" /tmp/forecast_status.json
          fetch_json "$BASE_URL/data/marketphase/index.json" /tmp/marketphase_index.json
          fetch_json "$BASE_URL/data/ops/pulse.json" /tmp/ops_pulse.json
          echo "✅ /data/ops/pulse semantic checks passed"
          curl -fsS "$BASE_URL/data/ops/pulse.json" -o /tmp/ops_pulse.json
          curl -sS "$BASE_URL/data/forecast/latest.json" -o /tmp/forecast_latest.json

=== ops-auto-alerts.yml ===
TRIGGERS:
on:
  schedule:
    - cron: '0 22 * * 1-5' # Daily after market close
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  check-alerts:
SCRIPTS:
PERMISSIONS:
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

PUBLISHES:

=== ops-daily.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "5 7 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
        run: npm ci
        run: node scripts/ops/preflight-check.mjs --mode ops-daily
        run: node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100
        run: node scripts/pipeline/build-ndx100-pipeline-truth.mjs
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-ops-daily.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
CONCURRENCY:
concurrency:
  group: ops-daily
  cancel-in-progress: true

PUBLISHES:
          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json

=== refresh-health-assets.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
SCRIPTS:
        run: npm ci
        run: node scripts/refresh-health-assets.mjs
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
SECRETS:
          token: "${{ secrets.GITHUB_TOKEN }}"
CONCURRENCY:
PUBLISHES:
          if git diff --quiet public/data; then
          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json

=== scheduler-kick.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "15 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
PERMISSIONS:
permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
SECRETS:
          RV_ADMIN_TOKEN: ${{ secrets.RV_ADMIN_TOKEN }}
CONCURRENCY:
PUBLISHES:

=== universe-refresh.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      indices:
        description: 'Which indices to fetch (all, sp500, nasdaq100, dowjones, russell2000)'
        required: false
        default: 'all'

jobs:
  fetch-constituents:
    runs-on: ubuntu-latest
SCRIPTS:
        run: node scripts/universe/fetch-constituents.mjs
PERMISSIONS:
    permissions:
      contents: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
SECRETS:
          EODHD_API_KEY: ${{ secrets.EODHD_API_KEY }}
CONCURRENCY:
PUBLISHES:
          ls -la public/data/universe/
          for f in public/data/universe/*.json; do
          git add public/data/universe/

=== v3-finalizer.yml ===
TRIGGERS:
on:
  workflow_run:
    workflows: 
      - "v3 Pilot - Market Health"
      - "v3 Scrape Template"
    types:
      - completed
  workflow_dispatch:
    inputs:
      artifact_name:
        description: 'Artifact name to finalize (default: all)'
SCRIPTS:
        run: npm ci
PERMISSIONS:
    permissions:
      contents: write
      actions: read
    
    steps:
      - name: Checkout
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
CONCURRENCY:
    concurrency:
      group: rv-finalizer
      cancel-in-progress: true
    
PUBLISHES:
            path="public/data/snapshots/${module}/latest.json"
          if git diff --quiet public/data; then
            git diff --stat public/data
          git add public/data/snapshots 2>/dev/null || echo "No snapshot files to add"
          git add public/data/state/modules/*.json 2>/dev/null || echo "No module state files to add"
          git add public/data/manifest.json 2>/dev/null || echo "No manifest to add"
          git add public/data/provider-state.json 2>/dev/null || echo "No provider-state to add"
          if [ -f public/data/manifest.json ]; then

=== v3-scrape-template.yml ===
TRIGGERS:
on:
  schedule:
    # Run at 22:30 UTC on market days
    - cron: "30 22 * * 1-5"
  workflow_dispatch:
    inputs:
      modules:
        description: 'Modules to scrape (comma-separated, or "all")'
        required: false
        default: 'all'

SCRIPTS:
        run: npm ci
        run: npm ci
PERMISSIONS:
    permissions:
      contents: read
      actions: read
    
    strategy:
      matrix: ${{ fromJson(needs.prepare.outputs.matrix) }}
SECRETS:
          POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
          ALPHAVANTAGE_API_KEY: ${{ secrets.ALPHAVANTAGE_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          TWELVEDATA_API_KEY: ${{ secrets.TWELVEDATA_API_KEY }}
CONCURRENCY:
PUBLISHES:
            const registry = require('./public/data/registry/modules.json');
        uses: actions/upload-artifact@v4

=== wp16-manual-market-prices.yml ===
TRIGGERS:
SCRIPTS:
        run: npm ci
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
CONCURRENCY:
concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true

PUBLISHES:
          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true

=== ci-determinism.yml ===
TRIGGERS:
on:
  push:
    paths:
      - 'scripts/forecast/**'
      - 'tests/determinism/**'
  pull_request:
    paths:
      - 'scripts/forecast/**'
      - 'tests/determinism/**'
  workflow_dispatch:

SCRIPTS:
        run: npm ci
        run: npm run test:determinism
        run: npm run validate:forecast-registry
        run: npm run validate:forecast-schemas
PERMISSIONS:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-determinism-${{ github.ref }}
  cancel-in-progress: true

PUBLISHES:

=== ci-gates.yml ===
TRIGGERS:
on:
  pull_request:
    paths:
      - 'public/data/**'
      - 'scripts/**'
      - '.github/workflows/**'
  push:
    branches:
      - main
    paths:
      - 'public/data/**'
SCRIPTS:
        run: npm ci
        run: node scripts/ci/verify-artifacts.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
        run: node scripts/ci/check-elliott-parity.mjs
        run: bash scripts/ci/forbid-kv-writes-in-api.sh
        run: npm run test:contracts
        run: node scripts/eod/check-eod-artifacts.mjs
        run: npm ci
        run: bash scripts/ops/validate-truth.sh
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
      - 'public/data/**'
      - 'public/data/**'
          mkdir -p public/data
          if ! find public/data -type f -name "*.json" -print -quit | grep -q .; then
            SENTINEL_PATH="public/data/.budget_sentinel.json"
            echo "ℹ️ Created budget sentinel at $SENTINEL_PATH (no tracked public/data json artifacts in checkout)"
          # Count files in public/data
          TOTAL_FILES=$(find public/data -type f -name "*.json" | wc -l | tr -d ' ')
          LARGE_FILES=$(find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M || true)
            find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M -exec ls -lh {} \;
          for module_dir in public/data/snapshots/*/; do
          TOTAL_SIZE=$(du -sb public/data 2>/dev/null | cut -f1 || true)
            TOTAL_SIZE=$(du -sk public/data 2>/dev/null | awk '{print $1 * 1024}' || true)
          if [ -f public/data/manifest.json ] && [ -f schemas/manifest.schema.json ]; then
            npx --yes ajv-cli@5 validate -s schemas/manifest.schema.json -d public/data/manifest.json
          if [ -f public/data/provider-state.json ] && [ -f schemas/provider-state.schema.json ]; then
            npx --yes ajv-cli@5 validate -s schemas/provider-state.schema.json -d public/data/provider-state.json
            for snapshot in public/data/snapshots/*/latest.json; do
          if [ -f public/data/manifest.json ]; then
            if ! jq empty public/data/manifest.json 2>/dev/null; then
              SCHEMA_VERSION=$(jq -r '.schema_version // "missing"' public/data/manifest.json)
              ACTIVE_BUILD_ID=$(jq -r '.active_build_id // "missing"' public/data/manifest.json)
          if [ -f public/data/provider-state.json ]; then
            if ! jq empty public/data/provider-state.json 2>/dev/null; then
          for snapshot in public/data/snapshots/*/latest.json; do
          if [ ! -f public/data/manifest.json ]; then
          PUBLISHED_MODULES=$(jq -r '.modules | to_entries | .[] | select(.value.published == true) | .key' public/data/manifest.json)
            MANIFEST_DIGEST=$(jq -r ".modules[\"$module\"].digest" public/data/manifest.json)
            SNAPSHOT_PATH="public/data/snapshots/$module/latest.json"
          # Check: No blanket ignores for public/data or mirrors
          if grep -nE '^(public/data/|mirrors/)$' .gitignore; then
            echo "❌ VIOLATION: .gitignore contains blanket ignore for public/data/ or mirrors/"

=== ci-policy.yml ===
TRIGGERS:
on:
  push:
    paths:
      - 'policies/**'
      - 'mirrors/forecast/**'
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: true

SCRIPTS:
PERMISSIONS:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: true

PUBLISHES:
      - 'mirrors/forecast/**'

=== cleanup-daily-snapshots.yml ===
TRIGGERS:
on:
  schedule:
    # Run weekly on Sundays at 02:00 UTC
    - cron: "0 2 * * 0"
  workflow_dispatch:
    inputs:
      days_to_keep:
        description: 'Days to keep (default: 7)'
        required: false
        default: '7'
      dry_run:
SCRIPTS:
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

SECRETS:
CONCURRENCY:
PUBLISHES:
          if git diff --quiet public/data; then
            git diff --stat public/data
          git add public/data

=== e2e-playwright.yml ===
TRIGGERS:
on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  ops-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
SCRIPTS:
        run: npm ci
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:

=== eod-history-refresh.yml ===
TRIGGERS:
on:
  schedule:
    - cron: '20 21 * * 1-5' # 21:20 UTC, Mon-Fri (After market close)
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  refresh-history:
SCRIPTS:
        run: npm ci || npm install node-fetch
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
SECRETS:
          EODHD_API_KEY: ${{ secrets.EODHD_API_KEY }}
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

PUBLISHES:
          UNIVERSE_FILE="./public/data/universe/all.json"
             UNIVERSE_FILE="./public/data/universe/nasdaq100.json"
          git add public/data/eod/bars

=== eod-latest.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "10 22 * * 1-5"
  workflow_dispatch:
    inputs:
      universe:
        description: "Universe"
        default: "nasdaq100"
        required: false

permissions:
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
        run: npm ci
        run: node scripts/ops/preflight-check.mjs --mode eod-latest
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
        run: node scripts/ops/build-safety-snapshot.mjs
        run: npm run rv:ops
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: eod-latest
  cancel-in-progress: true
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
          if [ -n "${{ secrets.TIINGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIINGO_API_KEY }}" >> "$GITHUB_ENV"
          elif [ -n "${{ secrets.TIIANGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIIANGO_API_KEY }}" >> "$GITHUB_ENV"
CONCURRENCY:
concurrency:
  group: eod-latest
  cancel-in-progress: true

PUBLISHES:
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md

=== forecast-daily.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      date:
        description: 'Trading date (YYYY-MM-DD), empty for auto'
        required: false
        type: string
  schedule:
    # Run at 21:00 UTC (16:00 ET after market close)
    - cron: '0 21 * * 1-5'

SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add mirrors/forecast/ledger/ || true
          git add mirrors/forecast/snapshots/ || true
          git add public/data/forecast/ || true
        uses: actions/upload-artifact@v4

=== forecast-monthly.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      month:
        description: 'Month (YYYY-MM), empty for previous month'
        required: false
        type: string
  schedule:
    # Run 1st of each month at 08:00 UTC
    - cron: '0 8 1 * *'

SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add public/data/forecast/reports/monthly/ || true
        uses: actions/upload-artifact@v4

=== forecast-rollback.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for rollback (required)'
        required: true
        type: string
      target_commit:
        description: 'Target commit SHA to rollback to (optional, defaults to last_good)'
        required: false
        type: string
SCRIPTS:
PERMISSIONS:
    permissions:
      contents: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

PUBLISHES:
          cat > public/data/forecast/system/status.json << EOF
            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
          git add public/data/forecast

=== forecast-weekly.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      date:
        description: 'Trading date (YYYY-MM-DD), empty for auto'
        required: false
        type: string
  schedule:
    # Run Sundays at 06:00 UTC
    - cron: '0 6 * * 0'

SCRIPTS:
        run: npm ci --prefer-offline
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          git add mirrors/forecast/challengers/ || true
          git add mirrors/forecast/champion/ || true
          git add mirrors/forecast/ledger/promotions/ || true
          git add public/data/forecast/ || true
        uses: actions/upload-artifact@v4

=== monitor-prod.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "0 6,18 * * *"
  workflow_dispatch:

jobs:
  liveness:
    runs-on: ubuntu-latest
    steps:
      - name: Ensure jq
        run: |
SCRIPTS:
PERMISSIONS:
SECRETS:
CONCURRENCY:
PUBLISHES:
          fetch_json "$BASE_URL/data/snapshots/market-prices/latest.json" /tmp/market_prices.json
          fetch_json "$BASE_URL/data/forecast/latest.json" /tmp/forecast_latest.json
          fetch_json "$BASE_URL/data/forecast/system/status.json" /tmp/forecast_status.json
          fetch_json "$BASE_URL/data/marketphase/index.json" /tmp/marketphase_index.json
          fetch_json "$BASE_URL/data/ops/pulse.json" /tmp/ops_pulse.json
          echo "✅ /data/ops/pulse semantic checks passed"
          curl -fsS "$BASE_URL/data/ops/pulse.json" -o /tmp/ops_pulse.json
          curl -sS "$BASE_URL/data/forecast/latest.json" -o /tmp/forecast_latest.json

=== ops-auto-alerts.yml ===
TRIGGERS:
on:
  schedule:
    - cron: '0 22 * * 1-5' # Daily after market close
  workflow_dispatch:

concurrency:
  group: forecast-system
  cancel-in-progress: false

jobs:
  check-alerts:
SCRIPTS:
PERMISSIONS:
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
SECRETS:
CONCURRENCY:
concurrency:
  group: forecast-system
  cancel-in-progress: false

PUBLISHES:

=== ops-daily.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "5 7 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
        run: npm ci
        run: node scripts/ops/preflight-check.mjs --mode ops-daily
        run: node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100
        run: node scripts/pipeline/build-ndx100-pipeline-truth.mjs
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-ops-daily.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
CONCURRENCY:
concurrency:
  group: ops-daily
  cancel-in-progress: true

PUBLISHES:
          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json

=== refresh-health-assets.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
SCRIPTS:
        run: npm ci
        run: node scripts/refresh-health-assets.mjs
PERMISSIONS:
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
SECRETS:
          token: "${{ secrets.GITHUB_TOKEN }}"
CONCURRENCY:
PUBLISHES:
          if git diff --quiet public/data; then
          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json

=== scheduler-kick.yml ===
TRIGGERS:
on:
  schedule:
    - cron: "15 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
SCRIPTS:
        run: npm ci
        run: npm run test:contracts
PERMISSIONS:
permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
SECRETS:
          RV_ADMIN_TOKEN: ${{ secrets.RV_ADMIN_TOKEN }}
CONCURRENCY:
PUBLISHES:

=== universe-refresh.yml ===
TRIGGERS:
on:
  workflow_dispatch:
    inputs:
      indices:
        description: 'Which indices to fetch (all, sp500, nasdaq100, dowjones, russell2000)'
        required: false
        default: 'all'

jobs:
  fetch-constituents:
    runs-on: ubuntu-latest
SCRIPTS:
        run: node scripts/universe/fetch-constituents.mjs
PERMISSIONS:
    permissions:
      contents: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
SECRETS:
          EODHD_API_KEY: ${{ secrets.EODHD_API_KEY }}
CONCURRENCY:
PUBLISHES:
          ls -la public/data/universe/
          for f in public/data/universe/*.json; do
          git add public/data/universe/

=== v3-finalizer.yml ===
TRIGGERS:
on:
  workflow_run:
    workflows: 
      - "v3 Pilot - Market Health"
      - "v3 Scrape Template"
    types:
      - completed
  workflow_dispatch:
    inputs:
      artifact_name:
        description: 'Artifact name to finalize (default: all)'
SCRIPTS:
        run: npm ci
PERMISSIONS:
    permissions:
      contents: write
      actions: read
    
    steps:
      - name: Checkout
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
CONCURRENCY:
    concurrency:
      group: rv-finalizer
      cancel-in-progress: true
    
PUBLISHES:
            path="public/data/snapshots/${module}/latest.json"
          if git diff --quiet public/data; then
            git diff --stat public/data
          git add public/data/snapshots 2>/dev/null || echo "No snapshot files to add"
          git add public/data/state/modules/*.json 2>/dev/null || echo "No module state files to add"
          git add public/data/manifest.json 2>/dev/null || echo "No manifest to add"
          git add public/data/provider-state.json 2>/dev/null || echo "No provider-state to add"
          if [ -f public/data/manifest.json ]; then

=== v3-scrape-template.yml ===
TRIGGERS:
on:
  schedule:
    # Run at 22:30 UTC on market days
    - cron: "30 22 * * 1-5"
  workflow_dispatch:
    inputs:
      modules:
        description: 'Modules to scrape (comma-separated, or "all")'
        required: false
        default: 'all'

SCRIPTS:
        run: npm ci
        run: npm ci
PERMISSIONS:
    permissions:
      contents: read
      actions: read
    
    strategy:
      matrix: ${{ fromJson(needs.prepare.outputs.matrix) }}
SECRETS:
          POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
          ALPHAVANTAGE_API_KEY: ${{ secrets.ALPHAVANTAGE_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          TWELVEDATA_API_KEY: ${{ secrets.TWELVEDATA_API_KEY }}
CONCURRENCY:
PUBLISHES:
            const registry = require('./public/data/registry/modules.json');
        uses: actions/upload-artifact@v4

=== wp16-manual-market-prices.yml ===
TRIGGERS:
SCRIPTS:
        run: npm ci
PERMISSIONS:
permissions:
  contents: write

concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true
SECRETS:
          token: ${{ secrets.GITHUB_TOKEN }}
CONCURRENCY:
concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true

PUBLISHES:
          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true


===== END FILE: inventory/workflow-metadata.txt =====

## Directory: reality

### File: reality/CI_Determinism_Check_runs.json
===== FILE: reality/CI_Determinism_Check_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656537,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T14:45:06Z","databaseId":21829588789,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T07:22:11Z","databaseId":21815967135,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T06:56:35Z","databaseId":21815382422,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T22:34:29Z","databaseId":21806632528,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T22:32:48Z","databaseId":21806609129,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T22:29:44Z","databaseId":21806564931,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T22:27:01Z","databaseId":21806528591,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T21:35:28Z","databaseId":21805791135,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T16:18:35Z","databaseId":21801328497,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T20:59:44Z","databaseId":21765717382,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T18:20:01Z","databaseId":21761196449,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T17:05:16Z","databaseId":21759001947,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T16:18:32Z","databaseId":21757559381,"headBranch":"main","status":"completed"},{"conclusion":"cancelled","createdAt":"2026-02-05T16:03:31Z","databaseId":21718742385,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T15:52:58Z","databaseId":21718357378,"headBranch":"main","status":"completed"}]

===== END FILE: reality/CI_Determinism_Check_runs.json =====

### File: reality/CI_Gates___Quality___Budget_Checks_runs.json
===== FILE: reality/CI_Gates___Quality___Budget_Checks_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656562,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T14:45:06Z","databaseId":21829588790,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T07:22:11Z","databaseId":21815967165,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T06:56:35Z","databaseId":21815382431,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T22:34:29Z","databaseId":21806632526,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T22:32:48Z","databaseId":21806609309,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T22:29:44Z","databaseId":21806564938,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T19:32:51Z","databaseId":21804051323,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T19:24:36Z","databaseId":21803935252,"headBranch":"fix/e2e-nonblocking-on-push","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T19:12:28Z","databaseId":21803764104,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T19:00:25Z","databaseId":21803588715,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T18:58:49Z","databaseId":21803567409,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T18:31:11Z","databaseId":21803184655,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T18:24:19Z","databaseId":21803088630,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T18:12:29Z","databaseId":21802921758,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T18:08:52Z","databaseId":21802869925,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T17:54:11Z","databaseId":21802652454,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T17:52:04Z","databaseId":21802622347,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T17:38:19Z","databaseId":21802432537,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:19Z","databaseId":21802404755,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:34:02Z","databaseId":21802371813,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:24Z","databaseId":21802320060,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:55Z","databaseId":21801963955,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:10Z","databaseId":21801954327,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:58Z","databaseId":21801840666,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:38Z","databaseId":21801754062,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:44Z","databaseId":21765717399,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:51Z","databaseId":21763437412,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:20:01Z","databaseId":21761196454,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:16Z","databaseId":21759001912,"headBranch":"main","status":"completed"}]

===== END FILE: reality/CI_Gates___Quality___Budget_Checks_runs.json =====

### File: reality/CI_Policy_Check_runs.json
===== FILE: reality/CI_Policy_Check_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-10T21:28:12Z","databaseId":21883064544,"headBranch":"codex/p0p1-hardening","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656549,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T07:22:08Z","databaseId":21815966159,"headBranch":"fix/hardening-never-empty-deploy","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T19:32:51Z","databaseId":21804051318,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T17:54:11Z","databaseId":21802652449,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T16:49:35Z","databaseId":21801753447,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T16:24:17Z","databaseId":21801408289,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T16:18:35Z","databaseId":21801328499,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"cancelled","createdAt":"2026-02-06T16:18:32Z","databaseId":21757559361,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T16:22:38Z","databaseId":21719440229,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T16:03:31Z","databaseId":21718742405,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T15:52:58Z","databaseId":21718357399,"headBranch":"main","status":"completed"}]

===== END FILE: reality/CI_Policy_Check_runs.json =====

### File: reality/Cleanup_Daily_Snapshots_runs.json
===== FILE: reality/Cleanup_Daily_Snapshots_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-08T04:28:18Z","databaseId":21792234114,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-01T04:23:22Z","databaseId":21556544268,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-01-25T03:47:29Z","databaseId":21326403540,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Cleanup_Daily_Snapshots_runs.json =====

### File: reality/EOD_History_Refresh_runs.json
===== FILE: reality/EOD_History_Refresh_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-10T22:02:22Z","databaseId":21884087257,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T21:58:11Z","databaseId":21842342338,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T21:47:52Z","databaseId":21767060905,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T20:59:51Z","databaseId":21765720400,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T21:48:21Z","databaseId":21729763597,"headBranch":"main","status":"completed"}]

===== END FILE: reality/EOD_History_Refresh_runs.json =====

### File: reality/EOD_Latest__NASDAQ_100__runs.json
===== FILE: reality/EOD_Latest__NASDAQ_100__runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T22:54:36Z","databaseId":21844075239,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:58:48Z","databaseId":21803567264,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:31:08Z","databaseId":21803183860,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:15Z","databaseId":21803088132,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:28Z","databaseId":21802921580,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:49Z","databaseId":21802869042,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:07Z","databaseId":21802651817,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:55Z","databaseId":21802620004,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:10Z","databaseId":21802430003,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:08Z","databaseId":21802402692,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:51Z","databaseId":21802369181,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:13Z","databaseId":21802317065,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:45Z","databaseId":21801961544,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:01Z","databaseId":21801951657,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:47Z","databaseId":21801838869,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:29Z","databaseId":21801752139,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:08Z","databaseId":21801448139,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:12Z","databaseId":21801407378,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:32Z","databaseId":21801327882,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:42Z","databaseId":21765716619,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:50Z","databaseId":21763436957,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:36Z","databaseId":21762291971,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:58Z","databaseId":21761195150,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:14Z","databaseId":21759000835,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:27Z","databaseId":21757557210,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:29Z","databaseId":21722187257,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:45Z","databaseId":21721654637,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:49Z","databaseId":21721166118,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:54Z","databaseId":21720708368,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:31Z","databaseId":21720220149,"headBranch":"main","status":"completed"}]

===== END FILE: reality/EOD_Latest__NASDAQ_100__runs.json =====

### File: reality/Forecast_Daily_Pipeline_runs.json
===== FILE: reality/Forecast_Daily_Pipeline_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-10T21:37:13Z","databaseId":21883339643,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T21:34:14Z","databaseId":21841570005,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T21:24:48Z","databaseId":21766433410,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T21:22:53Z","databaseId":21729000875,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Forecast_Daily_Pipeline_runs.json =====

### File: reality/Forecast_Monthly_Report_runs.json
===== FILE: reality/Forecast_Monthly_Report_runs.json =====
[]

===== END FILE: reality/Forecast_Monthly_Report_runs.json =====

### File: reality/Forecast_Rollback_runs.json
===== FILE: reality/Forecast_Rollback_runs.json =====
[]

===== END FILE: reality/Forecast_Rollback_runs.json =====

### File: reality/Forecast_Weekly_Training_runs.json
===== FILE: reality/Forecast_Weekly_Training_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-08T06:35:01Z","databaseId":21793741108,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Forecast_Weekly_Training_runs.json =====

### File: reality/Monitor_Production_Artifacts_runs.json
===== FILE: reality/Monitor_Production_Artifacts_runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-10T18:59:53Z","databaseId":21878443915,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T06:58:25Z","databaseId":21854979453,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Monitor_Production_Artifacts_runs.json =====

### File: reality/Ops_Auto_Alerts_runs.json
===== FILE: reality/Ops_Auto_Alerts_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-10T22:42:56Z","databaseId":21885261398,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T22:40:15Z","databaseId":21843673551,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T22:28:31Z","databaseId":21768172381,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T22:31:34Z","databaseId":21731010615,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Ops_Auto_Alerts_runs.json =====

### File: reality/Ops_Daily_Snapshot_runs.json
===== FILE: reality/Ops_Daily_Snapshot_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-10T08:02:48Z","databaseId":21856604564,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-09T08:01:08Z","databaseId":21816946844,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:58:48Z","databaseId":21803567207,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:31:09Z","databaseId":21803184134,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:15Z","databaseId":21803088081,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:27Z","databaseId":21802921390,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:50Z","databaseId":21802869317,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:07Z","databaseId":21802651758,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:54Z","databaseId":21802619835,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:08Z","databaseId":21802429530,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:10Z","databaseId":21802403001,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:51Z","databaseId":21802369254,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:13Z","databaseId":21802317290,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:45Z","databaseId":21801961617,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:01Z","databaseId":21801951897,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:48Z","databaseId":21801838957,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:30Z","databaseId":21801752296,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:06Z","databaseId":21801447808,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:13Z","databaseId":21801407572,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:32Z","databaseId":21801327945,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:42Z","databaseId":21765716344,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:48Z","databaseId":21763436075,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:36Z","databaseId":21762292392,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:58Z","databaseId":21761194967,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:13Z","databaseId":21759000289,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:28Z","databaseId":21757557435,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:29Z","databaseId":21722187440,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:47Z","databaseId":21721655585,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:49Z","databaseId":21721165895,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:54Z","databaseId":21720708692,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Ops_Daily_Snapshot_runs.json =====

### File: reality/README.txt
===== FILE: reality/README.txt =====
Workflows listed: 20
Runs files: 20
Low success (<80%): 13

===== END FILE: reality/README.txt =====

### File: reality/Refresh_Health_Assets_runs.json
===== FILE: reality/Refresh_Health_Assets_runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-10T07:32:23Z","databaseId":21855817633,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T07:32:38Z","databaseId":21816235658,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-08T07:08:04Z","databaseId":21794123536,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-07T07:02:49Z","databaseId":21776133820,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-06T07:14:04Z","databaseId":21742115482,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-05T07:17:18Z","databaseId":21702460265,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-04T07:11:46Z","databaseId":21662139919,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-03T07:11:09Z","databaseId":21620705530,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-02T07:18:11Z","databaseId":21580889253,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-02-01T07:06:55Z","databaseId":21558621506,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-01-31T06:58:25Z","databaseId":21540604631,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-01-30T07:08:45Z","databaseId":21507560718,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-01-29T07:07:55Z","databaseId":21468989902,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-01-28T06:55:04Z","databaseId":21428335759,"headBranch":"main","status":"completed"},{"conclusion":"success","createdAt":"2026-01-27T06:54:51Z","databaseId":21387615360,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Refresh_Health_Assets_runs.json =====

### File: reality/Scheduler_Kick_runs.json
===== FILE: reality/Scheduler_Kick_runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-10T22:00:48Z","databaseId":21884041001,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T21:00:42Z","databaseId":21882226017,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T19:32:57Z","databaseId":21879496975,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T17:18:40Z","databaseId":21875101296,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T15:35:07Z","databaseId":21871357390,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T13:54:40Z","databaseId":21867698272,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T12:02:27Z","databaseId":21864079710,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T11:14:37Z","databaseId":21862640214,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T10:13:32Z","databaseId":21860705577,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T09:13:07Z","databaseId":21858707411,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T07:32:23Z","databaseId":21855817626,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T05:48:33Z","databaseId":21853382635,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-10T03:29:42Z","databaseId":21850561264,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T23:53:39Z","databaseId":21845637661,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T22:58:55Z","databaseId":21844191692,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T21:57:14Z","databaseId":21842312460,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T20:58:16Z","databaseId":21840398302,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T19:40:56Z","databaseId":21838014567,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T18:04:35Z","databaseId":21835654127,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T16:15:10Z","databaseId":21832753520,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T15:12:08Z","databaseId":21830568692,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T13:48:46Z","databaseId":21827638277,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T11:57:21Z","databaseId":21824106542,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T10:16:54Z","databaseId":21821056946,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T09:11:01Z","databaseId":21818951779,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T07:32:26Z","databaseId":21816231122,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T05:47:25Z","databaseId":21813888922,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-09T03:21:27Z","databaseId":21811214288,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T23:46:48Z","databaseId":21807619345,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T22:48:31Z","databaseId":21806822221,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Scheduler_Kick_runs.json =====

### File: reality/Universe_Refresh_runs.json
===== FILE: reality/Universe_Refresh_runs.json =====
[{"conclusion":"success","createdAt":"2026-02-06T19:38:03Z","databaseId":21763443287,"headBranch":"main","status":"completed"}]

===== END FILE: reality/Universe_Refresh_runs.json =====

### File: reality/WP16_Manual___Market_Prices__Stooq__runs.json
===== FILE: reality/WP16_Manual___Market_Prices__Stooq__runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-08T17:54:07Z","databaseId":21802651686,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:55Z","databaseId":21802620069,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:08Z","databaseId":21802429619,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:09Z","databaseId":21802402954,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:52Z","databaseId":21802369475,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:12Z","databaseId":21802316957,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:46Z","databaseId":21801961801,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:01Z","databaseId":21801951774,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:49Z","databaseId":21801839245,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:30Z","databaseId":21801752446,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:06Z","databaseId":21801447865,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:13Z","databaseId":21801407447,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:31Z","databaseId":21801327828,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:41Z","databaseId":21765716089,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:50Z","databaseId":21763436746,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:37Z","databaseId":21762292584,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:59Z","databaseId":21761195521,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:14Z","databaseId":21759001069,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:30Z","databaseId":21757558370,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:28Z","databaseId":21722186711,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:45Z","databaseId":21721654418,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:48Z","databaseId":21721165679,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:53Z","databaseId":21720707841,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:30Z","databaseId":21720219590,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:37Z","databaseId":21719439451,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:03:29Z","databaseId":21718740369,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T15:52:57Z","databaseId":21718356759,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T08:10:50Z","databaseId":21703808858,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T23:41:53Z","databaseId":21692735551,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T23:30:29Z","databaseId":21692470830,"headBranch":"main","status":"completed"}]

===== END FILE: reality/WP16_Manual___Market_Prices__Stooq__runs.json =====

### File: reality/e2e_playwright_runs.json
===== FILE: reality/e2e_playwright_runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656565,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T19:32:51Z","databaseId":21804051347,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T19:12:28Z","databaseId":21803764109,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:11Z","databaseId":21802652461,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:44Z","databaseId":21765717420,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:51Z","databaseId":21763437381,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:38Z","databaseId":21762293282,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:20:01Z","databaseId":21761196527,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:16Z","databaseId":21759001936,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:32Z","databaseId":21757559424,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:33Z","databaseId":21722189319,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:49Z","databaseId":21721656313,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:50Z","databaseId":21721166670,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:56Z","databaseId":21720709668,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:32Z","databaseId":21720220956,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:38Z","databaseId":21719440266,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:03:31Z","databaseId":21718742333,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T15:52:58Z","databaseId":21718357388,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T08:10:51Z","databaseId":21703809534,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T23:41:55Z","databaseId":21692736434,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T23:30:30Z","databaseId":21692471424,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T22:57:19Z","databaseId":21691643965,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T22:36:14Z","databaseId":21691072141,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T22:19:00Z","databaseId":21690595276,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T22:02:24Z","databaseId":21690108816,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T19:18:11Z","databaseId":21685008340,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T19:04:05Z","databaseId":21684577058,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T18:50:55Z","databaseId":21684158239,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T17:47:30Z","databaseId":21682150177,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-04T17:28:21Z","databaseId":21681541199,"headBranch":"main","status":"completed"}]

===== END FILE: reality/e2e_playwright_runs.json =====

## Directory: reality/failure-logs

### File: reality/failure-logs/224941564_v3_Finalizer.log
===== FILE: reality/failure-logs/224941564_v3_Finalizer.log =====
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5526415Z ##[group]Run set +e  # Disable exit on error for this step
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5526908Z [36;1mset +e  # Disable exit on error for this step[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5736537Z [36;1m  echo "❌ ERROR: Finalizer failed with exit code $FINALIZER_EXIT"[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5736967Z [36;1m  echo "Check the logs above for detailed error information"[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6251148Z ERROR: Failed to load registry: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json'
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6304870Z ##[error]Process completed with exit code 1.
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6370883Z [36;1mecho "- Status: failure" >> $GITHUB_STEP_SUMMARY[0m

===== END FILE: reality/failure-logs/224941564_v3_Finalizer.log =====

### File: reality/failure-logs/225058763_v3_Scrape_Template.log
===== FILE: reality/failure-logs/225058763_v3_Scrape_Template.log =====
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8605090Z ##[group]Run set -euo pipefail
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8605688Z [36;1mset -euo pipefail[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8619154Z [36;1m    error: (.error // null)[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8620767Z [36;1m  echo "MISSING: $ARTIFACTS_DIR/market-prices/snapshot.json"[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8780529Z ls: cannot access '/home/runner/work/_temp/artifacts': No such file or directory
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8794562Z MISSING: /home/runner/work/_temp/artifacts/market-prices/snapshot.json
prepare	UNKNOWN STEP	2026-02-09T23:05:30.6131010Z Error: Cannot find module './public/data/registry/modules.json'
prepare	UNKNOWN STEP	2026-02-09T23:05:30.6158005Z ##[error]Process completed with exit code 1.

===== END FILE: reality/failure-logs/225058763_v3_Scrape_Template.log =====

### File: reality/failure-logs/225061032_CI_Gates___Quality___Budget_Checks.log
===== FILE: reality/failure-logs/225061032_CI_Gates___Quality___Budget_Checks.log =====
Repository Policy Checks	Check Forbidden Patterns	2026-02-08T22:29:50.0472992Z [36;1m  echo "Status:     ❌ FAIL"[0m
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7455851Z ✅ Drops above absolute threshold (5) should fail
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7458947Z ✅ computeValidationMetadata fails when threshold exceeded
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7459954Z ✅ computeValidationMetadata fails when other validation fails
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7464566Z ✅ Invalid inputs throw errors
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7470584Z ❌ Failed: 0
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8981358Z ✅ Network error → retry succeeds
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8985247Z ✅ Retry limit reached → ok=false with error
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8997151Z ✅ Network error exhausts retries → ok=false
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.9011163Z ❌ Failed: 0
JSON Schema Validation	Run contract tests	2026-02-08T22:29:58.9836629Z > npm run validate:symbols && npm run test:envelope && npm run test:scheduler && node scripts/contract-smoke.js && npm run test:truth-chain && npm run test:missing-mirror && node tests/build-info-artifact.test.mjs
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.3497919Z ✅ errorEnvelope
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6192737Z WARN: health latest snapshot check skipped (missing public/data/snapshots/health/latest.json)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6197519Z WARN: tech-signals contract check skipped (missing mirror or snapshot artifact)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6198667Z WARN: SNAPSHOT>=MIRROR tech-signals guard skipped (missing mirror or snapshot artifact)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.9724881Z > test:missing-mirror
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.9725302Z > node scripts/ops/verify-missing-mirror-semantic.mjs
JSON Schema Validation	Run contract tests	2026-02-08T22:30:00.0025183Z WARN: semantic equivalence check skipped (generated artifacts missing): /home/runner/work/rubikvault-site/rubikvault-site/public/data/marketphase/missing.json, /home/runner/work/rubikvault-site/rubikvault-site/public/data/pipeline/missing.json
JSON Schema Validation	Run contract tests	2026-02-08T22:30:00.0365686Z SKIP: build-info artifact missing in generated-only checkout
JSON Schema Validation	Validate Against JSON Schemas	2026-02-08T22:30:00.6900273Z ##[error]Process completed with exit code 1.
Asset Budget Check	Check Asset Budget	2026-02-08T22:29:50.3781653Z [36;1m  echo "❌ ERROR: Total files ($TOTAL_FILES) exceeds limit ($MAX_FILES)"[0m
Asset Budget Check	Check Asset Budget	2026-02-08T22:29:50.3797962Z [36;1m  echo "❌ ERROR: Files exceed ${MAX_SIZE_MB}MB:"[0m
Asset Budget Check	Check Asset Budget	2026-02-08T22:29:50.3819817Z [36;1m      echo "❌ ERROR: Module $MODULE_NAME has $MODULE_FILES files (max $MAX_FILES_PER_MODULE)"[0m
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8887292Z WARN: missing pipeline stage fetched at public/data/pipeline/nasdaq100.fetched.json
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8890924Z WARN: missing pipeline stage validated at public/data/pipeline/nasdaq100.validated.json
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8894359Z WARN: missing pipeline stage computed at public/data/pipeline/nasdaq100.computed.json
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8896993Z WARN: missing pipeline stage static-ready at public/data/pipeline/nasdaq100.static-ready.json
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8899102Z WARN: missing ops summary latest at public/data/ops/summary.latest.json
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8900682Z WARN: missing ops-daily at public/data/ops-daily.json
OPS Truth Validation (non-blocking)	Validate truth artifacts	2026-02-08T22:29:49.8902172Z WARN: missing health latest snapshot envelope
CI Gates Summary	Summary	2026-02-08T22:30:06.9765917Z [36;1mecho "- Schema Validation: failure" >> $GITHUB_STEP_SUMMARY[0m

===== END FILE: reality/failure-logs/225061032_CI_Gates___Quality___Budget_Checks.log =====

### File: reality/failure-logs/226498514_WP16_Manual___Market_Prices__Stooq_.log
===== FILE: reality/failure-logs/226498514_WP16_Manual___Market_Prices__Stooq_.log =====
failed to get run log: log not found

===== END FILE: reality/failure-logs/226498514_WP16_Manual___Market_Prices__Stooq_.log =====

### File: reality/failure-logs/227442620_Ops_Daily_Snapshot.log
===== FILE: reality/failure-logs/227442620_Ops_Daily_Snapshot.log =====
failed to get run log: log not found

===== END FILE: reality/failure-logs/227442620_Ops_Daily_Snapshot.log =====

### File: reality/failure-logs/227511913_EOD_Latest__NASDAQ_100_.log
===== FILE: reality/failure-logs/227511913_EOD_Latest__NASDAQ_100_.log =====
run	UNKNOWN STEP	2026-02-09T22:54:51.1439967Z ##[group]Run set -euo pipefail
run	UNKNOWN STEP	2026-02-09T22:54:51.1440290Z [36;1mset -euo pipefail[0m
run	UNKNOWN STEP	2026-02-09T22:55:26.1392906Z FAIL: expected=100 but fetched=0 (empty artifact generation blocked)
run	UNKNOWN STEP	2026-02-09T22:55:26.1445662Z ##[error]Process completed with exit code 1.

===== END FILE: reality/failure-logs/227511913_EOD_Latest__NASDAQ_100_.log =====

### File: reality/failure-logs/228731024_Scheduler_Kick.log
===== FILE: reality/failure-logs/228731024_Scheduler_Kick.log =====
kick	Trigger scheduler	﻿2026-02-10T22:00:51.8462099Z ##[group]Run set -euo pipefail
kick	Trigger scheduler	2026-02-10T22:00:51.8463008Z [36;1mset -euo pipefail[0m
kick	Trigger scheduler	2026-02-10T22:00:51.8476067Z [36;1m  echo "Scheduler kick failed (HTTP $status)" >&2[0m
kick	Trigger scheduler	2026-02-10T22:00:52.0314354Z Scheduler kick failed (HTTP 403)
kick	Trigger scheduler	2026-02-10T22:00:52.0365122Z <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}html{line-height:1.15;-webkit-text-size-adjust:100%;color:#313131;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}body{display:flex;flex-direction:column;height:100vh;min-height:100vh}.main-content{margin:8rem auto;padding-left:1.5rem;max-width:60rem}@media (width <= 720px){.main-content{margin-top:4rem}}.h2{line-height:2.25rem;font-size:1.5rem;font-weight:500}@media (width <= 720px){.h2{line-height:1.5rem;font-size:1.25rem}}#challenge-error-text{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI0IyMEYwMyIgZD0iTTE2IDNhMTMgMTMgMCAxIDAgMTMgMTNBMTMuMDE1IDEzLjAxNSAwIDAgMCAxNiAzbTAgMjRhMTEgMTEgMCAxIDEgMTEtMTEgMTEuMDEgMTEuMDEgMCAwIDEtMTEgMTEiLz48cGF0aCBmaWxsPSIjQjIwRjAzIiBkPSJNMTcuMDM4IDE4LjYxNUgxNC44N0wxNC41NjMgOS41aDIuNzgzem0tMS4wODQgMS40MjdxLjY2IDAgMS4wNTcuMzg4LjQwNy4zODkuNDA3Ljk5NCAwIC41OTYtLjQwNy45ODQtLjM5Ny4zOS0xLjA1Ny4zODktLjY1IDAtMS4wNTYtLjM4OS0uMzk4LS4zODktLjM5OC0uOTg0IDAtLjU5Ny4zOTgtLjk4NS40MDYtLjM5NyAxLjA1Ni0uMzk3Ii8+PC9zdmc+");background-repeat:no-repeat;background-size:contain;padding-left:34px}@media (prefers-color-scheme: dark){body{background-color:#222;color:#d9d9d9}}</style><meta http-equiv="refresh" content="360"></head><body><div class="main-wrapper" role="main"><div class="main-content"><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></div></div><script>(function(){window._cf_chl_opt = {cvId: '3',cZone: 'rubikvault.com',cType: 'managed',cRay: '9cbee1bd0b270fa3',cH: '3NyntZT8eAbhLHY.Sw49sUO3HysJsskc8cBzBP.CPKI-1770760852-1.2.1.1-rYPqiXEpu3SGHKtIQfxBEHo7v7o5L.j4lM4ODBD8twwqz1dotCCHiQpWKK_1t6zN',cUPMDTk:"\/api\/scheduler\/run?__cf_chl_tk=EbAPuDKktzmunFa.gcuDw_pjgYz15pUOPi4TZWxWlUk-1770760852-1.0.1.1-8drcbBTxFVIJSkw_5JaWGNTFlc7l30OYRWVnDN7Fxhg",cFPWv: 'b',cITimeS: '1770760852',cTplC:0,cTplV:5,cTplB: '0',fa:"\/api\/scheduler\/run?__cf_chl_f_tk=EbAPuDKktzmunFa.gcuDw_pjgYz15pUOPi4TZWxWlUk-1770760852-1.0.1.1-8drcbBTxFVIJSkw_5JaWGNTFlc7l30OYRWVnDN7Fxhg",md: 'Rc7t0aBTsSyvIFg56tIpvXZYentMgawIoZjDgtcFEfk-1770760852-1.2.1.1-MvhQIwMfnh2dYVDqQOXlj6OtBIzrcelxdPHLf_E17p12obtXuUpY8caFgFgggeILBZFzd1hIPKi5sgwucs7oMR4XpMqCYYG1_AJy3nfqEEoBrvbhkPBE1Gtb9SJH6wnPtVvhxBuwFcPNEslW1o4YzdEs0liLYmmrnxAumh6DDAvKJpcDs_YXXoGYGiwZ9n7yDUK.hy7paVRxrRoUdcbEIOvJSSuG0Vgb4r9dgviafwkyWBbXMqpSpY2FARUQrcHd0iDj4Ihu4_m4ZhSVf12l5dB9HkqX6dpS4QNMOEFKFe_rJVAShZFQ5T.ghDEE8Te.mAZYmt.PqZYvAfaDE69tUBsjDyG_kvQPyn7UzpZKqYyUtjlU55j8M0pO6q_d91bYmEykCcMHg7sdKDXvKRogMVyfUag3Sqyh.U0gYp5QO2HAupDQ9YbJwufK1y3ssztqbounW7xiHW3USbvcNxrLk.dKlCD4dGMr.7SwY_y.PMsR2sYxbvNMoTrfGCxLz7jwG70aW9YwEGlODT2WLgSpH4u6nnqIyajK6w3dlKhfcZlzrcFuLbLPhN6pM5ZfQFlBDxReqtkNIFLU8xqGOaE3KcHm22q2mQqtnOP_Y_dP7J7Y8a_s2CNfWythOXVeoK9mC86CLDagKxRO95ltIqNA3nhNRIBrIgbipl3S.APHyJh9oxo7XoCj2iTRgsACuoHHEZbQpAHazJ67Dg3NP24ReksXdtoSPaWuHoO5s9.141HRN6FfhA7LYEiEPM6769NsbymqK3uK3hbdVmABDhg9Ny0A3fUAoWqysHiKhKj0GnnCYpTZRe2QA31UPinIrtMv',mdrd: 'awHqfOB7wH_AzxOZiJUukb5TjrD6Tw4vHnBgfKEssxU-1770760852-1.2.1.1-amEu547eFQqtbyksErBzgDhqu2zQjMg0PLUwaufKJ8qPVzCKZtUt7VOZcaZt8x5xbgdP5eksQgqnjj1nyq5KLQ_ELXS8oxeRwcyZ2seH96VbdCLGdmM.iMiSjX456DV84S1447M1Ybgptu.0hyo5NOIH.3CXilONHTQ7a32obo4uHy18rPE3ykrluiScpqLhbWdIp9oFc71zKQuKSiqrMXNHhqX4lRjz1j0A45R.zWqHWSCS0Bg3sLEzMTdxVWxNu9cLzUzJLXov.DH0y5W_Nt9zOU5.QEjepx8mwRvYeoFNqK9QDO26BZmQRliAGz5dNyZsZwB_F7pXIboCg5f7r2apg6f_xFu.Lu07.tW5f1XH2LjVMVw7B3607QpbMNSQi1Cur9vow1yJTH9eX_dx3.terrqzP.EPnbeApVvXbkgOJFag8NUSqkliY7QtkOi5WCBMYlL0OGzCVDc2f1rvfAsgMkRZxjgMeK6nkUTGbcNVG.UwWlWwd0wg09ducgslJS.thRHHPpLTLFPVc7bkTmtVU3wDofduNlIzpqdjNV538pjnK979pAlpXXbUcpUy0mwL.H9oZm.G0eb4WKyrzwTgCkbQXMtAyVfjijsExN850ND69VCelxUn_nTvs2fun3fQ6Pxj0WFJYPbVSZ8gdzy3RX1EcYwotV7eNXnjyZ4CYsQFpZn55Kc3p_bI2IDT8TUZNYThEYSw_pfz1v_Wbwi6kps4KiftGh4sQXoRmLEB8YuKe3XDHyXEwiOrW8JmK3ZOzVXH37zKjzUaxuBokF5synA6j76Hm4GgFE0C9IaTPhI5zAXtduTC_aaA0E5GYumiG2XVieJMEa0Z8etVrhpbJSZ7QwmzRUkXzi1fF5EtUp.nwO2I2yHNopZO66gRZNsH9GnU58_6BQN7Pb_VSSNQcS6UHVu7K_QA7AWzfOR0.UCXieBmoOjeHaoz_2qtU6KW9.EgHHzBhzp_GxtNxUee7fp05.p1dL_Ovv9wJqFcpJR_KTHxp.ZtCvyGGZ04vZzxYUSpjUc91Q1LWx9gvMTeB6aNKkSk8t9zD64RgM7iM1GtEItIrL3Hd9PW28kB9QG4iOt95ZGaEAhTqBAIr.ihbKgzsCx9iBiF1PlsA5vjd__.EVU4lYZaHXcMVKS28LkNkire6xj0PIMV4NUvFXPE18WlTJ8d1h8AtVid0q0xs52BvvtbbDoky0V084IrONcmI_238g8ZCzUWUCpyKumYBmdGwE8yXAu.HxmVWauZN6GwNBhc4jyAEKMkYEEnjO2_vkqR_L_1.x4zr.x8NohNsi8luDSSWNQ2kp9ZlevnLke9hrXUU4_AK5azX_eWQXwJTSsGeE_CvM4IRqm7O6SxxaA8EQEFHiiEiHeAcyijjQrs8GAIpthGrHMczc4oTxwZJf3sRtJWg4VM.HTzAal.E_61o20KN7iPnt0zYvCgtW60wEcl0wipLrpzUSNl8lsHntL0z0tmYxbMEreHtXYT5WlIGXVGFx7iuIGOFcZnUgQUwkIzwM.xkiWuqTfPJ4UMV12wFkK.GQbHaQzQifZrpYo5nIj7zy7s5dRNPow1k1HkUnU79V7LkRmmdF4wjpyn18zSqY_gsdB19dLHAAOxiL06AchTFW4WsZopRcIBXBDZQaUl.2L_qFNF5XhIJsxbRSWfhL6F7auRH9IB1ebFKmXkAPnn0VfmGkumm5LxW1v5xXB8fujk6pT_vIrD_dFnaAeNapUKomdYLd7_mFKKt.F02NpWbDKk4ax0Oyiv9xHNFlcid4KQOCMpzjornvkXMBIk2S._GtO8wMZsBFBaXWVchKDQPAl1MFp_fxYOF3IIVi7c8FWCHjG1j5r2p0dHlq6Ejyyw5W_JlAE7LVNCP3IOtYXZEDnXmDpzKPGIO5DNpujSZVGMoE0x7BReGqgelKT_ppccdXxJ2uOxnHPDC9OQSX6lqk7LD2qiApic3Ab1btANSRzeCBHoPjbzUbNLWt_vDsFnDPz5F5UessmRN7VCjpz0X.Zy_hQF5ExIuxCG8H1fjGI3IsYgp43RGVm4mzsLjIhi_OiHyPOxyvqeq6z.wfd.NT8mzm3lzZXwyxtyc5Fm4GE6PRT8XBA6JEOVF86Io2pEZJN21GMOrfWtCa.A_T4KEZHBtW8SekFr73DWifoF1nXANkYvYE74FelavYIkJ8k0EOkJBH.s1gxiK0cmXsRhi56DA4H1T06nzqSbTlXhw25A4FunqnP1MYYZ4x2Z5m91DApro7RES5BsPVUsZG6E.ajN62fd_PKrhQf8SJejJ731JJc0g9p0qv05vU7i4rP.r_cH7aCg4.63EAmJnqmqjMb3hqDG24z3GIiEUNfJ2a78HzQU4EkPmIJo.1MgoScxJIn6nNULJhUuwocwjxQ9A08nL8X7imQ52oP3QAIBbZOoAzHz8PHQ6lbPR_KT7USYjZPRbuiTl0yPa.D2Yua86GLHuey_xDUbgeJS6OPOCTvGfs5uxw_rLFTRLjDwCvvIVXCBCxmGow7xLaHmdJFbHXvERsDmeuYxR4X0yauN2JUYcOrcdIJeIjn2VQp9gGLlrbu6fI.WmtgqKU7alKOlZ9v0Z6qD12DDbpGNuL8MAi78fBcTbxkwh9NizFF.N012uQtrOUTCrG9tDWr0xsu1CX_yajlQ72Q',};var a = document.createElement('script');a.src = '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=9cbee1bd0b270fa3';window._cf_chl_opt.cOgUHash = location.hash === '' && location.href.indexOf('#') !== -1 ? '#' : location.hash;window._cf_chl_opt.cOgUQuery = location.search === '' && location.href.slice(0, location.href.length - window._cf_chl_opt.cOgUHash.length).indexOf('?') !== -1 ? '?' : location.search;if (window.history && window.history.replaceState) {var ogU = location.pathname + window._cf_chl_opt.cOgUQuery + window._cf_chl_opt.cOgUHash;history.replaceState(null, null,"\/api\/scheduler\/run?__cf_chl_rt_tk=EbAPuDKktzmunFa.gcuDw_pjgYz15pUOPi4TZWxWlUk-1770760852-1.0.1.1-8drcbBTxFVIJSkw_5JaWGNTFlc7l30OYRWVnDN7Fxhg"+ window._cf_chl_opt.cOgUHash);a.onload = function() {history.replaceState(null, null, ogU);}}document.getElementsByTagName('head')[0].appendChild(a);}());</script></body></html>
kick	Trigger scheduler	2026-02-10T22:00:52.0433924Z ##[error]Process completed with exit code 1.

===== END FILE: reality/failure-logs/228731024_Scheduler_Kick.log =====

### File: reality/failure-logs/228798833_e2e_playwright.log
===== FILE: reality/failure-logs/228798833_e2e_playwright.log =====
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7254139Z     Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7257145Z     Error: element(s) not found
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7262573Z        8 |   await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail/);
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7265935Z     Error Context: test-results/ops-ops-render-stamp-goes-ok/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267809Z     Error: page.waitForResponse: Test timeout of 20000ms exceeded.
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7271782Z     Error Context: test-results/ops-ops-truth-chain-sections-render/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7272200Z   2 failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7490702Z ##[error]Process completed with exit code 1.

===== END FILE: reality/failure-logs/228798833_e2e_playwright.log =====

### File: reality/failure-logs/230643544_Forecast_Daily_Pipeline.log
===== FILE: reality/failure-logs/230643544_Forecast_Daily_Pipeline.log =====
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:46.6991395Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.8677300Z [36;1m  echo "status=failed" >> $GITHUB_OUTPUT[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.8708313Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9555524Z   Missing price data: 80.7%
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9557662Z   ❌ CIRCUIT OPEN: Missing price data 80.7% exceeds threshold 5%
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:49.9636120Z ##[error]Process completed with exit code 1.
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:50.6811286Z [36;1m  echo "❌ Pipeline failed" >> $GITHUB_STEP_SUMMARY[0m
Daily Forecast Run	UNKNOWN STEP	2026-02-06T21:25:50.6843328Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}

===== END FILE: reality/failure-logs/230643544_Forecast_Daily_Pipeline.log =====

### File: reality/failure-logs/230643545_Forecast_Monthly_Report.log
===== FILE: reality/failure-logs/230643545_Forecast_Monthly_Report.log =====

===== END FILE: reality/failure-logs/230643545_Forecast_Monthly_Report.log =====

### File: reality/failure-logs/230903513_CI_Determinism_Check.log
===== FILE: reality/failure-logs/230903513_CI_Determinism_Check.log =====
determinism-check	Run Determinism Tests	2026-02-08T22:33:03.8310502Z # fail 0
determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6319305Z     params: { missingProperty: 'generated_at' },
determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6535583Z ##[error]Process completed with exit code 1.

===== END FILE: reality/failure-logs/230903513_CI_Determinism_Check.log =====

### File: reality/failure-logs/230907136_Forecast_Rollback.log
===== FILE: reality/failure-logs/230907136_Forecast_Rollback.log =====

===== END FILE: reality/failure-logs/230907136_Forecast_Rollback.log =====

### File: reality/failure-logs/232183192_Monitor_Production_Artifacts.log
===== FILE: reality/failure-logs/232183192_Monitor_Production_Artifacts.log =====
liveness	UNKNOWN STEP	2026-02-10T19:00:01.7085382Z ##[group]Run set -euo pipefail
liveness	UNKNOWN STEP	2026-02-10T19:00:01.7086606Z [36;1mset -euo pipefail[0m
liveness	UNKNOWN STEP	2026-02-10T19:00:01.9311817Z curl: (22) The requested URL returned error: 403
liveness	UNKNOWN STEP	2026-02-10T19:00:01.9347815Z ##[error]Process completed with exit code 22.

===== END FILE: reality/failure-logs/232183192_Monitor_Production_Artifacts.log =====

## Directory: reality

### File: reality/runs_224941564.json
===== FILE: reality/runs_224941564.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T23:05:35Z","databaseId":21844377739,"event":"workflow_run","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:16Z","databaseId":21803088236,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"64d11b044721777059c7c4a802abe943d531df51","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:27Z","databaseId":21802921511,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"113100516f6e984853e10a56e61bd47e1b385594","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:49Z","databaseId":21802869141,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"73cb1e2a875d9b85185fa5a71e8eb2b1cb35dfd1","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:06Z","databaseId":21802651494,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:56Z","databaseId":21802620240,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"a29802a5d73d1745825aa128e095727eb0eeef8f","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:09Z","databaseId":21802429734,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"acc2b18812bd8a54f68842a5a38cc0ddaaf2bc81","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:09Z","databaseId":21802402897,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"77ea81a0ac09c0bb38fe181ec70a7bfac3e42dc2","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:52Z","databaseId":21802369407,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"6815faddcbc896874b0cf32a2b7dfd034347fd6b","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:14Z","databaseId":21802317483,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"3289de64f90386dc999b8d6fc013497b05f35e25","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:46Z","databaseId":21801961707,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"ade8b42e6109afb3f8887b5c61e708f121605e66","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:00Z","databaseId":21801951354,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"45b8b6f82906ea90c6abf08cdc6eaa1365a1c0ff","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:48Z","databaseId":21801839102,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"776443f1d6a8c2e69d8ddce7d5e4b01ea09dd8e8","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:30Z","databaseId":21801752370,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:07Z","databaseId":21801448066,"event":"push","headBranch":"main","headSha":"a2f05c20d3092c7f08eccd4aa18dcca537d39612","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:12Z","databaseId":21801407298,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"3af8c1c9fd60e4e5f70288a23b70c6fdef4d7d3c","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:31Z","databaseId":21801327712,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:43Z","databaseId":21765716950,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:48Z","databaseId":21763436274,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:35Z","databaseId":21762291837,"event":"push","headBranch":"main","headSha":"bbd5cdff446b85964fc8cdab4b57e009dca6c1e2","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:59Z","databaseId":21761195360,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:13Z","databaseId":21759000530,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:29Z","databaseId":21757558018,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:28Z","databaseId":21722187003,"event":"push","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:47Z","databaseId":21721655293,"event":"push","headBranch":"main","headSha":"6538c3962b214329e537fd78a21707480854198d","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:47Z","databaseId":21721165247,"event":"push","headBranch":"main","headSha":"f173f26d19f9b3f58fb87ed34120a9836cfe3379","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:55Z","databaseId":21720708994,"event":"push","headBranch":"main","headSha":"c0a8098d8a622eaf5cd904ef4ecc0b41611f10b1","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:28Z","databaseId":21720218606,"event":"push","headBranch":"main","headSha":"685c1554400c9cfc4082b7f43b43ae0234c72e02","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:34Z","databaseId":21719437684,"event":"push","headBranch":"main","headSha":"46f5d3fe3e1cb84ec712ca4e9503f5abef113ea5","status":"completed","workflowName":"v3 Finalizer"},{"conclusion":"failure","createdAt":"2026-02-05T16:03:26Z","databaseId":21718738949,"event":"push","headBranch":"main","headSha":"9ba866ca06fceabdd4e1e6ac8f275383d22cc8c3","status":"completed","workflowName":"v3 Finalizer"}]

===== END FILE: reality/runs_224941564.json =====

### File: reality/runs_225058763.json
===== FILE: reality/runs_225058763.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T23:05:24Z","databaseId":21844372473,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T18:31:08Z","databaseId":21803183951,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"46fbd760c248364435675a33f6789ac7c1bf7f06","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:16Z","databaseId":21803088262,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"64d11b044721777059c7c4a802abe943d531df51","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:27Z","databaseId":21802921449,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"113100516f6e984853e10a56e61bd47e1b385594","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:48Z","databaseId":21802868954,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"73cb1e2a875d9b85185fa5a71e8eb2b1cb35dfd1","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:06Z","databaseId":21802651543,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:56Z","databaseId":21802620164,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"a29802a5d73d1745825aa128e095727eb0eeef8f","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:09Z","databaseId":21802429926,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"acc2b18812bd8a54f68842a5a38cc0ddaaf2bc81","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:08Z","databaseId":21802402768,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"77ea81a0ac09c0bb38fe181ec70a7bfac3e42dc2","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:51Z","databaseId":21802369101,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"6815faddcbc896874b0cf32a2b7dfd034347fd6b","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:13Z","databaseId":21802317159,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"3289de64f90386dc999b8d6fc013497b05f35e25","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:44Z","databaseId":21801961395,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"ade8b42e6109afb3f8887b5c61e708f121605e66","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:00Z","databaseId":21801951543,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"45b8b6f82906ea90c6abf08cdc6eaa1365a1c0ff","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:48Z","databaseId":21801839032,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"776443f1d6a8c2e69d8ddce7d5e4b01ea09dd8e8","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:31Z","databaseId":21801752533,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:07Z","databaseId":21801447903,"event":"push","headBranch":"main","headSha":"a2f05c20d3092c7f08eccd4aa18dcca537d39612","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:13Z","databaseId":21801407512,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"3af8c1c9fd60e4e5f70288a23b70c6fdef4d7d3c","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:31Z","databaseId":21801327760,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:41Z","databaseId":21765715872,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:49Z","databaseId":21763436603,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:36Z","databaseId":21762292182,"event":"push","headBranch":"main","headSha":"bbd5cdff446b85964fc8cdab4b57e009dca6c1e2","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:59Z","databaseId":21761195723,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:15Z","databaseId":21759001322,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:31Z","databaseId":21757558791,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:32Z","databaseId":21722188550,"event":"push","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:46Z","databaseId":21721655110,"event":"push","headBranch":"main","headSha":"6538c3962b214329e537fd78a21707480854198d","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:48Z","databaseId":21721165478,"event":"push","headBranch":"main","headSha":"f173f26d19f9b3f58fb87ed34120a9836cfe3379","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:52Z","databaseId":21720707632,"event":"push","headBranch":"main","headSha":"c0a8098d8a622eaf5cd904ef4ecc0b41611f10b1","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:29Z","databaseId":21720218907,"event":"push","headBranch":"main","headSha":"685c1554400c9cfc4082b7f43b43ae0234c72e02","status":"completed","workflowName":"v3 Scrape Template"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:36Z","databaseId":21719439086,"event":"push","headBranch":"main","headSha":"46f5d3fe3e1cb84ec712ca4e9503f5abef113ea5","status":"completed","workflowName":"v3 Scrape Template"}]

===== END FILE: reality/runs_225058763.json =====

### File: reality/runs_225061032.json
===== FILE: reality/runs_225061032.json =====
[{"conclusion":"success","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656562,"event":"push","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-09T14:45:06Z","databaseId":21829588790,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"7fd104212f5d8a67a2959b4dae544c220c8ca3eb","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-09T07:22:11Z","databaseId":21815967165,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"80cd6604e42fa8f68b9bb402a7c69b379c78ee1c","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-09T06:56:35Z","databaseId":21815382431,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"aadd466353b0da2dbde5755c6a09cc5303472b82","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T22:34:29Z","databaseId":21806632526,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"d440e65cdb347fda6657fadd5bcb31be219a8d19","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T22:32:48Z","databaseId":21806609309,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"501c0d82a52d908aa57cbeef1a1cc86caed89d8a","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T22:29:44Z","databaseId":21806564938,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"5fde54ada8de25f077cfedd602649d01c6d26622","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T19:32:51Z","databaseId":21804051323,"event":"push","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T19:24:36Z","databaseId":21803935252,"event":"pull_request","headBranch":"fix/e2e-nonblocking-on-push","headSha":"cc12d6164e6431c27f45d1f1de90290c5e5b6cd1","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T19:12:28Z","databaseId":21803764104,"event":"push","headBranch":"main","headSha":"0c00d132290e40ef2fbe9cc8f75f46b2c19c17ad","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T19:00:25Z","databaseId":21803588715,"event":"pull_request","headBranch":"fix/main-green-wp16-e2e","headSha":"40858b67075a664086ddf8cbcff45bbf155f55ec","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T18:58:49Z","databaseId":21803567409,"event":"pull_request","headBranch":"fix/main-green-wp16-e2e","headSha":"f37020146235fc499f64499694b645968cff5ddb","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T18:31:11Z","databaseId":21803184655,"event":"pull_request","headBranch":"fix/main-green-wp16-e2e","headSha":"46fbd760c248364435675a33f6789ac7c1bf7f06","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T18:24:19Z","databaseId":21803088630,"event":"pull_request","headBranch":"fix/main-green-wp16-e2e","headSha":"64d11b044721777059c7c4a802abe943d531df51","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T18:12:29Z","databaseId":21802921758,"event":"pull_request","headBranch":"fix/main-green-wp16-e2e","headSha":"113100516f6e984853e10a56e61bd47e1b385594","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T18:08:52Z","databaseId":21802869925,"event":"pull_request","headBranch":"fix/main-green-wp16-e2e","headSha":"73cb1e2a875d9b85185fa5a71e8eb2b1cb35dfd1","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T17:54:11Z","databaseId":21802652454,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T17:52:04Z","databaseId":21802622347,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"a29802a5d73d1745825aa128e095727eb0eeef8f","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"success","createdAt":"2026-02-08T17:38:19Z","databaseId":21802432537,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"acc2b18812bd8a54f68842a5a38cc0ddaaf2bc81","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:19Z","databaseId":21802404755,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"77ea81a0ac09c0bb38fe181ec70a7bfac3e42dc2","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T17:34:02Z","databaseId":21802371813,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"6815faddcbc896874b0cf32a2b7dfd034347fd6b","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:24Z","databaseId":21802320060,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"3289de64f90386dc999b8d6fc013497b05f35e25","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:55Z","databaseId":21801963955,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"ade8b42e6109afb3f8887b5c61e708f121605e66","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:10Z","databaseId":21801954327,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"45b8b6f82906ea90c6abf08cdc6eaa1365a1c0ff","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:58Z","databaseId":21801840666,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"776443f1d6a8c2e69d8ddce7d5e4b01ea09dd8e8","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:38Z","databaseId":21801754062,"event":"pull_request","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:44Z","databaseId":21765717399,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:51Z","databaseId":21763437412,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-06T18:20:01Z","databaseId":21761196454,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:16Z","databaseId":21759001912,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"CI Gates - Quality & Budget Checks"}]

===== END FILE: reality/runs_225061032.json =====

### File: reality/runs_225061033.json
===== FILE: reality/runs_225061033.json =====
[{"conclusion":"success","createdAt":"2026-02-08T04:28:18Z","databaseId":21792234114,"event":"schedule","headBranch":"main","headSha":"ed5b407c5c853cbd087c2bfbe0693dc0e507e12d","status":"completed","workflowName":"Cleanup Daily Snapshots"},{"conclusion":"success","createdAt":"2026-02-01T04:23:22Z","databaseId":21556544268,"event":"schedule","headBranch":"main","headSha":"9ef89cb48ec555cd3b675f7ed3d4e801049638f9","status":"completed","workflowName":"Cleanup Daily Snapshots"},{"conclusion":"success","createdAt":"2026-01-25T03:47:29Z","databaseId":21326403540,"event":"schedule","headBranch":"main","headSha":"b4b505d45fbfc531b6ad6bf5db62be8b4e087944","status":"completed","workflowName":"Cleanup Daily Snapshots"}]

===== END FILE: reality/runs_225061033.json =====

### File: reality/runs_226498514.json
===== FILE: reality/runs_226498514.json =====
[{"conclusion":"failure","createdAt":"2026-02-08T17:54:07Z","databaseId":21802651686,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:55Z","databaseId":21802620069,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"a29802a5d73d1745825aa128e095727eb0eeef8f","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:08Z","databaseId":21802429619,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"acc2b18812bd8a54f68842a5a38cc0ddaaf2bc81","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:09Z","databaseId":21802402954,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"77ea81a0ac09c0bb38fe181ec70a7bfac3e42dc2","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:52Z","databaseId":21802369475,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"6815faddcbc896874b0cf32a2b7dfd034347fd6b","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:12Z","databaseId":21802316957,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"3289de64f90386dc999b8d6fc013497b05f35e25","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:46Z","databaseId":21801961801,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"ade8b42e6109afb3f8887b5c61e708f121605e66","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:01Z","databaseId":21801951774,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"45b8b6f82906ea90c6abf08cdc6eaa1365a1c0ff","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:49Z","databaseId":21801839245,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"776443f1d6a8c2e69d8ddce7d5e4b01ea09dd8e8","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:30Z","databaseId":21801752446,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:06Z","databaseId":21801447865,"event":"push","headBranch":"main","headSha":"a2f05c20d3092c7f08eccd4aa18dcca537d39612","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:13Z","databaseId":21801407447,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"3af8c1c9fd60e4e5f70288a23b70c6fdef4d7d3c","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:31Z","databaseId":21801327828,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:41Z","databaseId":21765716089,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:50Z","databaseId":21763436746,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:37Z","databaseId":21762292584,"event":"push","headBranch":"main","headSha":"bbd5cdff446b85964fc8cdab4b57e009dca6c1e2","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:59Z","databaseId":21761195521,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:14Z","databaseId":21759001069,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:30Z","databaseId":21757558370,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:28Z","databaseId":21722186711,"event":"push","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:45Z","databaseId":21721654418,"event":"push","headBranch":"main","headSha":"6538c3962b214329e537fd78a21707480854198d","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:48Z","databaseId":21721165679,"event":"push","headBranch":"main","headSha":"f173f26d19f9b3f58fb87ed34120a9836cfe3379","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:53Z","databaseId":21720707841,"event":"push","headBranch":"main","headSha":"c0a8098d8a622eaf5cd904ef4ecc0b41611f10b1","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:30Z","databaseId":21720219590,"event":"push","headBranch":"main","headSha":"685c1554400c9cfc4082b7f43b43ae0234c72e02","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:37Z","databaseId":21719439451,"event":"push","headBranch":"main","headSha":"46f5d3fe3e1cb84ec712ca4e9503f5abef113ea5","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T16:03:29Z","databaseId":21718740369,"event":"push","headBranch":"main","headSha":"9ba866ca06fceabdd4e1e6ac8f275383d22cc8c3","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T15:52:57Z","databaseId":21718356759,"event":"push","headBranch":"main","headSha":"807cea5c1eea8b5a805be0658cc0568bfe08aefc","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-05T08:10:50Z","databaseId":21703808858,"event":"push","headBranch":"main","headSha":"90517491106eb7afc90bc62bbd40931975e33f60","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-04T23:41:53Z","databaseId":21692735551,"event":"push","headBranch":"main","headSha":"d5e78ee6a7ddb18ef1c132e7477c093493ecf06c","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"},{"conclusion":"failure","createdAt":"2026-02-04T23:30:29Z","databaseId":21692470830,"event":"push","headBranch":"main","headSha":"a20220fd7f64e644eac0cabdbda2df6614866b9b","status":"completed","workflowName":"WP16 Manual - Market Prices (Stooq)"}]

===== END FILE: reality/runs_226498514.json =====

### File: reality/runs_227016585.json
===== FILE: reality/runs_227016585.json =====
[{"conclusion":"failure","createdAt":"2026-02-10T07:32:23Z","databaseId":21855817633,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"failure","createdAt":"2026-02-09T07:32:38Z","databaseId":21816235658,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-08T07:08:04Z","databaseId":21794123536,"event":"schedule","headBranch":"main","headSha":"f18e6aba85794d8bb98192aa19ab5e36a28ec35d","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-07T07:02:49Z","databaseId":21776133820,"event":"schedule","headBranch":"main","headSha":"88917eb78e1de16457eaa76e750a2392112525d2","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-06T07:14:04Z","databaseId":21742115482,"event":"schedule","headBranch":"main","headSha":"8053ccf383698e394517249e2bedab4435895c95","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-05T07:17:18Z","databaseId":21702460265,"event":"schedule","headBranch":"main","headSha":"d5e78ee6a7ddb18ef1c132e7477c093493ecf06c","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-04T07:11:46Z","databaseId":21662139919,"event":"schedule","headBranch":"main","headSha":"3d1ed1631c742574a8c64581679a6243f1fefbec","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-03T07:11:09Z","databaseId":21620705530,"event":"schedule","headBranch":"main","headSha":"8b74361a8b4a144ad0ffabf794720eb553e22393","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-02T07:18:11Z","databaseId":21580889253,"event":"schedule","headBranch":"main","headSha":"df00cdfd519c074e79f24dc20d52995f7bc59293","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-02-01T07:06:55Z","databaseId":21558621506,"event":"schedule","headBranch":"main","headSha":"9ef89cb48ec555cd3b675f7ed3d4e801049638f9","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-01-31T06:58:25Z","databaseId":21540604631,"event":"schedule","headBranch":"main","headSha":"08396b7da8f497cfa74865b2b42941ff6d0f1d6b","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-01-30T07:08:45Z","databaseId":21507560718,"event":"schedule","headBranch":"main","headSha":"107256ca7d4b7fd9bb79b804e062ea065eba635f","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-01-29T07:07:55Z","databaseId":21468989902,"event":"schedule","headBranch":"main","headSha":"b062d5146fb65ceabc010eff87481c2917aeab6d","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-01-28T06:55:04Z","databaseId":21428335759,"event":"schedule","headBranch":"main","headSha":"7817e28ca0ce9ac323775a668606a9eff66eb06e","status":"completed","workflowName":"Refresh Health Assets"},{"conclusion":"success","createdAt":"2026-01-27T06:54:51Z","databaseId":21387615360,"event":"schedule","headBranch":"main","headSha":"57ee5109c101265397bba17df0520fd21305dc70","status":"completed","workflowName":"Refresh Health Assets"}]

===== END FILE: reality/runs_227016585.json =====

### File: reality/runs_227442620.json
===== FILE: reality/runs_227442620.json =====
[{"conclusion":"success","createdAt":"2026-02-10T08:02:48Z","databaseId":21856604564,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"success","createdAt":"2026-02-09T08:01:08Z","databaseId":21816946844,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T18:58:48Z","databaseId":21803567207,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"f37020146235fc499f64499694b645968cff5ddb","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T18:31:09Z","databaseId":21803184134,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"46fbd760c248364435675a33f6789ac7c1bf7f06","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:15Z","databaseId":21803088081,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"64d11b044721777059c7c4a802abe943d531df51","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:27Z","databaseId":21802921390,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"113100516f6e984853e10a56e61bd47e1b385594","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:50Z","databaseId":21802869317,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"73cb1e2a875d9b85185fa5a71e8eb2b1cb35dfd1","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:07Z","databaseId":21802651758,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:54Z","databaseId":21802619835,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"a29802a5d73d1745825aa128e095727eb0eeef8f","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:08Z","databaseId":21802429530,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"acc2b18812bd8a54f68842a5a38cc0ddaaf2bc81","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:10Z","databaseId":21802403001,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"77ea81a0ac09c0bb38fe181ec70a7bfac3e42dc2","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:51Z","databaseId":21802369254,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"6815faddcbc896874b0cf32a2b7dfd034347fd6b","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:13Z","databaseId":21802317290,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"3289de64f90386dc999b8d6fc013497b05f35e25","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:45Z","databaseId":21801961617,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"ade8b42e6109afb3f8887b5c61e708f121605e66","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:01Z","databaseId":21801951897,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"45b8b6f82906ea90c6abf08cdc6eaa1365a1c0ff","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:48Z","databaseId":21801838957,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"776443f1d6a8c2e69d8ddce7d5e4b01ea09dd8e8","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:30Z","databaseId":21801752296,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:06Z","databaseId":21801447808,"event":"push","headBranch":"main","headSha":"a2f05c20d3092c7f08eccd4aa18dcca537d39612","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:13Z","databaseId":21801407572,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"3af8c1c9fd60e4e5f70288a23b70c6fdef4d7d3c","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:32Z","databaseId":21801327945,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:42Z","databaseId":21765716344,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:48Z","databaseId":21763436075,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:36Z","databaseId":21762292392,"event":"push","headBranch":"main","headSha":"bbd5cdff446b85964fc8cdab4b57e009dca6c1e2","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:58Z","databaseId":21761194967,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:13Z","databaseId":21759000289,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:28Z","databaseId":21757557435,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:29Z","databaseId":21722187440,"event":"push","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:47Z","databaseId":21721655585,"event":"push","headBranch":"main","headSha":"6538c3962b214329e537fd78a21707480854198d","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:49Z","databaseId":21721165895,"event":"push","headBranch":"main","headSha":"f173f26d19f9b3f58fb87ed34120a9836cfe3379","status":"completed","workflowName":"Ops Daily Snapshot"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:54Z","databaseId":21720708692,"event":"push","headBranch":"main","headSha":"c0a8098d8a622eaf5cd904ef4ecc0b41611f10b1","status":"completed","workflowName":"Ops Daily Snapshot"}]

===== END FILE: reality/runs_227442620.json =====

### File: reality/runs_227511913.json
===== FILE: reality/runs_227511913.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T22:54:36Z","databaseId":21844075239,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T18:58:48Z","databaseId":21803567264,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"f37020146235fc499f64499694b645968cff5ddb","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T18:31:08Z","databaseId":21803183860,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"46fbd760c248364435675a33f6789ac7c1bf7f06","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:15Z","databaseId":21803088132,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"64d11b044721777059c7c4a802abe943d531df51","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:28Z","databaseId":21802921580,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"113100516f6e984853e10a56e61bd47e1b385594","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:49Z","databaseId":21802869042,"event":"push","headBranch":"fix/main-green-wp16-e2e","headSha":"73cb1e2a875d9b85185fa5a71e8eb2b1cb35dfd1","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:07Z","databaseId":21802651817,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:55Z","databaseId":21802620004,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"a29802a5d73d1745825aa128e095727eb0eeef8f","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:10Z","databaseId":21802430003,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"acc2b18812bd8a54f68842a5a38cc0ddaaf2bc81","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:08Z","databaseId":21802402692,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"77ea81a0ac09c0bb38fe181ec70a7bfac3e42dc2","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:51Z","databaseId":21802369181,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"6815faddcbc896874b0cf32a2b7dfd034347fd6b","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:13Z","databaseId":21802317065,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"3289de64f90386dc999b8d6fc013497b05f35e25","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:45Z","databaseId":21801961544,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"ade8b42e6109afb3f8887b5c61e708f121605e66","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:01Z","databaseId":21801951657,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"45b8b6f82906ea90c6abf08cdc6eaa1365a1c0ff","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:47Z","databaseId":21801838869,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"776443f1d6a8c2e69d8ddce7d5e4b01ea09dd8e8","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:29Z","databaseId":21801752139,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:08Z","databaseId":21801448139,"event":"push","headBranch":"main","headSha":"a2f05c20d3092c7f08eccd4aa18dcca537d39612","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:12Z","databaseId":21801407378,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"3af8c1c9fd60e4e5f70288a23b70c6fdef4d7d3c","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:32Z","databaseId":21801327882,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:42Z","databaseId":21765716619,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:50Z","databaseId":21763436957,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:36Z","databaseId":21762291971,"event":"push","headBranch":"main","headSha":"bbd5cdff446b85964fc8cdab4b57e009dca6c1e2","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:58Z","databaseId":21761195150,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:14Z","databaseId":21759000835,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:27Z","databaseId":21757557210,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:29Z","databaseId":21722187257,"event":"push","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:45Z","databaseId":21721654637,"event":"push","headBranch":"main","headSha":"6538c3962b214329e537fd78a21707480854198d","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:49Z","databaseId":21721166118,"event":"push","headBranch":"main","headSha":"f173f26d19f9b3f58fb87ed34120a9836cfe3379","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:54Z","databaseId":21720708368,"event":"push","headBranch":"main","headSha":"c0a8098d8a622eaf5cd904ef4ecc0b41611f10b1","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:31Z","databaseId":21720220149,"event":"push","headBranch":"main","headSha":"685c1554400c9cfc4082b7f43b43ae0234c72e02","status":"completed","workflowName":"EOD Latest (NASDAQ-100)"}]

===== END FILE: reality/runs_227511913.json =====

### File: reality/runs_228731024.json
===== FILE: reality/runs_228731024.json =====
[{"conclusion":"failure","createdAt":"2026-02-10T22:00:48Z","databaseId":21884041001,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T21:00:42Z","databaseId":21882226017,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T19:32:57Z","databaseId":21879496975,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T17:18:40Z","databaseId":21875101296,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T15:35:07Z","databaseId":21871357390,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T13:54:40Z","databaseId":21867698272,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T12:02:27Z","databaseId":21864079710,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T11:14:37Z","databaseId":21862640214,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T10:13:32Z","databaseId":21860705577,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T09:13:07Z","databaseId":21858707411,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T07:32:23Z","databaseId":21855817626,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T05:48:33Z","databaseId":21853382635,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-10T03:29:42Z","databaseId":21850561264,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T23:53:39Z","databaseId":21845637661,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T22:58:55Z","databaseId":21844191692,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T21:57:14Z","databaseId":21842312460,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T20:58:16Z","databaseId":21840398302,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T19:40:56Z","databaseId":21838014567,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T18:04:35Z","databaseId":21835654127,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T16:15:10Z","databaseId":21832753520,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T15:12:08Z","databaseId":21830568692,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T13:48:46Z","databaseId":21827638277,"event":"schedule","headBranch":"main","headSha":"df8b22eb4a3cde00594c3ab9bc973852f6a5af66","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T11:57:21Z","databaseId":21824106542,"event":"schedule","headBranch":"main","headSha":"df8b22eb4a3cde00594c3ab9bc973852f6a5af66","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T10:16:54Z","databaseId":21821056946,"event":"schedule","headBranch":"main","headSha":"df8b22eb4a3cde00594c3ab9bc973852f6a5af66","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T09:11:01Z","databaseId":21818951779,"event":"schedule","headBranch":"main","headSha":"df8b22eb4a3cde00594c3ab9bc973852f6a5af66","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T07:32:26Z","databaseId":21816231122,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T05:47:25Z","databaseId":21813888922,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-09T03:21:27Z","databaseId":21811214288,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-08T23:46:48Z","databaseId":21807619345,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Scheduler Kick"},{"conclusion":"failure","createdAt":"2026-02-08T22:48:31Z","databaseId":21806822221,"event":"schedule","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"Scheduler Kick"}]

===== END FILE: reality/runs_228731024.json =====

### File: reality/runs_228798833.json
===== FILE: reality/runs_228798833.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656565,"event":"push","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-08T19:32:51Z","databaseId":21804051347,"event":"push","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-08T19:12:28Z","databaseId":21803764109,"event":"push","headBranch":"main","headSha":"0c00d132290e40ef2fbe9cc8f75f46b2c19c17ad","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:11Z","databaseId":21802652461,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:44Z","databaseId":21765717420,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:51Z","databaseId":21763437381,"event":"push","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:38Z","databaseId":21762293282,"event":"push","headBranch":"main","headSha":"bbd5cdff446b85964fc8cdab4b57e009dca6c1e2","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-06T18:20:01Z","databaseId":21761196527,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:16Z","databaseId":21759001936,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:32Z","databaseId":21757559424,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:33Z","databaseId":21722189319,"event":"push","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:49Z","databaseId":21721656313,"event":"push","headBranch":"main","headSha":"6538c3962b214329e537fd78a21707480854198d","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:50Z","databaseId":21721166670,"event":"push","headBranch":"main","headSha":"f173f26d19f9b3f58fb87ed34120a9836cfe3379","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:56Z","databaseId":21720709668,"event":"push","headBranch":"main","headSha":"c0a8098d8a622eaf5cd904ef4ecc0b41611f10b1","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:32Z","databaseId":21720220956,"event":"push","headBranch":"main","headSha":"685c1554400c9cfc4082b7f43b43ae0234c72e02","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:38Z","databaseId":21719440266,"event":"push","headBranch":"main","headSha":"46f5d3fe3e1cb84ec712ca4e9503f5abef113ea5","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T16:03:31Z","databaseId":21718742333,"event":"push","headBranch":"main","headSha":"9ba866ca06fceabdd4e1e6ac8f275383d22cc8c3","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T15:52:58Z","databaseId":21718357388,"event":"push","headBranch":"main","headSha":"807cea5c1eea8b5a805be0658cc0568bfe08aefc","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-05T08:10:51Z","databaseId":21703809534,"event":"push","headBranch":"main","headSha":"90517491106eb7afc90bc62bbd40931975e33f60","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T23:41:55Z","databaseId":21692736434,"event":"push","headBranch":"main","headSha":"d5e78ee6a7ddb18ef1c132e7477c093493ecf06c","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T23:30:30Z","databaseId":21692471424,"event":"push","headBranch":"main","headSha":"a20220fd7f64e644eac0cabdbda2df6614866b9b","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T22:57:19Z","databaseId":21691643965,"event":"push","headBranch":"main","headSha":"1c870f9b820f5facb8bb63408b47274856efd77c","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T22:36:14Z","databaseId":21691072141,"event":"push","headBranch":"main","headSha":"7e239b8727e6def082dbe5721c78d3fbe7871611","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T22:19:00Z","databaseId":21690595276,"event":"push","headBranch":"main","headSha":"674bdfe14d2824d2138151e80e35c473503c9593","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T22:02:24Z","databaseId":21690108816,"event":"push","headBranch":"main","headSha":"7b21b74d3eff64b53ea65419822096c6301f864a","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T19:18:11Z","databaseId":21685008340,"event":"push","headBranch":"main","headSha":"62979cc41d4093ffee025dffff79236f3f5a4108","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T19:04:05Z","databaseId":21684577058,"event":"push","headBranch":"main","headSha":"9334aee3bc3c9cbcf4c2f1d648c6f319f7ce0a68","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T18:50:55Z","databaseId":21684158239,"event":"push","headBranch":"main","headSha":"5b15dbc2eef7d68f1344f946644a87cb0b6c8848","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T17:47:30Z","databaseId":21682150177,"event":"push","headBranch":"main","headSha":"716a6fc05e9600606d4cd4b850d4af3aa41e4c7c","status":"completed","workflowName":"e2e-playwright"},{"conclusion":"failure","createdAt":"2026-02-04T17:28:21Z","databaseId":21681541199,"event":"push","headBranch":"main","headSha":"c92008dcc97d1cd0eea06e7c95b7de7b824cf8ac","status":"completed","workflowName":"e2e-playwright"}]

===== END FILE: reality/runs_228798833.json =====

### File: reality/runs_230643544.json
===== FILE: reality/runs_230643544.json =====
[{"conclusion":"success","createdAt":"2026-02-10T21:37:13Z","databaseId":21883339643,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Forecast Daily Pipeline"},{"conclusion":"success","createdAt":"2026-02-09T21:34:14Z","databaseId":21841570005,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Forecast Daily Pipeline"},{"conclusion":"failure","createdAt":"2026-02-06T21:24:48Z","databaseId":21766433410,"event":"schedule","headBranch":"main","headSha":"442398f1d6f3801f0f11edf24ed831fb57f958e2","status":"completed","workflowName":"Forecast Daily Pipeline"},{"conclusion":"success","createdAt":"2026-02-05T21:22:53Z","databaseId":21729000875,"event":"schedule","headBranch":"main","headSha":"a1e7c59c8427a494825a20ba0e31aa496925dd0a","status":"completed","workflowName":"Forecast Daily Pipeline"}]

===== END FILE: reality/runs_230643544.json =====

### File: reality/runs_230643545.json
===== FILE: reality/runs_230643545.json =====
[]

===== END FILE: reality/runs_230643545.json =====

### File: reality/runs_230643546.json
===== FILE: reality/runs_230643546.json =====
[{"conclusion":"success","createdAt":"2026-02-08T06:35:01Z","databaseId":21793741108,"event":"schedule","headBranch":"main","headSha":"ed5b407c5c853cbd087c2bfbe0693dc0e507e12d","status":"completed","workflowName":"Forecast Weekly Training"}]

===== END FILE: reality/runs_230643546.json =====

### File: reality/runs_230903513.json
===== FILE: reality/runs_230903513.json =====
[{"conclusion":"success","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656537,"event":"push","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-09T14:45:06Z","databaseId":21829588789,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"7fd104212f5d8a67a2959b4dae544c220c8ca3eb","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-09T07:22:11Z","databaseId":21815967135,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"80cd6604e42fa8f68b9bb402a7c69b379c78ee1c","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-09T06:56:35Z","databaseId":21815382422,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"aadd466353b0da2dbde5755c6a09cc5303472b82","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-08T22:34:29Z","databaseId":21806632528,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"d440e65cdb347fda6657fadd5bcb31be219a8d19","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"failure","createdAt":"2026-02-08T22:32:48Z","databaseId":21806609129,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"501c0d82a52d908aa57cbeef1a1cc86caed89d8a","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"failure","createdAt":"2026-02-08T22:29:44Z","databaseId":21806564931,"event":"pull_request","headBranch":"fix/hardening-never-empty-deploy","headSha":"5fde54ada8de25f077cfedd602649d01c6d26622","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"failure","createdAt":"2026-02-08T22:27:01Z","databaseId":21806528591,"event":"push","headBranch":"fix/hardening-never-empty-deploy","headSha":"5fde54ada8de25f077cfedd602649d01c6d26622","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"failure","createdAt":"2026-02-08T21:35:28Z","databaseId":21805791135,"event":"push","headBranch":"fix/hardening-never-empty-deploy","headSha":"ea67a698040d763a80dc94c4c88716c7be36e80f","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-08T16:18:35Z","databaseId":21801328497,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-06T20:59:44Z","databaseId":21765717382,"event":"push","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-06T18:20:01Z","databaseId":21761196449,"event":"push","headBranch":"main","headSha":"d476c22a29f2efa14b987bbecd038e1ca08d3b97","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-06T17:05:16Z","databaseId":21759001947,"event":"push","headBranch":"main","headSha":"6163875cff0bc52880d74ed5aab1816d8c9a3d3c","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-06T16:18:32Z","databaseId":21757559381,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"cancelled","createdAt":"2026-02-05T16:03:31Z","databaseId":21718742385,"event":"push","headBranch":"main","headSha":"9ba866ca06fceabdd4e1e6ac8f275383d22cc8c3","status":"completed","workflowName":"CI Determinism Check"},{"conclusion":"success","createdAt":"2026-02-05T15:52:58Z","databaseId":21718357378,"event":"push","headBranch":"main","headSha":"807cea5c1eea8b5a805be0658cc0568bfe08aefc","status":"completed","workflowName":"CI Determinism Check"}]

===== END FILE: reality/runs_230903513.json =====

### File: reality/runs_230903514.json
===== FILE: reality/runs_230903514.json =====
[{"conclusion":"success","createdAt":"2026-02-10T21:28:12Z","databaseId":21883064544,"event":"push","headBranch":"codex/p0p1-hardening","headSha":"aeee8a4e15bdb26fb2954c3a0cd3870782c579b9","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-09T14:46:58Z","databaseId":21829656549,"event":"push","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-09T07:22:08Z","databaseId":21815966159,"event":"push","headBranch":"fix/hardening-never-empty-deploy","headSha":"80cd6604e42fa8f68b9bb402a7c69b379c78ee1c","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-08T19:32:51Z","databaseId":21804051318,"event":"push","headBranch":"main","headSha":"980c1d5e482ea1b538f1c6cfb591f91df2b84b58","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-08T17:54:11Z","databaseId":21802652449,"event":"push","headBranch":"main","headSha":"dbc34154d7dc46860168ac675d62473d53a8f8f6","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-08T16:49:35Z","databaseId":21801753447,"event":"push","headBranch":"pr/cleanup-generated-only","headSha":"d640e565d004eeddb1f24c72a61c20a5b1c05fbc","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-08T16:24:17Z","databaseId":21801408289,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"3af8c1c9fd60e4e5f70288a23b70c6fdef4d7d3c","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-08T16:18:35Z","databaseId":21801328499,"event":"push","headBranch":"wip/clean-snapshot-2026-02-08_171818","headSha":"71105ab51bf5a2b92da1bae17fa8b8a53f48669b","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"cancelled","createdAt":"2026-02-06T16:18:32Z","databaseId":21757559361,"event":"push","headBranch":"main","headSha":"8bf8caea469a258633289cdd67ef95fb2113a14c","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-05T16:22:38Z","databaseId":21719440229,"event":"push","headBranch":"main","headSha":"46f5d3fe3e1cb84ec712ca4e9503f5abef113ea5","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-05T16:03:31Z","databaseId":21718742405,"event":"push","headBranch":"main","headSha":"9ba866ca06fceabdd4e1e6ac8f275383d22cc8c3","status":"completed","workflowName":"CI Policy Check"},{"conclusion":"success","createdAt":"2026-02-05T15:52:58Z","databaseId":21718357399,"event":"push","headBranch":"main","headSha":"807cea5c1eea8b5a805be0658cc0568bfe08aefc","status":"completed","workflowName":"CI Policy Check"}]

===== END FILE: reality/runs_230903514.json =====

### File: reality/runs_230903515.json
===== FILE: reality/runs_230903515.json =====
[{"conclusion":"success","createdAt":"2026-02-10T22:02:22Z","databaseId":21884087257,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"EOD History Refresh"},{"conclusion":"success","createdAt":"2026-02-09T21:58:11Z","databaseId":21842342338,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"EOD History Refresh"},{"conclusion":"success","createdAt":"2026-02-06T21:47:52Z","databaseId":21767060905,"event":"schedule","headBranch":"main","headSha":"442398f1d6f3801f0f11edf24ed831fb57f958e2","status":"completed","workflowName":"EOD History Refresh"},{"conclusion":"success","createdAt":"2026-02-06T20:59:51Z","databaseId":21765720400,"event":"workflow_dispatch","headBranch":"main","headSha":"5d42c36e605f1bcc6d080612d07e5af911f4957f","status":"completed","workflowName":"EOD History Refresh"},{"conclusion":"success","createdAt":"2026-02-05T21:48:21Z","databaseId":21729763597,"event":"schedule","headBranch":"main","headSha":"d9de52762e58bb29238053adb0754c0a3bea373b","status":"completed","workflowName":"EOD History Refresh"}]

===== END FILE: reality/runs_230903515.json =====

### File: reality/runs_230907136.json
===== FILE: reality/runs_230907136.json =====
[]

===== END FILE: reality/runs_230907136.json =====

### File: reality/runs_230907137.json
===== FILE: reality/runs_230907137.json =====
[{"conclusion":"success","createdAt":"2026-02-10T22:42:56Z","databaseId":21885261398,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Ops Auto-Alerts"},{"conclusion":"success","createdAt":"2026-02-09T22:40:15Z","databaseId":21843673551,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Ops Auto-Alerts"},{"conclusion":"success","createdAt":"2026-02-06T22:28:31Z","databaseId":21768172381,"event":"schedule","headBranch":"main","headSha":"88917eb78e1de16457eaa76e750a2392112525d2","status":"completed","workflowName":"Ops Auto-Alerts"},{"conclusion":"success","createdAt":"2026-02-05T22:31:34Z","databaseId":21731010615,"event":"schedule","headBranch":"main","headSha":"8053ccf383698e394517249e2bedab4435895c95","status":"completed","workflowName":"Ops Auto-Alerts"}]

===== END FILE: reality/runs_230907137.json =====

### File: reality/runs_231381266.json
===== FILE: reality/runs_231381266.json =====
[{"conclusion":"success","createdAt":"2026-02-06T19:38:03Z","databaseId":21763443287,"event":"workflow_dispatch","headBranch":"main","headSha":"c9f93b4b6bdbb1a3ad68f927c19b3406f5ace5bb","status":"completed","workflowName":"Universe Refresh"}]

===== END FILE: reality/runs_231381266.json =====

### File: reality/runs_232183192.json
===== FILE: reality/runs_232183192.json =====
[{"conclusion":"failure","createdAt":"2026-02-10T18:59:53Z","databaseId":21878443915,"event":"schedule","headBranch":"main","headSha":"2e0ae3dafb7a3906a0d3e15a576e7038cd8923a2","status":"completed","workflowName":"Monitor Production Artifacts"},{"conclusion":"failure","createdAt":"2026-02-10T06:58:25Z","databaseId":21854979453,"event":"schedule","headBranch":"main","headSha":"166a15246fc75b11da12b0f8504ef8fb77a01229","status":"completed","workflowName":"Monitor Production Artifacts"}]

===== END FILE: reality/runs_232183192.json =====

### File: reality/stale-workflows.txt
===== FILE: reality/stale-workflows.txt =====
=== STALE WORKFLOWS (no runs in 30+ days) ===
.github/workflows/forecast-monthly.yml | Forecast Monthly Report | LAST_RUN=NEVER | reason=NEVER
.github/workflows/forecast-rollback.yml | Forecast Rollback | LAST_RUN=NEVER | reason=NEVER

===== END FILE: reality/stale-workflows.txt =====

### File: reality/success-rates.csv
===== FILE: reality/success-rates.csv =====
WORKFLOW_FILE,WORKFLOW_NAME,WORKFLOW_ID,STATE,TOTAL_RUNS,SUCCESS,FAILURE,SUCCESS_RATE,LAST_RUN,LAST_SUCCESS
".github/workflows/v3-finalizer.yml","v3 Finalizer",224941564,active,30,0,30,0%,2026-02-09T23:05:35Z,NEVER
".github/workflows/v3-scrape-template.yml","v3 Scrape Template",225058763,active,30,0,30,0%,2026-02-09T23:05:24Z,NEVER
".github/workflows/ci-gates.yml","CI Gates - Quality & Budget Checks",225061032,active,30,18,12,60%,2026-02-09T14:46:58Z,2026-02-09T14:46:58Z
".github/workflows/cleanup-daily-snapshots.yml","Cleanup Daily Snapshots",225061033,active,3,3,0,100%,2026-02-08T04:28:18Z,2026-02-08T04:28:18Z
".github/workflows/wp16-manual-market-prices.yml","WP16 Manual - Market Prices (Stooq)",226498514,active,30,0,30,0%,2026-02-08T17:54:07Z,NEVER
".github/workflows/refresh-health-assets.yml","Refresh Health Assets",227016585,active,15,13,2,86%,2026-02-10T07:32:23Z,2026-02-08T07:08:04Z
".github/workflows/ops-daily.yml","Ops Daily Snapshot",227442620,active,30,2,28,6%,2026-02-10T08:02:48Z,2026-02-10T08:02:48Z
".github/workflows/eod-latest.yml","EOD Latest (NASDAQ-100)",227511913,active,30,0,30,0%,2026-02-09T22:54:36Z,NEVER
".github/workflows/scheduler-kick.yml","Scheduler Kick",228731024,active,30,0,30,0%,2026-02-10T22:00:48Z,NEVER
".github/workflows/e2e-playwright.yml","e2e-playwright",228798833,active,30,0,30,0%,2026-02-09T14:46:58Z,NEVER
".github/workflows/forecast-daily.yml","Forecast Daily Pipeline",230643544,active,4,3,1,75%,2026-02-10T21:37:13Z,2026-02-10T21:37:13Z
".github/workflows/forecast-monthly.yml","Forecast Monthly Report",230643545,active,0,0,0,0%,NEVER,NEVER
".github/workflows/forecast-weekly.yml","Forecast Weekly Training",230643546,active,1,1,0,100%,2026-02-08T06:35:01Z,2026-02-08T06:35:01Z
".github/workflows/ci-determinism.yml","CI Determinism Check",230903513,active,16,11,4,68%,2026-02-09T14:46:58Z,2026-02-09T14:46:58Z
".github/workflows/ci-policy.yml","CI Policy Check",230903514,active,12,11,0,91%,2026-02-10T21:28:12Z,2026-02-10T21:28:12Z
".github/workflows/eod-history-refresh.yml","EOD History Refresh",230903515,active,5,5,0,100%,2026-02-10T22:02:22Z,2026-02-10T22:02:22Z
".github/workflows/forecast-rollback.yml","Forecast Rollback",230907136,active,0,0,0,0%,NEVER,NEVER
".github/workflows/ops-auto-alerts.yml","Ops Auto-Alerts",230907137,active,4,4,0,100%,2026-02-10T22:42:56Z,2026-02-10T22:42:56Z
".github/workflows/universe-refresh.yml","Universe Refresh",231381266,active,1,1,0,100%,2026-02-06T19:38:03Z,2026-02-06T19:38:03Z
".github/workflows/monitor-prod.yml","Monitor Production Artifacts",232183192,active,2,0,2,0%,2026-02-10T18:59:53Z,NEVER

===== END FILE: reality/success-rates.csv =====

### File: reality/v3_Finalizer_runs.json
===== FILE: reality/v3_Finalizer_runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T23:05:35Z","databaseId":21844377739,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:16Z","databaseId":21803088236,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:27Z","databaseId":21802921511,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:49Z","databaseId":21802869141,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:06Z","databaseId":21802651494,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:56Z","databaseId":21802620240,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:09Z","databaseId":21802429734,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:09Z","databaseId":21802402897,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:52Z","databaseId":21802369407,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:14Z","databaseId":21802317483,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:46Z","databaseId":21801961707,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:00Z","databaseId":21801951354,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:48Z","databaseId":21801839102,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:30Z","databaseId":21801752370,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:07Z","databaseId":21801448066,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:12Z","databaseId":21801407298,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:31Z","databaseId":21801327712,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:43Z","databaseId":21765716950,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:48Z","databaseId":21763436274,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:35Z","databaseId":21762291837,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:59Z","databaseId":21761195360,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:13Z","databaseId":21759000530,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:29Z","databaseId":21757558018,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:28Z","databaseId":21722187003,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:47Z","databaseId":21721655293,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:47Z","databaseId":21721165247,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:55Z","databaseId":21720708994,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:28Z","databaseId":21720218606,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:34Z","databaseId":21719437684,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:03:26Z","databaseId":21718738949,"headBranch":"main","status":"completed"}]

===== END FILE: reality/v3_Finalizer_runs.json =====

### File: reality/v3_Scrape_Template_runs.json
===== FILE: reality/v3_Scrape_Template_runs.json =====
[{"conclusion":"failure","createdAt":"2026-02-09T23:05:24Z","databaseId":21844372473,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:31:08Z","databaseId":21803183951,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:24:16Z","databaseId":21803088262,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:12:27Z","databaseId":21802921449,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T18:08:48Z","databaseId":21802868954,"headBranch":"fix/main-green-wp16-e2e","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:54:06Z","databaseId":21802651543,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:51:56Z","databaseId":21802620164,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:38:09Z","databaseId":21802429926,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:36:08Z","databaseId":21802402768,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:33:51Z","databaseId":21802369101,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:30:13Z","databaseId":21802317159,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:44Z","databaseId":21801961395,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T17:04:00Z","databaseId":21801951543,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:55:48Z","databaseId":21801839032,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:49:31Z","databaseId":21801752533,"headBranch":"pr/cleanup-generated-only","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:27:07Z","databaseId":21801447903,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:24:13Z","databaseId":21801407512,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-08T16:18:31Z","databaseId":21801327760,"headBranch":"wip/clean-snapshot-2026-02-08_171818","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T20:59:41Z","databaseId":21765715872,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T19:37:49Z","databaseId":21763436603,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:57:36Z","databaseId":21762292182,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T18:19:59Z","databaseId":21761195723,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T17:05:15Z","databaseId":21759001322,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-06T16:18:31Z","databaseId":21757558791,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:44:32Z","databaseId":21722188550,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:27:46Z","databaseId":21721655110,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T17:12:48Z","databaseId":21721165478,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:58:52Z","databaseId":21720707632,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:44:29Z","databaseId":21720218907,"headBranch":"main","status":"completed"},{"conclusion":"failure","createdAt":"2026-02-05T16:22:36Z","databaseId":21719439086,"headBranch":"main","status":"completed"}]

===== END FILE: reality/v3_Scrape_Template_runs.json =====

### File: reality/workflow-map.tsv
===== FILE: reality/workflow-map.tsv =====
224941564	v3 Finalizer	active	.github/workflows/v3-finalizer.yml
225058763	v3 Scrape Template	active	.github/workflows/v3-scrape-template.yml
225061032	CI Gates - Quality & Budget Checks	active	.github/workflows/ci-gates.yml
225061033	Cleanup Daily Snapshots	active	.github/workflows/cleanup-daily-snapshots.yml
226498514	WP16 Manual - Market Prices (Stooq)	active	.github/workflows/wp16-manual-market-prices.yml
227016585	Refresh Health Assets	active	.github/workflows/refresh-health-assets.yml
227442620	Ops Daily Snapshot	active	.github/workflows/ops-daily.yml
227511913	EOD Latest (NASDAQ-100)	active	.github/workflows/eod-latest.yml
228731024	Scheduler Kick	active	.github/workflows/scheduler-kick.yml
228798833	e2e-playwright	active	.github/workflows/e2e-playwright.yml
230643544	Forecast Daily Pipeline	active	.github/workflows/forecast-daily.yml
230643545	Forecast Monthly Report	active	.github/workflows/forecast-monthly.yml
230643546	Forecast Weekly Training	active	.github/workflows/forecast-weekly.yml
230903513	CI Determinism Check	active	.github/workflows/ci-determinism.yml
230903514	CI Policy Check	active	.github/workflows/ci-policy.yml
230903515	EOD History Refresh	active	.github/workflows/eod-history-refresh.yml
230907136	Forecast Rollback	active	.github/workflows/forecast-rollback.yml
230907137	Ops Auto-Alerts	active	.github/workflows/ops-auto-alerts.yml
231381266	Universe Refresh	active	.github/workflows/universe-refresh.yml
232183192	Monitor Production Artifacts	active	.github/workflows/monitor-prod.yml

===== END FILE: reality/workflow-map.tsv =====

### File: reality/workflows.json
===== FILE: reality/workflows.json =====
[{"id":224941564,"name":"v3 Finalizer","state":"active"},{"id":225058763,"name":"v3 Scrape Template","state":"active"},{"id":225061032,"name":"CI Gates - Quality & Budget Checks","state":"active"},{"id":225061033,"name":"Cleanup Daily Snapshots","state":"active"},{"id":226498514,"name":"WP16 Manual - Market Prices (Stooq)","state":"active"},{"id":227016585,"name":"Refresh Health Assets","state":"active"},{"id":227442620,"name":"Ops Daily Snapshot","state":"active"},{"id":227511913,"name":"EOD Latest (NASDAQ-100)","state":"active"},{"id":228731024,"name":"Scheduler Kick","state":"active"},{"id":228798833,"name":"e2e-playwright","state":"active"},{"id":230643544,"name":"Forecast Daily Pipeline","state":"active"},{"id":230643545,"name":"Forecast Monthly Report","state":"active"},{"id":230643546,"name":"Forecast Weekly Training","state":"active"},{"id":230903513,"name":"CI Determinism Check","state":"active"},{"id":230903514,"name":"CI Policy Check","state":"active"},{"id":230903515,"name":"EOD History Refresh","state":"active"},{"id":230907136,"name":"Forecast Rollback","state":"active"},{"id":230907137,"name":"Ops Auto-Alerts","state":"active"},{"id":231381266,"name":"Universe Refresh","state":"active"},{"id":232183192,"name":"Monitor Production Artifacts","state":"active"}]

===== END FILE: reality/workflows.json =====

## Directory: repairs

### File: repairs/ci-determinism.md
===== FILE: repairs/ci-determinism.md =====
=== DIAGNOSIS: ci-determinism ===

## Workflow File
.github/workflows/ci-determinism.yml

## Script Paths
No scripts found

## Node Version
          node-version: '20'

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
concurrency:
  group: forecast-determinism-${{ github.ref }}
  cancel-in-progress: true

env:

## Recent Failure
determinism-check	Run Determinism Tests	2026-02-08T22:33:03.8310502Z # fail 0
determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6319305Z     params: { missingProperty: 'generated_at' },
determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6535583Z ##[error]Process completed with exit code 1.

===== END FILE: repairs/ci-determinism.md =====

### File: repairs/ci-gates.md
===== FILE: repairs/ci-gates.md =====
=== DIAGNOSIS: ci-gates ===

## Workflow File
.github/workflows/ci-gates.yml

## Script Paths
        run: node scripts/ci/verify-artifacts.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
        run: node scripts/ci/check-elliott-parity.mjs
        run: bash scripts/ci/forbid-kv-writes-in-api.sh
        run: node scripts/eod/check-eod-artifacts.mjs
        run: bash scripts/ops/validate-truth.sh
✅ EXISTS: scripts/ci/verify-artifacts.mjs
✅ EXISTS: scripts/ci/assert-mission-control-gate.mjs
✅ EXISTS: scripts/ci/check-elliott-parity.mjs
✅ EXISTS: scripts/ci/forbid-kv-writes-in-api.sh
✅ EXISTS: scripts/eod/check-eod-artifacts.mjs
✅ EXISTS: scripts/ops/validate-truth.sh

## Node Version
          node-version: "20"
          node-version: "20"

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
❌ NOT SET

## Recent Failure
Repository Policy Checks	Check Forbidden Patterns	2026-02-08T22:29:50.0472992Z [36;1m  echo "Status:     ❌ FAIL"[0m
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7455851Z ✅ Drops above absolute threshold (5) should fail
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7458947Z ✅ computeValidationMetadata fails when threshold exceeded
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7459954Z ✅ computeValidationMetadata fails when other validation fails
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7464566Z ✅ Invalid inputs throw errors
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7470584Z ❌ Failed: 0
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8981358Z ✅ Network error → retry succeeds
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8985247Z ✅ Retry limit reached → ok=false with error
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8997151Z ✅ Network error exhausts retries → ok=false
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.9011163Z ❌ Failed: 0
JSON Schema Validation	Run contract tests	2026-02-08T22:29:58.9836629Z > npm run validate:symbols && npm run test:envelope && npm run test:scheduler && node scripts/contract-smoke.js && npm run test:truth-chain && npm run test:missing-mirror && node tests/build-info-artifact.test.mjs
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.3497919Z ✅ errorEnvelope
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6192737Z WARN: health latest snapshot check skipped (missing public/data/snapshots/health/latest.json)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6197519Z WARN: tech-signals contract check skipped (missing mirror or snapshot artifact)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6198667Z WARN: SNAPSHOT>=MIRROR tech-signals guard skipped (missing mirror or snapshot artifact)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.9724881Z > test:missing-mirror
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.9725302Z > node scripts/ops/verify-missing-mirror-semantic.mjs
JSON Schema Validation	Run contract tests	2026-02-08T22:30:00.0025183Z WARN: semantic equivalence check skipped (generated artifacts missing): /home/runner/work/rubikvault-site/rubikvault-site/public/data/marketphase/missing.json, /home/runner/work/rubikvault-site/rubikvault-site/public/data/pipeline/missing.json
JSON Schema Validation	Run contract tests	2026-02-08T22:30:00.0365686Z SKIP: build-info artifact missing in generated-only checkout
JSON Schema Validation	Validate Against JSON Schemas	2026-02-08T22:30:00.6900273Z ##[error]Process completed with exit code 1.

===== END FILE: repairs/ci-gates.md =====

### File: repairs/e2e-playwright.md
===== FILE: repairs/e2e-playwright.md =====
=== DIAGNOSIS: e2e-playwright ===

## Workflow File
.github/workflows/e2e-playwright.yml

## Script Paths
No scripts found

## Node Version
          node-version: '20'

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
❌ NOT SET

## Recent Failure
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7254139Z     Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7257145Z     Error: element(s) not found
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7262573Z        8 |   await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail/);
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7265935Z     Error Context: test-results/ops-ops-render-stamp-goes-ok/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267809Z     Error: page.waitForResponse: Test timeout of 20000ms exceeded.
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7271782Z     Error Context: test-results/ops-ops-truth-chain-sections-render/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7272200Z   2 failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7490702Z ##[error]Process completed with exit code 1.

===== END FILE: repairs/e2e-playwright.md =====

### File: repairs/eod-latest.md
===== FILE: repairs/eod-latest.md =====
=== DIAGNOSIS: eod-latest ===

## Workflow File
.github/workflows/eod-latest.yml

## Script Paths
        run: node scripts/ops/preflight-check.mjs --mode eod-latest
        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
✅ EXISTS: scripts/ops/preflight-check.mjs
✅ EXISTS: scripts/eod/build-eod-latest.mjs
✅ EXISTS: scripts/ops/build-safety-snapshot.mjs
✅ EXISTS: scripts/ops/build-mission-control-summary.mjs
✅ EXISTS: scripts/ops/build-ops-pulse.mjs
✅ EXISTS: scripts/ops/validate-ops-summary.mjs
✅ EXISTS: scripts/ci/assert-mission-control-gate.mjs

## Node Version
          node-version: "20"
          node-version: "20"

## Permissions
permissions:
  contents: write

concurrency:
  group: eod-latest
  cancel-in-progress: true


## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}
          if [ -n "${{ secrets.TIINGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIINGO_API_KEY }}" >> "$GITHUB_ENV"
          elif [ -n "${{ secrets.TIIANGO_API_KEY }}" ]; then
            echo "TIINGO_API_KEY=${{ secrets.TIIANGO_API_KEY }}" >> "$GITHUB_ENV"

## Concurrency
concurrency:
  group: eod-latest
  cancel-in-progress: true

jobs:

## Recent Failure
run	UNKNOWN STEP	2026-02-09T22:54:51.1439967Z ##[group]Run set -euo pipefail
run	UNKNOWN STEP	2026-02-09T22:54:51.1440290Z [36;1mset -euo pipefail[0m
run	UNKNOWN STEP	2026-02-09T22:55:26.1392906Z FAIL: expected=100 but fetched=0 (empty artifact generation blocked)
run	UNKNOWN STEP	2026-02-09T22:55:26.1445662Z ##[error]Process completed with exit code 1.

===== END FILE: repairs/eod-latest.md =====

### File: repairs/forecast-daily.md
===== FILE: repairs/forecast-daily.md =====
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

===== END FILE: repairs/forecast-daily.md =====

### File: repairs/monitor-prod.md
===== FILE: repairs/monitor-prod.md =====
=== DIAGNOSIS: monitor-prod ===

## Workflow File
.github/workflows/monitor-prod.yml

## Script Paths
No scripts found

## Node Version
Not set

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
❌ NOT SET

## Recent Failure
liveness	UNKNOWN STEP	2026-02-10T19:00:01.7085382Z ##[group]Run set -euo pipefail
liveness	UNKNOWN STEP	2026-02-10T19:00:01.7086606Z [36;1mset -euo pipefail[0m
liveness	UNKNOWN STEP	2026-02-10T19:00:01.9311817Z curl: (22) The requested URL returned error: 403
liveness	UNKNOWN STEP	2026-02-10T19:00:01.9347815Z ##[error]Process completed with exit code 22.

===== END FILE: repairs/monitor-prod.md =====

### File: repairs/ops-daily.md
===== FILE: repairs/ops-daily.md =====
=== DIAGNOSIS: ops-daily ===

## Workflow File
.github/workflows/ops-daily.yml

## Script Paths
        run: node scripts/ops/preflight-check.mjs --mode ops-daily
        run: node scripts/pipeline/build-marketphase-from-kv.mjs --universe nasdaq100
        run: node scripts/pipeline/build-ndx100-pipeline-truth.mjs
        run: node scripts/ops/build-safety-snapshot.mjs
        run: node scripts/ops/build-ops-daily.mjs
        run: node scripts/ops/build-mission-control-summary.mjs
        run: node scripts/ops/build-ops-pulse.mjs
        run: node scripts/ops/validate-ops-summary.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
✅ EXISTS: scripts/ops/preflight-check.mjs
✅ EXISTS: scripts/pipeline/build-marketphase-from-kv.mjs
✅ EXISTS: scripts/pipeline/build-ndx100-pipeline-truth.mjs
✅ EXISTS: scripts/ops/build-safety-snapshot.mjs
✅ EXISTS: scripts/ops/build-ops-daily.mjs
✅ EXISTS: scripts/ops/build-mission-control-summary.mjs
✅ EXISTS: scripts/ops/build-ops-pulse.mjs
✅ EXISTS: scripts/ops/validate-ops-summary.mjs
✅ EXISTS: scripts/ci/assert-mission-control-gate.mjs

## Node Version
          node-version: "20"
          node-version: "20"

## Permissions
permissions:
  contents: write

concurrency:
  group: ops-daily
  cancel-in-progress: true


## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

## Concurrency
concurrency:
  group: ops-daily
  cancel-in-progress: true

jobs:

## Recent Failure
failed to get run log: log not found

===== END FILE: repairs/ops-daily.md =====

### File: repairs/scheduler-kick.md
===== FILE: repairs/scheduler-kick.md =====
=== DIAGNOSIS: scheduler-kick ===

## Workflow File
.github/workflows/scheduler-kick.yml

## Script Paths
No scripts found

## Node Version
          node-version: '20'

## Permissions
permissions:
  contents: read

jobs:
  dry-run:
    name: Scheduler Kick Dry-Run (no secrets)
    if: ${{ vars.RV_CI_MODE == 'dry' || vars.RV_PROD_BASE == '' }}

## Secrets Used
          RV_ADMIN_TOKEN: ${{ secrets.RV_ADMIN_TOKEN }}

## Concurrency
❌ NOT SET

## Recent Failure
kick	Trigger scheduler	﻿2026-02-10T22:00:51.8462099Z ##[group]Run set -euo pipefail
kick	Trigger scheduler	2026-02-10T22:00:51.8463008Z [36;1mset -euo pipefail[0m
kick	Trigger scheduler	2026-02-10T22:00:51.8476067Z [36;1m  echo "Scheduler kick failed (HTTP $status)" >&2[0m
kick	Trigger scheduler	2026-02-10T22:00:52.0314354Z Scheduler kick failed (HTTP 403)
kick	Trigger scheduler	2026-02-10T22:00:52.0365122Z <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}html{line-height:1.15;-webkit-text-size-adjust:100%;color:#313131;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}body{display:flex;flex-direction:column;height:100vh;min-height:100vh}.main-content{margin:8rem auto;padding-left:1.5rem;max-width:60rem}@media (width <= 720px){.main-content{margin-top:4rem}}.h2{line-height:2.25rem;font-size:1.5rem;font-weight:500}@media (width <= 720px){.h2{line-height:1.5rem;font-size:1.25rem}}#challenge-error-text{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI0IyMEYwMyIgZD0iTTE2IDNhMTMgMTMgMCAxIDAgMTMgMTNBMTMuMDE1IDEzLjAxNSAwIDAgMCAxNiAzbTAgMjRhMTEgMTEgMCAxIDEgMTEtMTEgMTEuMDEgMTEuMDEgMCAwIDEtMTEgMTEiLz48cGF0aCBmaWxsPSIjQjIwRjAzIiBkPSJNMTcuMDM4IDE4LjYxNUgxNC44N0wxNC41NjMgOS41aDIuNzgzem0tMS4wODQgMS40MjdxLjY2IDAgMS4wNTcuMzg4LjQwNy4zODkuNDA3Ljk5NCAwIC41OTYtLjQwNy45ODQtLjM5Ny4zOS0xLjA1Ny4zODktLjY1IDAtMS4wNTYtLjM4OS0uMzk4LS4zODktLjM5OC0uOTg0IDAtLjU5Ny4zOTgtLjk4NS40MDYtLjM5NyAxLjA1Ni0uMzk3Ii8+PC9zdmc+");background-repeat:no-repeat;background-size:contain;padding-left:34px}@media (prefers-color-scheme: dark){body{background-color:#222;color:#d9d9d9}}</style><meta http-equiv="refresh" content="360"></head><body><div class="main-wrapper" role="main"><div class="main-content"><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></div></div><script>(function(){window._cf_chl_opt = {cvId: '3',cZone: 'rubikvault.com',cType: 'managed',cRay: '9cbee1bd0b270fa3',cH: '3NyntZT8eAbhLHY.Sw49sUO3HysJsskc8cBzBP.CPKI-1770760852-1.2.1.1-rYPqiXEpu3SGHKtIQfxBEHo7v7o5L.j4lM4ODBD8twwqz1dotCCHiQpWKK_1t6zN',cUPMDTk:"\/api\/scheduler\/run?__cf_chl_tk=EbAPuDKktzmunFa.gcuDw_pjgYz15pUOPi4TZWxWlUk-1770760852-1.0.1.1-8drcbBTxFVIJSkw_5JaWGNTFlc7l30OYRWVnDN7Fxhg",cFPWv: 'b',cITimeS: '1770760852',cTplC:0,cTplV:5,cTplB: '0',fa:"\/api\/scheduler\/run?__cf_chl_f_tk=EbAPuDKktzmunFa.gcuDw_pjgYz15pUOPi4TZWxWlUk-1770760852-1.0.1.1-8drcbBTxFVIJSkw_5JaWGNTFlc7l30OYRWVnDN7Fxhg",md: 'Rc7t0aBTsSyvIFg56tIpvXZYentMgawIoZjDgtcFEfk-1770760852-1.2.1.1-MvhQIwMfnh2dYVDqQOXlj6OtBIzrcelxdPHLf_E17p12obtXuUpY8caFgFgggeILBZFzd1hIPKi5sgwucs7oMR4XpMqCYYG1_AJy3nfqEEoBrvbhkPBE1Gtb9SJH6wnPtVvhxBuwFcPNEslW1o4YzdEs0liLYmmrnxAumh6DDAvKJpcDs_YXXoGYGiwZ9n7yDUK.hy7paVRxrRoUdcbEIOvJSSuG0Vgb4r9dgviafwkyWBbXMqpSpY2FARUQrcHd0iDj4Ihu4_m4ZhSVf12l5dB9HkqX6dpS4QNMOEFKFe_rJVAShZFQ5T.ghDEE8Te.mAZYmt.PqZYvAfaDE69tUBsjDyG_kvQPyn7UzpZKqYyUtjlU55j8M0pO6q_d91bYmEykCcMHg7sdKDXvKRogMVyfUag3Sqyh.U0gYp5QO2HAupDQ9YbJwufK1y3ssztqbounW7xiHW3USbvcNxrLk.dKlCD4dGMr.7SwY_y.PMsR2sYxbvNMoTrfGCxLz7jwG70aW9YwEGlODT2WLgSpH4u6nnqIyajK6w3dlKhfcZlzrcFuLbLPhN6pM5ZfQFlBDxReqtkNIFLU8xqGOaE3KcHm22q2mQqtnOP_Y_dP7J7Y8a_s2CNfWythOXVeoK9mC86CLDagKxRO95ltIqNA3nhNRIBrIgbipl3S.APHyJh9oxo7XoCj2iTRgsACuoHHEZbQpAHazJ67Dg3NP24ReksXdtoSPaWuHoO5s9.141HRN6FfhA7LYEiEPM6769NsbymqK3uK3hbdVmABDhg9Ny0A3fUAoWqysHiKhKj0GnnCYpTZRe2QA31UPinIrtMv',mdrd: 'awHqfOB7wH_AzxOZiJUukb5TjrD6Tw4vHnBgfKEssxU-1770760852-1.2.1.1-amEu547eFQqtbyksErBzgDhqu2zQjMg0PLUwaufKJ8qPVzCKZtUt7VOZcaZt8x5xbgdP5eksQgqnjj1nyq5KLQ_ELXS8oxeRwcyZ2seH96VbdCLGdmM.iMiSjX456DV84S1447M1Ybgptu.0hyo5NOIH.3CXilONHTQ7a32obo4uHy18rPE3ykrluiScpqLhbWdIp9oFc71zKQuKSiqrMXNHhqX4lRjz1j0A45R.zWqHWSCS0Bg3sLEzMTdxVWxNu9cLzUzJLXov.DH0y5W_Nt9zOU5.QEjepx8mwRvYeoFNqK9QDO26BZmQRliAGz5dNyZsZwB_F7pXIboCg5f7r2apg6f_xFu.Lu07.tW5f1XH2LjVMVw7B3607QpbMNSQi1Cur9vow1yJTH9eX_dx3.terrqzP.EPnbeApVvXbkgOJFag8NUSqkliY7QtkOi5WCBMYlL0OGzCVDc2f1rvfAsgMkRZxjgMeK6nkUTGbcNVG.UwWlWwd0wg09ducgslJS.thRHHPpLTLFPVc7bkTmtVU3wDofduNlIzpqdjNV538pjnK979pAlpXXbUcpUy0mwL.H9oZm.G0eb4WKyrzwTgCkbQXMtAyVfjijsExN850ND69VCelxUn_nTvs2fun3fQ6Pxj0WFJYPbVSZ8gdzy3RX1EcYwotV7eNXnjyZ4CYsQFpZn55Kc3p_bI2IDT8TUZNYThEYSw_pfz1v_Wbwi6kps4KiftGh4sQXoRmLEB8YuKe3XDHyXEwiOrW8JmK3ZOzVXH37zKjzUaxuBokF5synA6j76Hm4GgFE0C9IaTPhI5zAXtduTC_aaA0E5GYumiG2XVieJMEa0Z8etVrhpbJSZ7QwmzRUkXzi1fF5EtUp.nwO2I2yHNopZO66gRZNsH9GnU58_6BQN7Pb_VSSNQcS6UHVu7K_QA7AWzfOR0.UCXieBmoOjeHaoz_2qtU6KW9.EgHHzBhzp_GxtNxUee7fp05.p1dL_Ovv9wJqFcpJR_KTHxp.ZtCvyGGZ04vZzxYUSpjUc91Q1LWx9gvMTeB6aNKkSk8t9zD64RgM7iM1GtEItIrL3Hd9PW28kB9QG4iOt95ZGaEAhTqBAIr.ihbKgzsCx9iBiF1PlsA5vjd__.EVU4lYZaHXcMVKS28LkNkire6xj0PIMV4NUvFXPE18WlTJ8d1h8AtVid0q0xs52BvvtbbDoky0V084IrONcmI_238g8ZCzUWUCpyKumYBmdGwE8yXAu.HxmVWauZN6GwNBhc4jyAEKMkYEEnjO2_vkqR_L_1.x4zr.x8NohNsi8luDSSWNQ2kp9ZlevnLke9hrXUU4_AK5azX_eWQXwJTSsGeE_CvM4IRqm7O6SxxaA8EQEFHiiEiHeAcyijjQrs8GAIpthGrHMczc4oTxwZJf3sRtJWg4VM.HTzAal.E_61o20KN7iPnt0zYvCgtW60wEcl0wipLrpzUSNl8lsHntL0z0tmYxbMEreHtXYT5WlIGXVGFx7iuIGOFcZnUgQUwkIzwM.xkiWuqTfPJ4UMV12wFkK.GQbHaQzQifZrpYo5nIj7zy7s5dRNPow1k1HkUnU79V7LkRmmdF4wjpyn18zSqY_gsdB19dLHAAOxiL06AchTFW4WsZopRcIBXBDZQaUl.2L_qFNF5XhIJsxbRSWfhL6F7auRH9IB1ebFKmXkAPnn0VfmGkumm5LxW1v5xXB8fujk6pT_vIrD_dFnaAeNapUKomdYLd7_mFKKt.F02NpWbDKk4ax0Oyiv9xHNFlcid4KQOCMpzjornvkXMBIk2S._GtO8wMZsBFBaXWVchKDQPAl1MFp_fxYOF3IIVi7c8FWCHjG1j5r2p0dHlq6Ejyyw5W_JlAE7LVNCP3IOtYXZEDnXmDpzKPGIO5DNpujSZVGMoE0x7BReGqgelKT_ppccdXxJ2uOxnHPDC9OQSX6lqk7LD2qiApic3Ab1btANSRzeCBHoPjbzUbNLWt_vDsFnDPz5F5UessmRN7VCjpz0X.Zy_hQF5ExIuxCG8H1fjGI3IsYgp43RGVm4mzsLjIhi_OiHyPOxyvqeq6z.wfd.NT8mzm3lzZXwyxtyc5Fm4GE6PRT8XBA6JEOVF86Io2pEZJN21GMOrfWtCa.A_T4KEZHBtW8SekFr73DWifoF1nXANkYvYE74FelavYIkJ8k0EOkJBH.s1gxiK0cmXsRhi56DA4H1T06nzqSbTlXhw25A4FunqnP1MYYZ4x2Z5m91DApro7RES5BsPVUsZG6E.ajN62fd_PKrhQf8SJejJ731JJc0g9p0qv05vU7i4rP.r_cH7aCg4.63EAmJnqmqjMb3hqDG24z3GIiEUNfJ2a78HzQU4EkPmIJo.1MgoScxJIn6nNULJhUuwocwjxQ9A08nL8X7imQ52oP3QAIBbZOoAzHz8PHQ6lbPR_KT7USYjZPRbuiTl0yPa.D2Yua86GLHuey_xDUbgeJS6OPOCTvGfs5uxw_rLFTRLjDwCvvIVXCBCxmGow7xLaHmdJFbHXvERsDmeuYxR4X0yauN2JUYcOrcdIJeIjn2VQp9gGLlrbu6fI.WmtgqKU7alKOlZ9v0Z6qD12DDbpGNuL8MAi78fBcTbxkwh9NizFF.N012uQtrOUTCrG9tDWr0xsu1CX_yajlQ72Q',};var a = document.createElement('script');a.src = '/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=9cbee1bd0b270fa3';window._cf_chl_opt.cOgUHash = location.hash === '' && location.href.indexOf('#') !== -1 ? '#' : location.hash;window._cf_chl_opt.cOgUQuery = location.search === '' && location.href.slice(0, location.href.length - window._cf_chl_opt.cOgUHash.length).indexOf('?') !== -1 ? '?' : location.search;if (window.history && window.history.replaceState) {var ogU = location.pathname + window._cf_chl_opt.cOgUQuery + window._cf_chl_opt.cOgUHash;history.replaceState(null, null,"\/api\/scheduler\/run?__cf_chl_rt_tk=EbAPuDKktzmunFa.gcuDw_pjgYz15pUOPi4TZWxWlUk-1770760852-1.0.1.1-8drcbBTxFVIJSkw_5JaWGNTFlc7l30OYRWVnDN7Fxhg"+ window._cf_chl_opt.cOgUHash);a.onload = function() {history.replaceState(null, null, ogU);}}document.getElementsByTagName('head')[0].appendChild(a);}());</script></body></html>
kick	Trigger scheduler	2026-02-10T22:00:52.0433924Z ##[error]Process completed with exit code 1.

===== END FILE: repairs/scheduler-kick.md =====

### File: repairs/v3-finalizer.md
===== FILE: repairs/v3-finalizer.md =====
=== DIAGNOSIS: v3-finalizer ===

## Workflow File
.github/workflows/v3-finalizer.yml

## Script Paths
          node scripts/aggregator/finalize.mjs 2>&1
            node scripts/wp16/guard-market-prices.mjs
✅ EXISTS: scripts/aggregator/finalize.mjs
✅ EXISTS: scripts/wp16/guard-market-prices.mjs

## Node Version
          node-version: "20"

## Permissions
    permissions:
      contents: write
      actions: read
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}

## Concurrency
    concurrency:
      group: rv-finalizer
      cancel-in-progress: true
    
    permissions:

## Recent Failure
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5526415Z ##[group]Run set +e  # Disable exit on error for this step
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5526908Z [36;1mset +e  # Disable exit on error for this step[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5736537Z [36;1m  echo "❌ ERROR: Finalizer failed with exit code $FINALIZER_EXIT"[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5736967Z [36;1m  echo "Check the logs above for detailed error information"[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6251148Z ERROR: Failed to load registry: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json'
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6304870Z ##[error]Process completed with exit code 1.
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6370883Z [36;1mecho "- Status: failure" >> $GITHUB_STEP_SUMMARY[0m

===== END FILE: repairs/v3-finalizer.md =====

### File: repairs/v3-scrape-template.md
===== FILE: repairs/v3-scrape-template.md =====
=== DIAGNOSIS: v3-scrape-template ===

## Workflow File
.github/workflows/v3-scrape-template.yml

## Script Paths
          node scripts/providers/market-prices-v3.mjs
          node scripts/providers/market-stats-v3.mjs
          node scripts/aggregator/finalize.mjs
✅ EXISTS: scripts/providers/market-prices-v3.mjs
✅ EXISTS: scripts/providers/market-stats-v3.mjs
✅ EXISTS: scripts/aggregator/finalize.mjs

## Node Version
          node-version: "20"
          node-version: "20"
          node-version: "20"

## Permissions
    permissions:
      contents: read
      actions: read
    
    strategy:
      matrix: ${{ fromJson(needs.prepare.outputs.matrix) }}
      fail-fast: false  # Continue even if one module fails

## Secrets Used
          POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
          ALPHAVANTAGE_API_KEY: ${{ secrets.ALPHAVANTAGE_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          TWELVEDATA_API_KEY: ${{ secrets.TWELVEDATA_API_KEY }}

## Concurrency
❌ NOT SET

## Recent Failure
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8605090Z ##[group]Run set -euo pipefail
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8605688Z [36;1mset -euo pipefail[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8619154Z [36;1m    error: (.error // null)[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8620767Z [36;1m  echo "MISSING: $ARTIFACTS_DIR/market-prices/snapshot.json"[0m
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8780529Z ls: cannot access '/home/runner/work/_temp/artifacts': No such file or directory
prepare	UNKNOWN STEP	2026-02-09T23:05:28.8794562Z MISSING: /home/runner/work/_temp/artifacts/market-prices/snapshot.json
prepare	UNKNOWN STEP	2026-02-09T23:05:30.6131010Z Error: Cannot find module './public/data/registry/modules.json'
prepare	UNKNOWN STEP	2026-02-09T23:05:30.6158005Z ##[error]Process completed with exit code 1.

===== END FILE: repairs/v3-scrape-template.md =====

### File: repairs/wp16-manual-market-prices.md
===== FILE: repairs/wp16-manual-market-prices.md =====
=== DIAGNOSIS: wp16-manual-market-prices ===

## Workflow File
.github/workflows/wp16-manual-market-prices.yml

## Script Paths
          node scripts/providers/market-prices-v3.mjs
          node scripts/aggregator/finalize.mjs
          node scripts/wp16/guard-market-prices.mjs
✅ EXISTS: scripts/providers/market-prices-v3.mjs
✅ EXISTS: scripts/aggregator/finalize.mjs
✅ EXISTS: scripts/wp16/guard-market-prices.mjs

## Node Version
          node-version: "20"

## Permissions
permissions:
  contents: write

concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true


## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}

## Concurrency
concurrency:
  group: wp16-manual-market-prices
  cancel-in-progress: true

jobs:

## Recent Failure
failed to get run log: log not found

===== END FILE: repairs/wp16-manual-market-prices.md =====

## Directory: runs

### File: runs/runs_.json
===== FILE: runs/runs_.json =====

===== END FILE: runs/runs_.json =====

