#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert_failed');
}

const runId = `test_offline_${Date.now()}`;
const proc = spawnSync('node', ['scripts/universe-v7/pipeline-v7.mjs', '--run-id', runId, '--offline'], {
  encoding: 'utf8',
  env: { ...process.env, NETWORK_ALLOWED: 'true' }
});

if (proc.status !== 0) {
  throw new Error(`pipeline offline failed: ${proc.stderr || proc.stdout}`);
}

const outLines = `${proc.stdout || ''}`.trim().split(/\n+/).filter(Boolean);
const payload = JSON.parse(outLines[outLines.length - 1]);
assert(payload.code === 0 || payload.code === 30, 'unexpected exit code payload');

const runDir = `tmp/v7-build/${runId}`;
assert(fs.existsSync(`${runDir}/reports/run_status.json`), 'missing run_status.json');
assert(fs.existsSync(`${runDir}/publish_payload/registry/registry.snapshot.json.gz`), 'missing registry snapshot payload');

console.log('✅ v7 pipeline offline test passed');
