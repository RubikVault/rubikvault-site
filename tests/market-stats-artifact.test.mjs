#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function runMarketStats(envOverrides, artifactsBase) {
  const env = { ...process.env, ...envOverrides };
  env.ARTIFACTS_DIR = artifactsBase;
  return spawnSync('node', ['scripts/providers/market-stats-v3.mjs'], {
    env,
    encoding: 'utf-8'
  });
}

function runValidator(outDir) {
  const env = { ...process.env, RV_ARTIFACT_OUT_DIR: outDir };
  return spawnSync('node', ['scripts/validate/market-stats-artifact.v1.mjs'], {
    env,
    encoding: 'utf-8'
  });
}

async function main() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-stats-artifact-'));
  const barsDir = path.join(tmpBase, 'bars');
  fs.mkdirSync(path.join(barsDir, 'market-prices'), { recursive: true });
  const fixture = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'market-prices-latest.sample.json'), 'utf-8');
  fs.writeFileSync(path.join(barsDir, 'market-prices', 'snapshot.json'), fixture, 'utf-8');

  const artifactsBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-stats-artifacts-'));
  const statsResult = runMarketStats({ BARS_ARTIFACTS_DIR: barsDir }, artifactsBase);
  assert(statsResult.status === 0, `market-stats provider failed: ${statsResult.stderr || statsResult.stdout}`);

  const validatorResult = runValidator(path.join(artifactsBase, 'market-stats'));
  assert(validatorResult.status === 0, `validator failed: ${validatorResult.stderr || validatorResult.stdout}`);

  console.log('✅ market-stats artifact smoke validator');
}

main().catch((err) => {
  console.error('❌ market-stats artifact smoke validator');
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
