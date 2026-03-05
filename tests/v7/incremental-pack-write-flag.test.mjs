#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert_failed');
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

const runId = `test_incremental_pack_${Date.now()}`;
const proc = spawnSync(
  'node',
  ['scripts/universe-v7/pipeline-v7.mjs', '--run-id', runId, '--offline'],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      NETWORK_ALLOWED: 'true',
      RV_V7_INCREMENTAL_PACK_WRITE: 'true',
      RV_V7_INCREMENTAL_PACK_BUFFER_SYMBOLS: '4000'
    }
  }
);

if (proc.status !== 0) {
  throw new Error(`pipeline offline failed (incremental mode): ${proc.stderr || proc.stdout}`);
}

const runDir = `tmp/v7-build/${runId}`;
const budgetReportPath = `${runDir}/reports/budget_report.json`;
const runStatusPath = `${runDir}/reports/run_status.json`;
assert(fs.existsSync(budgetReportPath), 'missing budget_report.json');
assert(fs.existsSync(runStatusPath), 'missing run_status.json');

const budget = readJson(budgetReportPath);
assert(budget.backfill_pack_write_mode === 'incremental', 'backfill_pack_write_mode != incremental');
assert(Number.isFinite(Number(budget.backfill_incremental_pack_buffer_cap)), 'missing incremental buffer cap');

const status = readJson(runStatusPath);
const mode = status?.phases?.backfill?.pack_write_mode;
assert(mode === 'incremental', 'run_status backfill.pack_write_mode != incremental');

console.log('✅ v7 incremental pack-write flag test passed');

