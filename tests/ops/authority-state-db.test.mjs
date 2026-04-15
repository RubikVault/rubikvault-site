import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('authority state db initializes and persists runs', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-authority-'));
  process.env.RV_RUNTIME_DIR = runtimeDir;
  const { openAuthorityDb } = await import('../../scripts/lib/pipeline_authority/state/db.mjs');
  const { createRun, finishRun } = await import('../../scripts/lib/pipeline_authority/state/runs.mjs');
  const { db, config } = openAuthorityDb({ migrate: true });
  assert.equal(fs.existsSync(config.stateDbPath), true);
  db.close();

  const created = createRun({ resourceScope: 'test_scope', targetMarketDate: '2026-04-12' });
  assert.match(created.run_id, /^run-/);
  finishRun(created.run_id, { status: 'COMPLETED' });

  const reopened = openAuthorityDb();
  const row = reopened.db.prepare('SELECT run_id, status, target_market_date FROM runs WHERE run_id = ?').get(created.run_id);
  assert.equal(row.run_id, created.run_id);
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.target_market_date, '2026-04-12');
  reopened.db.close();
});
