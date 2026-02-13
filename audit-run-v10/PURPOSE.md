# PURPOSE

Generated: 2026-02-11T18:52:51Z

| Workflow | Primary Purpose | UI/OPS Value | Evidence (file:line) |
|---|---|---|---|
| v3 Finalizer | LEGACY SNAPSHOT PIPELINE | LOW | .github/workflows/v3-finalizer.yml:151; .github/workflows/v3-finalizer.yml:171; .github/workflows/v3-finalizer.yml:188 |
| v3 Scrape Template | LEGACY SNAPSHOT PIPELINE | LOW | .github/workflows/v3-scrape-template.yml:65; .github/workflows/v3-scrape-template.yml:239; .github/workflows/v3-scrape-template.yml:241 |
| CI Gates - Quality & Budget Checks | FORECAST/MODEL PIPELINE | MEDIUM | .github/workflows/ci-gates.yml:6; .github/workflows/ci-gates.yml:13; .github/workflows/ci-gates.yml:27 |
| Cleanup Daily Snapshots | MAINTENANCE/JANITOR | MEDIUM | .github/workflows/cleanup-daily-snapshots.yml:46; .github/workflows/cleanup-daily-snapshots.yml:52; .github/workflows/cleanup-daily-snapshots.yml:61 |
| WP16 Manual - Market Prices (Stooq) | Maintenance/Utility | MEDIUM | .github/workflows/wp16-manual-market-prices.yml:38; .github/workflows/wp16-manual-market-prices.yml:77; .github/workflows/wp16-manual-market-prices.yml:83 |
| Refresh Health Assets | MAINTENANCE/JANITOR | MEDIUM | .github/workflows/refresh-health-assets.yml:29; .github/workflows/refresh-health-assets.yml:34; .github/workflows/refresh-health-assets.yml:40 |
| Ops Daily Snapshot | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/ops-daily.yml:55; .github/workflows/ops-daily.yml:61; .github/workflows/ops-daily.yml:64 |
| EOD Latest (NASDAQ-100) | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/eod-latest.yml:59; .github/workflows/eod-latest.yml:71; .github/workflows/eod-latest.yml:71 |
| Scheduler Kick | MONITORING/ORCHESTRATION | HIGH | .github/workflows/scheduler-kick.yml:1 |
| e2e-playwright | QUALITY GATE | MEDIUM | .github/workflows/e2e-playwright.yml:1 |
| Forecast Daily Pipeline | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/forecast-daily.yml:54; .github/workflows/forecast-daily.yml:72; .github/workflows/forecast-daily.yml:73 |
| Forecast Monthly Report | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/forecast-monthly.yml:56; .github/workflows/forecast-monthly.yml:72 |
| Forecast Weekly Training | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/forecast-weekly.yml:50; .github/workflows/forecast-weekly.yml:76; .github/workflows/forecast-weekly.yml:77 |
| CI Determinism Check | QUALITY GATE | MEDIUM | .github/workflows/ci-determinism.yml:1 |
| CI Policy Check | FORECAST/MODEL PIPELINE | MEDIUM | .github/workflows/ci-policy.yml:7; .github/workflows/ci-policy.yml:26 |
| EOD History Refresh | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/eod-history-refresh.yml:34; .github/workflows/eod-history-refresh.yml:37; .github/workflows/eod-history-refresh.yml:41 |
| Forecast Rollback | UI/PUBLISHED DATA PIPELINE | HIGH | .github/workflows/forecast-rollback.yml:43; .github/workflows/forecast-rollback.yml:58; .github/workflows/forecast-rollback.yml:65 |
| Ops Auto-Alerts | Maintenance/Utility | MEDIUM | .github/workflows/ops-auto-alerts.yml:1 |
| Universe Refresh | MAINTENANCE/JANITOR | MEDIUM | .github/workflows/universe-refresh.yml:30; .github/workflows/universe-refresh.yml:35; .github/workflows/universe-refresh.yml:38 |
| Monitor Production Artifacts | MONITORING/ORCHESTRATION | HIGH | .github/workflows/monitor-prod.yml:1 |

## Raw Signal Scan
```
.github/workflows/cleanup-daily-snapshots.yml:46:          if git diff --quiet public/data; then
.github/workflows/cleanup-daily-snapshots.yml:52:            git diff --stat public/data
.github/workflows/cleanup-daily-snapshots.yml:61:          git add public/data
.github/workflows/monitor-prod.yml:37:          fetch_json "$BASE_URL/data/forecast/latest.json" /tmp/forecast_latest.json
.github/workflows/monitor-prod.yml:38:          fetch_json "$BASE_URL/data/forecast/system/status.json" /tmp/forecast_status.json
.github/workflows/monitor-prod.yml:42:          fetch_json "$BASE_URL/data/ops/pulse.json" /tmp/ops_pulse.json
.github/workflows/monitor-prod.yml:54:            ((.data.forecasts | length) > 0)
.github/workflows/monitor-prod.yml:55:          ' /tmp/forecast_latest.json >/dev/null
.github/workflows/monitor-prod.yml:56:          echo "✅ forecast/latest semantic checks passed"
.github/workflows/monitor-prod.yml:66:          ' /tmp/forecast_status.json >/dev/null
.github/workflows/monitor-prod.yml:67:          echo "✅ forecast/system/status semantic checks passed"
.github/workflows/monitor-prod.yml:101:          ' /tmp/ops_pulse.json >/dev/null
.github/workflows/monitor-prod.yml:102:          echo "✅ /data/ops/pulse semantic checks passed"
.github/workflows/monitor-prod.yml:111:          curl -fsS "$BASE_URL/data/ops/pulse.json" -o /tmp/ops_pulse.json
.github/workflows/monitor-prod.yml:116:            const pulse = JSON.parse(fs.readFileSync("/tmp/ops_pulse.json", "utf8"));
.github/workflows/monitor-prod.yml:120:              ops_pulse: pulse?.meta?.build_id || null
.github/workflows/monitor-prod.yml:140:          curl -sS "$BASE_URL/data/forecast/latest.json" -o /tmp/forecast_latest.json
.github/workflows/monitor-prod.yml:143:            const doc = JSON.parse(fs.readFileSync("/tmp/forecast_latest.json", "utf8"));
.github/workflows/monitor-prod.yml:146:              console.log("::warning::forecast/latest.json missing generated_at; cannot compute staleness");
.github/workflows/monitor-prod.yml:151:              console.log(`::warning::forecast/latest.json generated_at not parseable: ${generatedAt}`);
.github/workflows/monitor-prod.yml:155:            const msg = `forecast/latest.json age=${ageHours.toFixed(1)}h generated_at=${generatedAt}`;
.github/workflows/ci-determinism.yml:6:      - 'scripts/forecast/**'
.github/workflows/ci-determinism.yml:10:      - 'scripts/forecast/**'
.github/workflows/ci-determinism.yml:15:  group: forecast-determinism-${{ github.ref }}
.github/workflows/ci-determinism.yml:46:        run: npm run validate:forecast-registry
.github/workflows/ci-determinism.yml:49:        run: npm run validate:forecast-schemas
.github/workflows/ops-daily.yml:12:  group: ops-daily
.github/workflows/ops-daily.yml:55:        run: node scripts/ops/preflight-check.mjs --mode ops-daily
.github/workflows/ops-daily.yml:67:        run: node scripts/ops/build-safety-snapshot.mjs
.github/workflows/ops-daily.yml:69:      - name: Build ops-daily snapshot
.github/workflows/ops-daily.yml:73:        run: node scripts/ops/build-ops-daily.mjs
.github/workflows/ops-daily.yml:75:      - name: Build ops summary
.github/workflows/ops-daily.yml:76:        run: node scripts/ops/build-mission-control-summary.mjs
.github/workflows/ops-daily.yml:78:      - name: Build ops pulse
.github/workflows/ops-daily.yml:79:        run: node scripts/ops/build-ops-pulse.mjs
.github/workflows/ops-daily.yml:81:      - name: Validate ops summary
.github/workflows/ops-daily.yml:82:        run: node scripts/ops/validate-ops-summary.mjs
.github/workflows/ops-daily.yml:94:          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json
.github/workflows/ops-daily.yml:99:          git commit -m "chore(ops): update ops-daily snapshot" || exit 0
.github/workflows/e2e-playwright.yml:10:  ops-e2e:
.github/workflows/ops-auto-alerts.yml:9:  group: forecast-system
.github/workflows/ops-auto-alerts.yml:29:          # Read latest ops report
.github/workflows/ops-auto-alerts.yml:30:          if [ -f "dev/ops/forecast/latest.json" ]; then
.github/workflows/ops-auto-alerts.yml:31:            STATUS=$(jq -r '.status // "UNKNOWN"' dev/ops/forecast/latest.json)
.github/workflows/ops-auto-alerts.yml:32:            RECS=$(jq -r '.recommendations | length' dev/ops/forecast/latest.json)
.github/workflows/ops-auto-alerts.yml:33:            P1_COUNT=$(jq -r '[.recommendations[] | select(.level == "P1")] | length' dev/ops/forecast/latest.json)
.github/workflows/ops-auto-alerts.yml:57:              labels: 'ops-alert',
.github/workflows/ops-auto-alerts.yml:72:            Please review the ops dashboard and take action.
.github/workflows/ops-auto-alerts.yml:74:            - Dashboard: \`dev/ops/forecast/index.html\`
.github/workflows/ops-auto-alerts.yml:75:            - Latest Report: \`dev/ops/forecast/latest.json\`
.github/workflows/ops-auto-alerts.yml:83:              labels: ['ops-alert', 'forecast', 'auto-generated']
.github/workflows/ci-gates.yml:6:      - 'public/data/**'
.github/workflows/ci-gates.yml:13:      - 'public/data/**'
.github/workflows/ci-gates.yml:27:          mkdir -p public/data
.github/workflows/ci-gates.yml:28:          if ! find public/data -type f -name "*.json" -print -quit | grep -q .; then
.github/workflows/ci-gates.yml:29:            SENTINEL_PATH="public/data/.budget_sentinel.json"
.github/workflows/ci-gates.yml:34:            echo "ℹ️ Created budget sentinel at $SENTINEL_PATH (no tracked public/data json artifacts in checkout)"
.github/workflows/ci-gates.yml:37:          # Count files in public/data
.github/workflows/ci-gates.yml:38:          TOTAL_FILES=$(find public/data -type f -name "*.json" | wc -l | tr -d ' ')
.github/workflows/ci-gates.yml:53:          LARGE_FILES=$(find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M || true)
.github/workflows/ci-gates.yml:57:            find public/data -type f -name "*.json" -size +${MAX_SIZE_MB}M -exec ls -lh {} \;
.github/workflows/ci-gates.yml:64:          for module_dir in public/data/snapshots/*/; do
.github/workflows/ci-gates.yml:78:          TOTAL_SIZE=$(du -sb public/data 2>/dev/null | cut -f1 || true)
.github/workflows/ci-gates.yml:80:            TOTAL_SIZE=$(du -sk public/data 2>/dev/null | awk '{print $1 * 1024}' || true)
.github/workflows/ci-gates.yml:142:          npm run test:universe-registry
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
.github/workflows/ci-gates.yml:363:          # Check: No blanket ignores for public/data or mirrors
.github/workflows/ci-gates.yml:364:          if grep -nE '^(public/data/|mirrors/)$' .gitignore; then
.github/workflows/ci-gates.yml:365:            echo "❌ VIOLATION: .gitignore contains blanket ignore for public/data/ or mirrors/"
.github/workflows/ci-gates.yml:427:        run: bash scripts/ops/validate-truth.sh
.github/workflows/universe-refresh.yml:35:          ls -la public/data/universe/
.github/workflows/universe-refresh.yml:38:          for f in public/data/universe/*.json; do
.github/workflows/universe-refresh.yml:47:          git add public/data/universe/
.github/workflows/forecast-rollback.yml:16:  group: forecast-system
.github/workflows/forecast-rollback.yml:43:          cat > public/data/forecast/system/status.json << EOF
.github/workflows/forecast-rollback.yml:56:          # If target commit specified, checkout forecast data from that commit
.github/workflows/forecast-rollback.yml:58:            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
.github/workflows/forecast-rollback.yml:65:          git add public/data/forecast
.github/workflows/forecast-rollback.yml:66:          git commit -m "ops(forecast): rollback - ${{ inputs.reason }}" || echo "No changes"
.github/workflows/forecast-rollback.yml:78:              labels: ['ops', 'forecast', 'rollback']
.github/workflows/eod-latest.yml:59:        run: node scripts/ops/preflight-check.mjs --mode eod-latest
.github/workflows/eod-latest.yml:71:        run: node scripts/eod/build-eod-latest.mjs --universe "$RV_UNIVERSE" --chunk-size 500 --out public/data
.github/workflows/eod-latest.yml:74:        run: node scripts/ops/build-safety-snapshot.mjs
.github/workflows/eod-latest.yml:76:      - name: Build ops-daily snapshot
.github/workflows/eod-latest.yml:77:        run: npm run rv:ops
.github/workflows/eod-latest.yml:79:      - name: Build ops summary
.github/workflows/eod-latest.yml:80:        run: node scripts/ops/build-mission-control-summary.mjs
.github/workflows/eod-latest.yml:82:      - name: Build ops pulse
.github/workflows/eod-latest.yml:83:        run: node scripts/ops/build-ops-pulse.mjs
.github/workflows/eod-latest.yml:85:      - name: Validate ops summary
.github/workflows/eod-latest.yml:86:        run: node scripts/ops/validate-ops-summary.mjs
.github/workflows/eod-latest.yml:98:          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md
.github/workflows/eod-history-refresh.yml:9:  group: forecast-system
.github/workflows/eod-history-refresh.yml:34:          UNIVERSE_FILE="./public/data/universe/all.json"
.github/workflows/eod-history-refresh.yml:37:             UNIVERSE_FILE="./public/data/universe/nasdaq100.json"
.github/workflows/eod-history-refresh.yml:47:          git add public/data/eod/bars
.github/workflows/forecast-monthly.yml:22:  forecast-monthly:
.github/workflows/forecast-monthly.yml:56:          node scripts/forecast/run_monthly.mjs --month=${{ steps.month.outputs.month }} 2>&1 | tee pipeline.log
.github/workflows/forecast-monthly.yml:72:          git add public/data/forecast/reports/monthly/ || true
.github/workflows/forecast-monthly.yml:77:            git commit -m "chore(forecast): monthly report ${{ steps.month.outputs.month }}"
.github/workflows/forecast-monthly.yml:85:          name: forecast-monthly-log
.github/workflows/ci-policy.yml:7:      - 'mirrors/forecast/**'
.github/workflows/ci-policy.yml:11:  group: forecast-system
.github/workflows/ci-policy.yml:26:          node scripts/forecast/validate_policy.mjs
.github/workflows/v3-scrape-template.yml:63:          # Read enabled modules from registry
.github/workflows/v3-scrape-template.yml:65:            const registry = require('./public/data/registry/modules.json');
.github/workflows/v3-scrape-template.yml:66:            const modules = Object.entries(registry.modules || registry)
.github/workflows/forecast-daily.yml:26:  forecast-daily:
.github/workflows/forecast-daily.yml:54:          node scripts/forecast/run_daily.mjs $DATE_ARG 2>&1 | tee pipeline.log
.github/workflows/forecast-daily.yml:65:      - name: Commit forecast artifacts
.github/workflows/forecast-daily.yml:72:          git add mirrors/forecast/ledger/ || true
.github/workflows/forecast-daily.yml:73:          git add mirrors/forecast/snapshots/ || true
.github/workflows/forecast-daily.yml:74:          git add public/data/forecast/ || true
.github/workflows/forecast-daily.yml:80:            git commit -m "chore(forecast): daily pipeline $(date +%Y-%m-%d)"
.github/workflows/forecast-daily.yml:88:          name: forecast-daily-log
.github/workflows/wp16-manual-market-prices.yml:89:          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
.github/workflows/wp16-manual-market-prices.yml:90:          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true
.github/workflows/v3-finalizer.yml:171:            path="public/data/snapshots/${module}/latest.json"
.github/workflows/v3-finalizer.yml:193:          if git diff --quiet public/data; then
.github/workflows/v3-finalizer.yml:199:            git diff --stat public/data
.github/workflows/v3-finalizer.yml:209:          git add public/data/snapshots 2>/dev/null || echo "No snapshot files to add"
.github/workflows/v3-finalizer.yml:210:          git add public/data/state/modules/*.json 2>/dev/null || echo "No module state files to add"
.github/workflows/v3-finalizer.yml:211:          git add public/data/manifest.json 2>/dev/null || echo "No manifest to add"
.github/workflows/v3-finalizer.yml:212:          git add public/data/provider-state.json 2>/dev/null || echo "No provider-state to add"
.github/workflows/v3-finalizer.yml:243:          if [ -f public/data/manifest.json ]; then
.github/workflows/forecast-weekly.yml:22:  forecast-weekly:
.github/workflows/forecast-weekly.yml:50:          node scripts/forecast/run_weekly.mjs $DATE_ARG 2>&1 | tee pipeline.log
.github/workflows/forecast-weekly.yml:69:      - name: Commit forecast artifacts
.github/workflows/forecast-weekly.yml:76:          git add mirrors/forecast/challengers/ || true
.github/workflows/forecast-weekly.yml:77:          git add mirrors/forecast/champion/ || true
.github/workflows/forecast-weekly.yml:78:          git add mirrors/forecast/ledger/promotions/ || true
.github/workflows/forecast-weekly.yml:79:          git add public/data/forecast/ || true
.github/workflows/forecast-weekly.yml:85:            COMMIT_MSG="chore(forecast): weekly training $(date +%Y-%m-%d)"
.github/workflows/forecast-weekly.yml:87:              COMMIT_MSG="feat(forecast): promoted ${{ steps.pipeline.outputs.new_champion }}"
.github/workflows/forecast-weekly.yml:97:          name: forecast-weekly-log
.github/workflows/refresh-health-assets.yml:34:          if git diff --quiet public/data; then
.github/workflows/refresh-health-assets.yml:40:          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json

```