# VALUE_MATRIX

Generated: 2026-02-11T18:52:23Z

| Workflow | Path | Value | Functional Purpose | Evidence |
|---|---|---|---|---|
| v3 Finalizer | `.github/workflows/v3-finalizer.yml` | LOW | UI/Published Data Pipeline | ENOENT_MODULES |
| v3 Scrape Template | `.github/workflows/v3-scrape-template.yml` | LOW | UI/Published Data Pipeline | ENOENT_MODULES |
| CI Gates - Quality & Budget Checks | `.github/workflows/ci-gates.yml` | MEDIUM | UI/Published Data Pipeline | HTTP_403 |
| Cleanup Daily Snapshots | `.github/workflows/cleanup-daily-snapshots.yml` | LOW | UI/Published Data Pipeline | NO_FAILURE_SIGNATURE |
| WP16 Manual - Market Prices (Stooq) | `.github/workflows/wp16-manual-market-prices.yml` | LOW | UI/Published Data Pipeline | LOG_CAPTURE_FAILED |
| Refresh Health Assets | `.github/workflows/refresh-health-assets.yml` | MEDIUM | UI/Published Data Pipeline | ENOENT_SEED |
| Ops Daily Snapshot | `.github/workflows/ops-daily.yml` | HIGH | UI/Published Data Pipeline | NO_FAILURE_SIGNATURE |
| EOD Latest (NASDAQ-100) | `.github/workflows/eod-latest.yml` | HIGH | UI/Published Data Pipeline | NO_FAILURE_SIGNATURE |
| Scheduler Kick | `.github/workflows/scheduler-kick.yml` | HIGH | Monitoring/Orchestration | WAF_CHALLENGE |
| e2e-playwright | `.github/workflows/e2e-playwright.yml` | MEDIUM | Quality Gate | EXIT_CODE_1 |
| Forecast Daily Pipeline | `.github/workflows/forecast-daily.yml` | HIGH | UI/Published Data Pipeline | CIRCUIT_OPEN |
| Forecast Monthly Report | `.github/workflows/forecast-monthly.yml` | MEDIUM | UI/Published Data Pipeline | UNKNOWN |
| Forecast Weekly Training | `.github/workflows/forecast-weekly.yml` | MEDIUM | UI/Published Data Pipeline | NO_FAILURE_SIGNATURE |
| CI Determinism Check | `.github/workflows/ci-determinism.yml` | MEDIUM | Quality Gate | NO_FAILURE_SIGNATURE |
| CI Policy Check | `.github/workflows/ci-policy.yml` | MEDIUM | Model/Training or Ledger Pipeline | NO_FAILURE_SIGNATURE |
| EOD History Refresh | `.github/workflows/eod-history-refresh.yml` | MEDIUM | UI/Published Data Pipeline | NO_FAILURE_SIGNATURE |
| Forecast Rollback | `.github/workflows/forecast-rollback.yml` | LOW | UI/Published Data Pipeline | UNKNOWN |
| Ops Auto-Alerts | `.github/workflows/ops-auto-alerts.yml` | LOW | Maintenance/Utility | HTTP_403 |
| Universe Refresh | `.github/workflows/universe-refresh.yml` | MEDIUM | UI/Published Data Pipeline | HTTP_403 |
| Monitor Production Artifacts | `.github/workflows/monitor-prod.yml` | HIGH | Monitoring/Orchestration | HTTP_403 |

## Keyword Evidence
```
.github/workflows/v3-scrape-template.yml:69:                if (name === 'schema_version' || name === 'generated_at' || name === 'modules' || name === 'tiers' || name === 'policies') return false;
.github/workflows/v3-scrape-template.yml:79:          # If manual trigger with specific modules
.github/workflows/v3-scrape-template.yml:112:      - name: Install dependencies
.github/workflows/v3-scrape-template.yml:113:        run: npm ci
.github/workflows/v3-scrape-template.yml:229:      - name: Install dependencies
.github/workflows/v3-scrape-template.yml:230:        run: npm ci
.github/workflows/ci-policy.yml:6:      - 'policies/**'
.github/workflows/ci-policy.yml:7:      - 'mirrors/forecast/**'
.github/workflows/ci-policy.yml:11:  group: forecast-system
.github/workflows/ci-policy.yml:24:      - name: Validate Policies
.github/workflows/ci-policy.yml:26:          node scripts/forecast/validate_policy.mjs
.github/workflows/v3-finalizer.yml:45:      - name: Install dependencies
.github/workflows/v3-finalizer.yml:46:        run: npm ci
.github/workflows/eod-latest.yml:17:  group: eod-latest
.github/workflows/eod-latest.yml:34:        run: npm ci
.github/workflows/eod-latest.yml:56:        run: npm ci
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
.github/workflows/eod-latest.yml:91:        run: node scripts/ci/assert-mission-control-gate.mjs
.github/workflows/eod-latest.yml:98:          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md
.github/workflows/eod-latest.yml:103:          git commit -m "data(eod): update nasdaq100 latest" || exit 0
.github/workflows/monitor-prod.yml:37:          fetch_json "$BASE_URL/data/forecast/latest.json" /tmp/forecast_latest.json
.github/workflows/monitor-prod.yml:38:          fetch_json "$BASE_URL/data/forecast/system/status.json" /tmp/forecast_status.json
.github/workflows/monitor-prod.yml:42:          fetch_json "$BASE_URL/data/ops/pulse.json" /tmp/ops_pulse.json
.github/workflows/monitor-prod.yml:54:            ((.data.forecasts | length) > 0)
.github/workflows/monitor-prod.yml:55:          ' /tmp/forecast_latest.json >/dev/null
.github/workflows/monitor-prod.yml:56:          echo "✅ forecast/latest semantic checks passed"
.github/workflows/monitor-prod.yml:61:            (if (((.status // .meta.status // "") | ascii_downcase) == "circuit_open" or
.github/workflows/monitor-prod.yml:62:                 (((.circuit_state // .circuit.state // "") | ascii_downcase) == "open"))
.github/workflows/monitor-prod.yml:66:          ' /tmp/forecast_status.json >/dev/null
.github/workflows/monitor-prod.yml:67:          echo "✅ forecast/system/status semantic checks passed"
.github/workflows/monitor-prod.yml:72:             else ((.meta.circuitOpen == true) and ((.meta.reason // .error.code // "") | tostring | length) > 0)
.github/workflows/monitor-prod.yml:92:            (.meta.circuitOpen | type == "boolean")
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
.github/workflows/forecast-rollback.yml:16:  group: forecast-system
.github/workflows/forecast-rollback.yml:43:          cat > public/data/forecast/system/status.json << EOF
.github/workflows/forecast-rollback.yml:56:          # If target commit specified, checkout forecast data from that commit
.github/workflows/forecast-rollback.yml:58:            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
.github/workflows/forecast-rollback.yml:65:          git add public/data/forecast
.github/workflows/forecast-rollback.yml:66:          git commit -m "ops(forecast): rollback - ${{ inputs.reason }}" || echo "No changes"
.github/workflows/forecast-rollback.yml:78:              labels: ['ops', 'forecast', 'rollback']
.github/workflows/forecast-weekly.yml:22:  forecast-weekly:
.github/workflows/forecast-weekly.yml:39:      - name: Install dependencies
.github/workflows/forecast-weekly.yml:40:        run: npm ci --prefer-offline
.github/workflows/forecast-weekly.yml:50:          node scripts/forecast/run_weekly.mjs $DATE_ARG 2>&1 | tee pipeline.log
.github/workflows/forecast-weekly.yml:69:      - name: Commit forecast artifacts
.github/workflows/forecast-weekly.yml:76:          git add mirrors/forecast/challengers/ || true
.github/workflows/forecast-weekly.yml:77:          git add mirrors/forecast/champion/ || true
.github/workflows/forecast-weekly.yml:78:          git add mirrors/forecast/ledger/promotions/ || true
.github/workflows/forecast-weekly.yml:79:          git add public/data/forecast/ || true
.github/workflows/forecast-weekly.yml:85:            COMMIT_MSG="chore(forecast): weekly training $(date +%Y-%m-%d)"
.github/workflows/forecast-weekly.yml:87:              COMMIT_MSG="feat(forecast): promoted ${{ steps.pipeline.outputs.new_champion }}"
.github/workflows/forecast-weekly.yml:97:          name: forecast-weekly-log
.github/workflows/wp16-manual-market-prices.yml:29:        run: npm ci
.github/workflows/ci-determinism.yml:6:      - 'scripts/forecast/**'
.github/workflows/ci-determinism.yml:10:      - 'scripts/forecast/**'
.github/workflows/ci-determinism.yml:15:  group: forecast-determinism-${{ github.ref }}
.github/workflows/ci-determinism.yml:19:  # MEM v1.2 Determinism: Lock threads for reproducible runs
.github/workflows/ci-determinism.yml:39:      - name: Install dependencies
.github/workflows/ci-determinism.yml:40:        run: npm ci
.github/workflows/ci-determinism.yml:46:        run: npm run validate:forecast-registry
.github/workflows/ci-determinism.yml:49:        run: npm run validate:forecast-schemas
.github/workflows/forecast-monthly.yml:22:  forecast-monthly:
.github/workflows/forecast-monthly.yml:39:      - name: Install dependencies
.github/workflows/forecast-monthly.yml:40:        run: npm ci --prefer-offline
.github/workflows/forecast-monthly.yml:56:          node scripts/forecast/run_monthly.mjs --month=${{ steps.month.outputs.month }} 2>&1 | tee pipeline.log
.github/workflows/forecast-monthly.yml:72:          git add public/data/forecast/reports/monthly/ || true
.github/workflows/forecast-monthly.yml:77:            git commit -m "chore(forecast): monthly report ${{ steps.month.outputs.month }}"
.github/workflows/forecast-monthly.yml:85:          name: forecast-monthly-log
.github/workflows/universe-refresh.yml:48:          git commit -m "chore(universe): refresh index constituents [skip ci]" || echo "No changes"
.github/workflows/refresh-health-assets.yml:25:      - name: Install dependencies
.github/workflows/refresh-health-assets.yml:26:        run: npm ci
.github/workflows/e2e-playwright.yml:10:  ops-e2e:
.github/workflows/e2e-playwright.yml:21:      - name: Install dependencies
.github/workflows/e2e-playwright.yml:22:        run: npm ci
.github/workflows/forecast-daily.yml:20:  # MEM v1.2 Determinism: Lock threads for reproducible runs
.github/workflows/forecast-daily.yml:26:  forecast-daily:
.github/workflows/forecast-daily.yml:43:      - name: Install dependencies
.github/workflows/forecast-daily.yml:44:        run: npm ci --prefer-offline
.github/workflows/forecast-daily.yml:54:          node scripts/forecast/run_daily.mjs $DATE_ARG 2>&1 | tee pipeline.log
.github/workflows/forecast-daily.yml:65:      - name: Commit forecast artifacts
.github/workflows/forecast-daily.yml:72:          git add mirrors/forecast/ledger/ || true
.github/workflows/forecast-daily.yml:73:          git add mirrors/forecast/snapshots/ || true
.github/workflows/forecast-daily.yml:74:          git add public/data/forecast/ || true
.github/workflows/forecast-daily.yml:80:            git commit -m "chore(forecast): daily pipeline $(date +%Y-%m-%d)"
.github/workflows/forecast-daily.yml:88:          name: forecast-daily-log
.github/workflows/ops-daily.yml:12:  group: ops-daily
.github/workflows/ops-daily.yml:29:        run: npm ci
.github/workflows/ops-daily.yml:49:        run: npm ci
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
.github/workflows/ops-daily.yml:87:        run: node scripts/ci/assert-mission-control-gate.mjs
.github/workflows/ops-daily.yml:94:          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json
.github/workflows/ops-daily.yml:99:          git commit -m "chore(ops): update ops-daily snapshot" || exit 0
.github/workflows/scheduler-kick.yml:25:        run: npm ci
.github/workflows/scheduler-kick.yml:33:      - name: Trigger scheduler
.github/workflows/scheduler-kick.yml:49:          payload='{"job":"eod_stock","mode":"s2","universe":"nasdaq100"}'
.github/workflows/scheduler-kick.yml:50:          status=$(curl -sS -o /tmp/scheduler.json -w "%{http_code}" \
.github/workflows/scheduler-kick.yml:51:            -X POST "${RV_PROD_BASE%/}/api/scheduler/run" \
.github/workflows/scheduler-kick.yml:58:            cat /tmp/scheduler.json >&2 || true
.github/workflows/scheduler-kick.yml:62:          jq -e '.ok | type == "boolean"' /tmp/scheduler.json >/dev/null
.github/workflows/scheduler-kick.yml:63:          jq -e '.meta.status | type == "string"' /tmp/scheduler.json >/dev/null
.github/workflows/scheduler-kick.yml:64:          jq -e '.meta.data_date | type == "string"' /tmp/scheduler.json >/dev/null
.github/workflows/scheduler-kick.yml:66:          jq -r '{ok, meta_status:.meta.status, job:(.data.job // null), run_id:(.data.run_id // null)}' /tmp/scheduler.json
.github/workflows/eod-history-refresh.yml:9:  group: forecast-system
.github/workflows/eod-history-refresh.yml:26:      - name: Install dependencies (if any)
.github/workflows/eod-history-refresh.yml:27:        run: npm ci || npm install node-fetch
.github/workflows/eod-history-refresh.yml:41:          node scripts/providers/eodhd-backfill-bars.mjs --universe "$UNIVERSE_FILE"
.github/workflows/eod-history-refresh.yml:47:          git add public/data/eod/bars
.github/workflows/eod-history-refresh.yml:48:          git commit -m "chore(data): refresh eod history [skip ci]" || echo "No changes to commit"
.github/workflows/ci-gates.yml:117:      - name: Install dependencies
.github/workflows/ci-gates.yml:118:        run: npm ci
.github/workflows/ci-gates.yml:121:        run: node scripts/ci/verify-artifacts.mjs
.github/workflows/ci-gates.yml:124:        run: node scripts/ci/assert-mission-control-gate.mjs
.github/workflows/ci-gates.yml:130:        run: node scripts/ci/check-elliott-parity.mjs
.github/workflows/ci-gates.yml:133:        run: bash scripts/ci/forbid-kv-writes-in-api.sh
.github/workflows/ci-gates.yml:148:        run: node scripts/eod/check-eod-artifacts.mjs
.github/workflows/ci-gates.yml:282:      - name: Install dependencies
.github/workflows/ci-gates.yml:283:        run: npm ci
.github/workflows/ci-gates.yml:350:  repo-policies:
.github/workflows/ci-gates.yml:359:          echo "🔍 Checking Repository Policies..."
.github/workflows/ci-gates.yml:427:        run: bash scripts/ops/validate-truth.sh
.github/workflows/ci-gates.yml:432:    needs: [asset-budget, schema-validation, manifest-integrity, repo-policies, truth-gates]
.github/workflows/ci-gates.yml:442:          echo "- Repo Policies: ${{ needs.repo-policies.result }}" >> $GITHUB_STEP_SUMMARY

```