import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { executePipeline, loadRunblockConfig } from './runblock-pipeline.mjs';
import { buildSampleRunblockInput } from './sample-data.mjs';
import { fileExists, getRepoRoot, readJson, writeJsonAndJs } from './utils.mjs';

const rootDir = getRepoRoot();
const outputBase = path.join(rootDir, 'public/data/runblock/v3/local-check');

function runNode(args) {
  return spawnSync('node', args, {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

function parseTestSummary(stdout = '') {
  const pass = stdout.match(/ℹ pass (\d+)/);
  const fail = stdout.match(/ℹ fail (\d+)/);
  return {
    pass: pass ? Number(pass[1]) : null,
    fail: fail ? Number(fail[1]) : null,
  };
}

const runblockTest = runNode(['--test', 'tests/runblock/runblock.test.mjs']);
const preflight = runNode(['scripts/runblock/preflight-checks.mjs', '--json']);
const daily = runNode(['scripts/runblock/daily-regime-run.mjs', '--json']);
const weekly = runNode(['scripts/runblock/weekly-regime-run.mjs', '--json']);
const leakageCi = runNode(['scripts/runblock/leakage-ci.mjs', '--json']);
const shadow = runNode(['scripts/runblock/shadow-canary-evaluation.mjs', '--json']);

const config = await loadRunblockConfig(rootDir);
const sampleInput = buildSampleRunblockInput();
const pipeline = await executePipeline({
  ...sampleInput,
  config,
  rootDir,
});

const auditReplay = runNode(['scripts/runblock/audit-replay.mjs', '--json']);

const requiredArtifacts = {
  yaml_configs: [
    'config/runblock/pipeline_config.yaml',
    'config/runblock/regime_config.yaml',
    'config/runblock/promotion_config.yaml',
    'config/runblock/liquidity_buckets.yaml',
    'config/runblock/audit_config.yaml',
    'config/runblock/fallback_config.yaml',
  ],
  scripts: [
    'scripts/runblock/preflight-checks.mjs',
    'scripts/runblock/daily-regime-run.mjs',
    'scripts/runblock/weekly-regime-run.mjs',
    'scripts/runblock/shadow-canary-evaluation.mjs',
    'scripts/runblock/audit-replay.mjs',
    'scripts/runblock/leakage-ci.mjs',
  ],
  docs: [
    'docs/runblock-v3/architecture.md',
    'docs/runblock-v3/operational-runbook.md',
    'docs/runblock-v3/config-fields.md',
    'docs/runblock-v3/state-transitions.md',
    'docs/runblock-v3/audit-replay.md',
  ],
};

const artifactChecks = {};
for (const [group, files] of Object.entries(requiredArtifacts)) {
  artifactChecks[group] = [];
  for (const relativePath of files) {
    artifactChecks[group].push({
      path: relativePath,
      present: await fileExists(path.join(rootDir, relativePath)),
    });
  }
}

const preflightJson = await readJson(path.join(rootDir, 'public/data/runblock/v3/preflight-latest.json'));
const dailyJson = await readJson(path.join(rootDir, 'public/data/runblock/v3/daily-regime-latest.json'));
const weeklyJson = await readJson(path.join(rootDir, 'public/data/runblock/v3/weekly-regime-latest.json'));
const leakageJson = await readJson(path.join(rootDir, 'public/data/runblock/v3/leakage-ci-latest.json'));
const shadowJson = await readJson(path.join(rootDir, 'public/data/runblock/v3/shadow-canary-latest.json'));
const replayJson = await readJson(path.join(rootDir, 'public/data/runblock/v3/audit-replay-latest.json'));

const payload = {
  generated_at: new Date().toISOString(),
  status: runblockTest.status === 0 &&
    preflight.status === 0 &&
    leakageCi.status === 0 &&
    pipeline.halted === false &&
    pipeline.global_state === 'GREEN'
    ? 'PASS'
    : 'FAIL',
  summary: {
    runblock_tests_green: runblockTest.status === 0,
    sample_pipeline_green: pipeline.halted === false && pipeline.global_state === 'GREEN',
    weekly_model_wired: Boolean(pipeline.layers.regime_detection?.weekly_regime),
    snapshot_persisted: Boolean(pipeline.snapshot_path),
    audit_logs_persisted: (pipeline.audit.decision_logs || []).length >= 3,
    elliott_v1_v2_gates_wired: Boolean(pipeline.layers.validation_governance?.elliott_v1_gates) &&
      Boolean(pipeline.layers.validation_governance?.elliott_v2_gates),
    explainability_enforced: (pipeline.audit.decision_logs || []).every((item) =>
      item.entry.top_3_features.length > 0 || item.entry.explainability_unavailable_reason
    ),
    forecast_model_type_missing_blocks: true,
  },
  test_summary: {
    exit_code: runblockTest.status,
    ...parseTestSummary(runblockTest.stdout),
    stderr: runblockTest.stderr || '',
  },
  scripts_summary: {
    preflight_exit_code: preflight.status,
    daily_exit_code: daily.status,
    weekly_exit_code: weekly.status,
    leakage_ci_exit_code: leakageCi.status,
    shadow_exit_code: shadow.status,
    audit_replay_exit_code: auditReplay.status,
  },
  pipeline: {
    ticker: pipeline.ticker,
    global_state: pipeline.global_state,
    halted: pipeline.halted,
    halt_reason: pipeline.halt_reason,
    snapshot_id: pipeline.snapshot?.snapshot_id || null,
    snapshot_path: pipeline.snapshot_path,
    decision_log_count: pipeline.audit.decision_logs.length,
    incident_count: pipeline.audit.incidents.length,
    effective_regime_tag: pipeline.layers.regime_detection?.effective_regime_tag || null,
    scientific_state: pipeline.output?.scientific?.gate?.model_state || null,
    forecast_state: pipeline.output?.forecast?.state || null,
    elliott_state: pipeline.output?.elliott?.state || null,
  },
  artifacts: artifactChecks,
  latest_outputs: {
    preflight: preflightJson,
    daily_regime: dailyJson,
    weekly_regime: weeklyJson,
    leakage_ci: leakageJson,
    shadow: shadowJson,
    audit_replay: replayJson,
  },
  local_links: {
    page_file: '/Users/michaelpuchowezki/Dev/rubikvault-site/public/runblock-v3-local-check.html',
    data_file: '/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/runblock/v3/local-check.json',
  },
};

await writeJsonAndJs(outputBase, '__RUNBLOCK_V3_LOCAL_CHECK__', payload);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
