# DEPENDENCIES

Generated: 2026-02-11T18:05:43Z

## workflow_run / workflow_call edges

```text
.github/workflows/v3-finalizer.yml:4:  workflow_run:
```

## Artifact handoff usage

```text
.github/workflows/forecast-monthly.yml:83:        uses: actions/upload-artifact@v4
.github/workflows/forecast-daily.yml:86:        uses: actions/upload-artifact@v4
.github/workflows/v3-finalizer.yml:49:        uses: dawidd6/action-download-artifact@v6
.github/workflows/v3-finalizer.yml:58:        uses: dawidd6/action-download-artifact@v6
.github/workflows/v3-scrape-template.yml:180:        uses: actions/upload-artifact@v4
.github/workflows/forecast-weekly.yml:95:        uses: actions/upload-artifact@v4
```

## Producer/Consumer hints on public/data and mirrors

```text
.github/workflows/forecast-rollback.yml:43:          cat > public/data/forecast/system/status.json << EOF
.github/workflows/forecast-rollback.yml:58:            git checkout ${{ inputs.target_commit }} -- public/data/forecast/latest.json || echo "Could not restore latest.json"
.github/workflows/forecast-rollback.yml:65:          git add public/data/forecast
.github/workflows/forecast-monthly.yml:72:          git add public/data/forecast/reports/monthly/ || true
.github/workflows/v3-scrape-template.yml:65:            const registry = require('./public/data/registry/modules.json');
.github/workflows/forecast-daily.yml:72:          git add mirrors/forecast/ledger/ || true
.github/workflows/forecast-daily.yml:73:          git add mirrors/forecast/snapshots/ || true
.github/workflows/forecast-daily.yml:74:          git add public/data/forecast/ || true
.github/workflows/cleanup-daily-snapshots.yml:61:          git add public/data
.github/workflows/eod-history-refresh.yml:34:          UNIVERSE_FILE="./public/data/universe/all.json"
.github/workflows/eod-history-refresh.yml:37:             UNIVERSE_FILE="./public/data/universe/nasdaq100.json"
.github/workflows/eod-history-refresh.yml:47:          git add public/data/eod/bars
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
.github/workflows/wp16-manual-market-prices.yml:89:          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
.github/workflows/wp16-manual-market-prices.yml:90:          git add public/data/snapshots public/data/state/modules/*.json public/data/manifest.json public/data/provider-state.json 2>/dev/null || true
.github/workflows/v3-finalizer.yml:171:            path="public/data/snapshots/${module}/latest.json"
.github/workflows/v3-finalizer.yml:209:          git add public/data/snapshots 2>/dev/null || echo "No snapshot files to add"
.github/workflows/v3-finalizer.yml:210:          git add public/data/state/modules/*.json 2>/dev/null || echo "No module state files to add"
.github/workflows/v3-finalizer.yml:211:          git add public/data/manifest.json 2>/dev/null || echo "No manifest to add"
.github/workflows/v3-finalizer.yml:212:          git add public/data/provider-state.json 2>/dev/null || echo "No provider-state to add"
.github/workflows/v3-finalizer.yml:243:          if [ -f public/data/manifest.json ]; then
.github/workflows/refresh-health-assets.yml:40:          git add public/data/system-health.json public/data/blocks/health.latest.json public/data/snapshots/health.json public/data/snapshots/health/latest.json
.github/workflows/ci-policy.yml:7:      - 'mirrors/forecast/**'
.github/workflows/eod-latest.yml:98:          git add public/data/eod public/data/pipeline public/data/ops public/data/ops-daily.json docs/architecture/data-layout-law-v1.md
.github/workflows/forecast-weekly.yml:76:          git add mirrors/forecast/challengers/ || true
.github/workflows/forecast-weekly.yml:77:          git add mirrors/forecast/champion/ || true
.github/workflows/forecast-weekly.yml:78:          git add mirrors/forecast/ledger/promotions/ || true
.github/workflows/forecast-weekly.yml:79:          git add public/data/forecast/ || true
.github/workflows/universe-refresh.yml:35:          ls -la public/data/universe/
.github/workflows/universe-refresh.yml:38:          for f in public/data/universe/*.json; do
.github/workflows/universe-refresh.yml:47:          git add public/data/universe/
.github/workflows/ops-daily.yml:94:          git add public/data/pipeline/*.json public/data/ops public/data/ops-daily.json
```

## Script-level write/read contract evidence

```text
.github/workflows/wp16-manual-market-prices.yml:89:          git add public/data/snapshots/market-prices/latest.json public/data/snapshots/market-prices/ || true
.github/workflows/v3-scrape-template.yml:65:            const registry = require('./public/data/registry/modules.json');
scripts/ops/preflight-check.mjs:106:  await atomicWriteJson("public/data/ops/pulse.json", pulsePayload);
scripts/ops/build-ops-daily.mjs:317:  const pricesSnap = await readJson('public/data/snapshots/market-prices/latest.json', null);
scripts/providers/market-prices-v3.mjs:21:const PUBLISHED_MARKET_PRICES_PATH = join(BASE_DIR, 'public/data/snapshots/market-prices/latest.json');
scripts/providers/market-prices-v3.mjs:640:    join(BASE_DIR, 'public/data/registry/modules.json'),
scripts/providers/market-prices-v3.mjs:687:    join(BASE_DIR, 'public/data/registry/providers.v1.json'),
scripts/providers/market-prices-v3.mjs:789:    throw new Error('PROVIDER_AUTH_ENV_VAR_MISSING (check public/data/registry/providers.v1.json)');
scripts/providers/market-score-v3.mjs:149:  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
scripts/wp16/guard-market-prices.mjs:3:const p = './public/data/snapshots/market-prices/latest.json';
scripts/providers/market-health-v3.mjs:293:  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
scripts/forecast/snapshot_ingest.mjs:21:const MARKET_PRICES_SNAPSHOT_PATH = 'public/data/snapshots/market-prices/latest.json';
scripts/providers/universe-v2.mjs:218:  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
scripts/pipeline/build-ndx100-pipeline-truth.mjs:147:  const pricesSnap = await readJsonRel('public/data/snapshots/market-prices/latest.json');
scripts/ops/build-mission-control-summary.mjs:173:  await atomicWriteJson('public/data/ops/summary.latest.json', summary);
scripts/ci/verify-artifacts.mjs:96:    relPath: 'public/data/snapshots/market-prices/latest.json',
scripts/providers/market-stats-v3.mjs:39:  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
scripts/providers/market-stats-v3.mjs:49:  const universePath = join(BASE_DIR, 'public/data/registry/universe.v1.json');
scripts/ci/assert-mission-control-gate.mjs:5:const SUMMARY_PATH = "public/data/ops/summary.latest.json";
scripts/ops/build-ops-pulse.mjs:5:const SUMMARY_PATH = "public/data/ops/summary.latest.json";
scripts/ops/build-ops-pulse.mjs:6:const PULSE_PATH = "public/data/ops/pulse.json";
scripts/create-initial-provider-state.mjs:32:    const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
scripts/ops/validate-ops-summary.mjs:37:  const summary = await readJson('public/data/ops/summary.latest.json');
```

## Orphan candidates (manual-only + no workflow_call references)
- forecast-rollback.yml (manual-only, never-run last30; no workflow_call refs found)
- wp16-manual-market-prices.yml (manual-only, run history present but failing)

Delete gate status: NOT ELIGIBLE (insufficient age/no-dependency window proof for hard delete).
