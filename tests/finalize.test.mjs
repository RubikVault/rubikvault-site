#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const MODULES = ['universe', 'market-prices', 'market-stats', 'market-score'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion_failed');
  }
}

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-finalizer-test-'));
  const artifacts = path.join(base, 'artifacts');
  const registryDir = path.join(base, 'public', 'data', 'registry');
  fs.mkdirSync(registryDir, { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), 'public', 'data', 'registry', 'modules.json'),
    path.join(registryDir, 'modules.json')
  );

  const result = spawnSync(process.execPath, [path.resolve('scripts/aggregator/finalize.mjs')], {
    cwd: base,
    env: { ...process.env, ARTIFACTS_DIR: artifacts },
    encoding: 'utf-8'
  });

  assert(result.status === 0, `finalize failed: ${result.stderr || result.stdout}`);

  for (const moduleName of MODULES) {
    const snapshotPath = path.join(base, 'public', 'data', 'snapshots', moduleName, 'latest.json');
    assert(fs.existsSync(snapshotPath), `missing snapshot ${moduleName}`);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    assert(snapshot.schema_version === '3.0', `${moduleName} schema_version`);
    assert(snapshot.module === moduleName, `${moduleName} module mismatch`);
    assert(snapshot.metadata?.validation?.passed === false, `${moduleName} validation should fail`);
    assert(snapshot.error, `${moduleName} error payload missing`);
    assert(snapshot.error.code === 'SNAPSHOT_MISSING', `${moduleName} error.code`);
    assert(snapshot.data === null, `${moduleName} data should be null`);
  }

  console.log('✅ finalize placeholder smoke test');
})();
