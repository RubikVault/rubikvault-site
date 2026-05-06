import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('master workstream tracker is valid and covers all phases', () => {
  const trackerPath = path.join(ROOT, 'docs/ops/master-workstream-tracker.json');
  const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  assert.equal(tracker.schema, 'rv.master_workstream_tracker.v1');
  const phases = new Set(tracker.workstreams.map((item) => item.phase));
  for (const phase of [0, 1, 2, 3, 4, 5, 6]) assert.equal(phases.has(phase), true);

  const result = spawnSync(process.execPath, ['scripts/ops/check-master-workstream-tracker.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.total, tracker.workstreams.length);
});
