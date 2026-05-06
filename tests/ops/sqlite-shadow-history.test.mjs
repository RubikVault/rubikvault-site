import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('SQLite history shadow builds raw and adjusted tables without changing primary runtime', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-sqlite-shadow-test-'));
  const output = path.join(tmp, 'history.sqlite');
  const report = path.join(tmp, 'report.json');
  const result = spawnSync('python3', [
    'scripts/ops/build-sqlite-shadow-history.py',
    '--max-symbols=2',
    `--output=${output}`,
    `--report=${report}`,
    '--target-market-date=2026-05-05',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(payload.schema, 'rv.sqlite_shadow_history_report.v1');
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'shadow_only');
  assert.equal(payload.cutover_allowed, false);
  assert.equal(payload.primary_runtime_changed, false);
  assert.ok(payload.raw_rows > 0);
  assert.equal(payload.raw_rows, payload.adjusted_rows);
});
