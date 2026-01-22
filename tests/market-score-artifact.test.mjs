#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function runMarketScore(envOverrides, artifactsBase) {
  const env = { ...process.env, ...envOverrides };
  env.ARTIFACTS_DIR = artifactsBase;
  return spawnSync('node', ['scripts/providers/market-score-v3.mjs'], {
    env,
    encoding: 'utf-8'
  });
}

function runValidator(outDir) {
  const env = { ...process.env, RV_ARTIFACT_OUT_DIR: outDir };
  return spawnSync('node', ['scripts/validate/market-score-artifact.v1.mjs'], {
    env,
    encoding: 'utf-8'
  });
}

async function main() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-score-'));
  const barsDir = path.join(tmpBase, 'bars');
  fs.mkdirSync(path.join(barsDir, 'market-stats'), { recursive: true });
  const fixture = fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'market-stats-latest.sample.json'), 'utf-8');
  fs.writeFileSync(path.join(barsDir, 'market-stats', 'snapshot.json'), fixture, 'utf-8');

  const artifactsBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-score-artifacts-'));
  const result = runMarketScore({ BARS_ARTIFACTS_DIR: barsDir }, artifactsBase);
  assert(result.status === 0, `market-score provider failed: ${result.stderr || result.stdout}`);

  const validator = runValidator(path.join(artifactsBase, 'market-score'));
  assert(validator.status === 0, `validator failed: ${validator.stderr || validator.stdout}`);

  const snapshot = JSON.parse(
    fs.readFileSync(path.join(artifactsBase, 'market-score', 'snapshot.json'), 'utf-8')
  );
  const sample = Object.values(snapshot.data || {})[0];
  const codePattern = /^[A-Z0-9_]{3,80}$/;
  ['short', 'mid', 'long'].forEach((horizon) => {
    const list = sample?.reasons_top?.[horizon] || [];
    assert(list.length > 0, `${horizon} missing reasons`);
    list.forEach((entry) => {
      assert(entry.code && codePattern.test(entry.code), `code missing/invalid for ${horizon}`);
    });
  });

  console.log('✅ market-score artifact smoke validator');
}

main().catch((err) => {
  console.error('❌ market-score artifact smoke validator');
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
