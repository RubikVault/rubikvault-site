import path from 'node:path';

import { loadRunblockConfig } from './runblock-pipeline.mjs';
import { fileExists, getRepoRoot, parseArgs, printJsonOrTable, writeJson } from './utils.mjs';

const rootDir = getRepoRoot();
const args = parseArgs();
const outPath = path.join(rootDir, 'public/data/runblock/v3/preflight-latest.json');

const requiredFiles = [
  'config/runblock/pipeline_config.yaml',
  'config/runblock/regime_config.yaml',
  'config/runblock/promotion_config.yaml',
  'config/runblock/liquidity_buckets.yaml',
  'config/runblock/audit_config.yaml',
  'config/runblock/fallback_config.yaml',
  'scripts/runblock/preflight-checks.mjs',
  'scripts/runblock/daily-regime-run.mjs',
  'scripts/runblock/weekly-regime-run.mjs',
  'scripts/runblock/shadow-canary-evaluation.mjs',
  'scripts/runblock/audit-replay.mjs',
  'scripts/runblock/leakage-ci.mjs',
  'docs/runblock-v3/architecture.md',
  'docs/runblock-v3/operational-runbook.md',
  'docs/runblock-v3/config-fields.md',
  'docs/runblock-v3/state-transitions.md',
  'docs/runblock-v3/audit-replay.md',
];

const config = await loadRunblockConfig(rootDir);
const missing = [];
for (const relativePath of requiredFiles) {
  if (!await fileExists(path.join(rootDir, relativePath))) {
    missing.push(relativePath);
  }
}

const pipelineOrder = config.pipeline_config?.pipeline_order || [];
const result = {
  generated_at: new Date().toISOString(),
  status: missing.length === 0 && JSON.stringify(pipelineOrder) === JSON.stringify([
    'data_integrity',
    'regime_detection',
    'audit_feedback',
    'validation_governance',
    'feature_output',
  ]) ? 'PASS' : 'FAIL',
  pipeline_order_ok: JSON.stringify(pipelineOrder) === JSON.stringify([
    'data_integrity',
    'regime_detection',
    'audit_feedback',
    'validation_governance',
    'feature_output',
  ]),
  loaded_configs: Object.keys(config).filter((key) => Object.keys(config[key] || {}).length > 0),
  missing_artifacts: missing,
};

await writeJson(outPath, result);
printJsonOrTable(result, Boolean(args.json));
process.exit(result.status === 'PASS' ? 0 : 1);
