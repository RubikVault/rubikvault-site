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
  
  // Regression: fail-loud by default when an invalid artifact exists; opt-in skip keeps run green.
  const base2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-finalizer-skip-invalid-test-'));
  const artifacts2 = path.join(base2, 'artifacts');
  const registryDir2 = path.join(base2, 'public', 'data', 'registry');
  fs.mkdirSync(registryDir2, { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), 'public', 'data', 'registry', 'modules.json'),
    path.join(registryDir2, 'modules.json')
  );

  // Create a deliberately invalid artifact (loaded by finalizer, then rejected by validation).
  // We force a digest mismatch so validateSnapshot fails.
  const badModule = 'market-health';
  const badDir = path.join(artifacts2, badModule);
  fs.mkdirSync(badDir, { recursive: true });
  const badSnapshot = {
    schema_version: '3.0',
    metadata: {
      module: badModule,
      tier: 'standard',
      domain: 'stocks',
      source: 'test',
      fetched_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      record_count: 1,
      validation: {
        passed: true,
        dropped_records: 0,
        drop_ratio: 0,
        drop_check_passed: true,
        drop_threshold: null,
        checks: [],
        warnings: []
      }
    },
    data: [{ ok: true }],
    error: null
  };
  fs.writeFileSync(path.join(badDir, 'snapshot.json'), JSON.stringify(badSnapshot, null, 2) + '\n', 'utf-8');
  const badState = {
    schema_version: '3.0',
    module: badModule,
    digest: badSnapshot.metadata.digest,
    record_count: 1,
    published_at: new Date().toISOString(),
    validation: { passed: true, errors: [], warnings: [] }
  };
  fs.writeFileSync(path.join(badDir, 'module-state.json'), JSON.stringify(badState, null, 2) + '\n', 'utf-8');

  const failLoud = spawnSync(process.execPath, [path.resolve('scripts/aggregator/finalize.mjs')], {
    cwd: base2,
    env: { ...process.env, ARTIFACTS_DIR: artifacts2 },
    encoding: 'utf-8'
  });
  assert(failLoud.status !== 0, 'expected finalize to fail loud when invalid artifact exists');

  const skipped = spawnSync(process.execPath, [path.resolve('scripts/aggregator/finalize.mjs')], {
    cwd: base2,
    env: { ...process.env, ARTIFACTS_DIR: artifacts2, RV_FINALIZER_SKIP_INVALID: '1' },
    encoding: 'utf-8'
  });
  assert(skipped.status === 0, `expected finalize to succeed with RV_FINALIZER_SKIP_INVALID=1: ${skipped.stderr || skipped.stdout}`);
  for (const moduleName of MODULES) {
    const snapshotPath = path.join(base2, 'public', 'data', 'snapshots', moduleName, 'latest.json');
    assert(fs.existsSync(snapshotPath), `missing snapshot ${moduleName} after skip-invalid run`);
  }
  console.log('✅ finalize skip-invalid regression test');
})();
