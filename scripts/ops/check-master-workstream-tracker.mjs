#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const TRACKER_PATH = path.join(REPO_ROOT, 'docs/ops/master-workstream-tracker.json');
const VALID_STATUSES = new Set([
  'planned',
  'implemented',
  'local_tests_passed',
  'NAS_passed',
  'MAIN_smoke_passed',
  'green',
]);

function fail(message) {
  console.error(`[master-workstream-tracker] FAIL ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not parse ${path.relative(REPO_ROOT, filePath)}: ${error.message}`);
  }
}

const tracker = readJson(TRACKER_PATH);
if (tracker.schema !== 'rv.master_workstream_tracker.v1') {
  fail(`unexpected schema ${tracker.schema || 'missing'}`);
}
if (!Array.isArray(tracker.workstreams) || tracker.workstreams.length === 0) {
  fail('workstreams missing');
}

const seen = new Set();
const byStatus = Object.fromEntries([...VALID_STATUSES].map((status) => [status, 0]));
const incompleteGreen = [];

for (const item of tracker.workstreams) {
  if (!item || typeof item !== 'object') fail('invalid workstream row');
  if (!item.id || typeof item.id !== 'string') fail('workstream id missing');
  if (seen.has(item.id)) fail(`duplicate workstream id ${item.id}`);
  seen.add(item.id);
  if (!Number.isInteger(item.phase) || item.phase < 0 || item.phase > 6) {
    fail(`invalid phase for ${item.id}: ${item.phase}`);
  }
  if (!VALID_STATUSES.has(item.status)) fail(`invalid status for ${item.id}: ${item.status}`);
  byStatus[item.status] += 1;
  if (item.status === 'green') {
    for (const field of ['repo_sha', 'nas_run_id', 'main_smoke', 'pages_dev_smoke', 'artifact_proof']) {
      if (!item[field]) incompleteGreen.push(`${item.id}:${field}`);
    }
  }
}

if (incompleteGreen.length > 0) {
  fail(`green rows missing required evidence: ${incompleteGreen.join(', ')}`);
}

console.log(JSON.stringify({
  ok: true,
  schema: tracker.schema,
  total: tracker.workstreams.length,
  by_status: byStatus,
  green_total: byStatus.green,
  incomplete_total: tracker.workstreams.length - byStatus.green,
}, null, 2));
