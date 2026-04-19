import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classifyRuntimeFailure } from '../../scripts/ops/runtime-preflight.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('runtime preflight classifies NAS runtime transport failures explicitly', () => {
  assert.equal(classifyRuntimeFailure('timeout_after_12000ms'), 'runtime_unavailable');
  assert.equal(classifyRuntimeFailure('read ECONNRESET'), 'runtime_unstable');
  assert.equal(classifyRuntimeFailure('socket hang up'), 'runtime_unstable');
  assert.equal(classifyRuntimeFailure('unexpected 400 payload'), null);
});

test('publish chain runs runtime_preflight before universe audit, then decision_bundle before final seal', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-stock-analyzer-publish-chain.mjs'), 'utf8');
  assert.match(content, /id: 'runtime_preflight'/);
  assert.match(content, /id: 'runtime_preflight'[\s\S]*id: 'stock_analyzer_universe_audit'/);
  assert.match(content, /id: 'stock_analyzer_universe_audit'[\s\S]*id: 'ui_audit'/);
  assert.match(content, /id: 'ui_audit'[\s\S]*id: 'decision_bundle'/);
  assert.match(content, /id: 'decision_bundle'[\s\S]*id: 'final_integrity_seal'/);
});

test('publish snapshot step disables live network fallbacks', () => {
  const publishChain = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-stock-analyzer-publish-chain.mjs'), 'utf8');
  const bestSetups = fs.readFileSync(path.join(ROOT, 'scripts/build-best-setups-v4.mjs'), 'utf8');
  assert.match(publishChain, /BEST_SETUPS_DISABLE_NETWORK: '1'/);
  assert.match(publishChain, /ALLOW_REMOTE_BAR_FETCH: '0'/);
  assert.match(publishChain, /BEST_SETUPS_CONCURRENCY: process\.env\.BEST_SETUPS_CONCURRENCY \|\| '2'/);
  assert.match(publishChain, /BEST_SETUPS_META_CONCURRENCY: process\.env\.BEST_SETUPS_META_CONCURRENCY \|\| '4'/);
  assert.match(bestSetups, /setLocalBarsRuntimeOverrides\(\{\s*allowRemoteBarFetch: false,/);
});

test('prod shell entry points hard-gate on shared runtime preflight', () => {
  const dailyReport = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/run_quantlab_v4_daily_report.sh'), 'utf8');
  const refreshApi = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/run_quantlab_v4_refresh_api.sh'), 'utf8');
  assert.match(dailyReport, /scripts\/ops\/runtime-preflight\.mjs/);
  assert.match(refreshApi, /scripts\/ops\/runtime-preflight\.mjs --ensure-runtime --mode=hard/);
});

test('recovery and supervisor treat runtime_preflight as a first-class blocker', () => {
  const recovery = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), 'utf8');
  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-pipeline-master-supervisor.mjs'), 'utf8');
  const runtimePreflight = fs.readFileSync(path.join(ROOT, 'scripts/ops/runtime-preflight.mjs'), 'utf8');
  const uiAudit = fs.readFileSync(path.join(ROOT, 'scripts/ops/verify-ui-completeness.mjs'), 'utf8');
  const publishChain = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-stock-analyzer-publish-chain.mjs'), 'utf8');
  const resolveNode20 = fs.readFileSync(path.join(ROOT, 'scripts/ops/resolve-node20-bin.sh'), 'utf8');
  assert.match(recovery, /id: 'runtime_preflight'/);
  assert.match(recovery, /summary\?\.runtime_preflight_ok === true/);
  assert.match(supervisor, /runtime_preflight_ok === false/);
  assert.match(supervisor, /runtimePreflight/);
  assert.match(runtimePreflight, /runtime_owner_node_mismatch/);
  assert.match(runtimePreflight, /runtime_owner_wrangler_mismatch/);
  assert.match(runtimePreflight, /runtime_owner_stale_processes/);
  assert.match(runtimePreflight, /resolveApprovedNodeBin/);
  assert.match(runtimePreflight, /RV_REPO_ROOT: ROOT/);
  assert.match(runtimePreflight, /!command\.startsWith\(expectedNodeBin\)/);
  assert.match(runtimePreflight, /node_modules', 'wrangler', 'wrangler-dist', 'cli\.js'/);
  assert.match(runtimePreflight, /pid=,ppid=,command=/);
  assert.match(runtimePreflight, /workerd-linux-64', 'bin', 'workerd'/);
  assert.match(runtimePreflight, /\/bin\/sh/);
  assert.match(uiAudit, /resolveApprovedNodeBin/);
  assert.match(publishChain, /const node = resolveApprovedNodeBin\(\)/);
  assert.match(resolveNode20, /\/usr\/local\/bin\/node/);
  assert.match(resolveNode20, /Node\.js_v20\/usr\/local\/bin\/node/);
  assert.match(recovery, /RV_REPO_ROOT: ROOT/);
});

test('ui field truth keeps runtime failures separate from endpoint contract failures', () => {
  const truthReport = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-ui-field-truth-report.mjs'), 'utf8');
  const uiAudit = fs.readFileSync(path.join(ROOT, 'scripts/ops/verify-ui-completeness.mjs'), 'utf8');
  const detailAudit = fs.readFileSync(path.join(ROOT, 'scripts/ops/verify-stock-analyzer-detail-contract.mjs'), 'utf8');
  assert.match(truthReport, /runtime_unavailable/);
  assert.match(truthReport, /runtime_unstable/);
  assert.match(truthReport, /endpoint_contract_failed/);
  assert.match(truthReport, /runtime_preflight_ref/);
  assert.match(uiAudit, /scripts\/ops\/runtime-preflight\.mjs', '--ensure-runtime', '--mode=hard/);
  assert.match(uiAudit, /family: 'ui_runtime'/);
  assert.match(detailAudit, /process\.execPath/);
  assert.match(detailAudit, /node_modules', '.bin', 'wrangler'/);
  assert.doesNotMatch(detailAudit, /spawn\('npm', \['run', 'dev:pages:port'\]/);
});

test('nas deploy wrapper syncs runtime history-store fixes', () => {
  const deployWrapper = fs.readFileSync(path.join(ROOT, 'scripts/ops/deploy-pipeline-master-to-nas.sh'), 'utf8');
  assert.match(deployWrapper, /functions\/api\/_shared\/history-store\.mjs/);
});

test('runtime canary history sync tool ships manifests and mirror packs to NAS', () => {
  const syncTool = fs.readFileSync(path.join(ROOT, 'scripts/ops/sync-runtime-canary-history-to-nas.sh'), 'utf8');
  assert.match(syncTool, /pack-manifest\.us-eu\.json/);
  assert.match(syncTool, /pack-manifest\.us-eu\.lookup\.json/);
  assert.match(syncTool, /mirrors\/universe-v7\/history/);
  assert.match(syncTool, /wrangler\|workerd/);
});

test('decision bundle reader avoids internal HTTP fetches for local Pages requests', () => {
  const reader = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/decision-bundle-reader.js'), 'utf8');
  const dataInterface = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/data-interface.js'), 'utf8');
  const historyStore = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/history-store.mjs'), 'utf8');
  const deployWrapper = fs.readFileSync(path.join(ROOT, 'scripts/ops/deploy-pipeline-master-to-nas.sh'), 'utf8');
  assert.match(reader, /hostname === '127\.0\.0\.1' \|\| hostname === 'localhost'/);
  assert.match(reader, /return isLocalDevRequest\(options\.request\) \? LOCAL_ROOT : null/);
  assert.match(reader, /const localRoot = rootDir \|\| resolveRootDir\(\{ request, rootDir \}\)/);
  assert.match(reader, /process\.env\?\.RV_REPO_ROOT/);
  assert.match(dataInterface, /process\.env\?\.RV_REPO_ROOT/);
  assert.match(historyStore, /process\.env\?\.RV_REPO_ROOT/);
  assert.match(deployWrapper, /functions\/api\/_shared\/data-interface\.js/);
});
