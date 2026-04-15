import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('system status and recovery scripts enforce the hist-probs anchor stale guard', () => {
  const systemStatus = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-system-status-report.mjs'), 'utf8');
  const recovery = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), 'utf8');
  assert.match(systemStatus, /hist_probs_anchor_stale/);
  assert.match(systemStatus, /anchor_ticker:\s*'AAPL'/);
  assert.match(recovery, /AAPL\.json/);
});
