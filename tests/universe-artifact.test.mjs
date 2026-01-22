#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function runProvider(env, artifactsBase) {
  const mergedEnv = { ...process.env, ...env, ARTIFACTS_DIR: artifactsBase };
  return spawnSync('node', ['scripts/providers/universe-v2.mjs'], {
    env: mergedEnv,
    encoding: 'utf-8'
  });
}

function runValidator(outDir) {
  const env = { ...process.env, RV_ARTIFACT_OUT_DIR: outDir };
  return spawnSync('node', ['scripts/validate/universe-artifact.v2.mjs'], {
    env,
    encoding: 'utf-8'
  });
}

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-universe-artifact-'));
  const artifacts = path.join(base, 'artifacts');
  const result = runProvider({ RV_UNIVERSE_STUB: '1' }, artifacts);
  assert(result.status === 0, `provider failed: ${result.stderr || result.stdout}`);

  const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'universe', 'snapshot.json'), 'utf-8'));
  assert(snapshot.metadata.module === 'universe', 'unexpected module');
  assert(snapshot.metadata.record_count >= 2600, 'record count below expectations');

  const validator = runValidator(path.join(artifacts, 'universe'));
  assert(validator.status === 0, `validator failed: ${validator.stderr || validator.stdout}`);

  console.log('✅ universe artifact smoke test');
})();
