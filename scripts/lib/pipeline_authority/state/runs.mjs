import crypto from 'node:crypto';
import { openAuthorityDb, withImmediateTransaction } from './db.mjs';

function nowIso() {
  return new Date().toISOString();
}

export function createRun({ resourceScope = 'default', targetMarketDate = null, metadata = {} } = {}) {
  const { db } = openAuthorityDb();
  const runId = `run-${nowIso().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(8).toString('hex')}`;
  withImmediateTransaction(db, () => {
    db.prepare(`
      INSERT INTO runs (run_id, resource_scope, status, started_at, finished_at, target_market_date, metadata_json)
      VALUES (?, ?, 'RUNNING', ?, NULL, ?, ?)
    `).run(runId, resourceScope, nowIso(), targetMarketDate, JSON.stringify(metadata || {}));
    db.prepare('INSERT INTO events (run_id, event_type, payload_json, recorded_at) VALUES (?, ?, ?, ?)')
      .run(runId, 'run_started', JSON.stringify({ resource_scope: resourceScope, target_market_date: targetMarketDate, metadata }), nowIso());
  });
  return { run_id: runId, resource_scope: resourceScope, target_market_date: targetMarketDate };
}

export function finishRun(runId, { status = 'COMPLETED', metadata = {} } = {}) {
  const { db } = openAuthorityDb();
  withImmediateTransaction(db, () => {
    db.prepare('UPDATE runs SET status = ?, finished_at = ?, metadata_json = ? WHERE run_id = ?')
      .run(status, nowIso(), JSON.stringify(metadata || {}), runId);
    db.prepare('INSERT INTO events (run_id, event_type, payload_json, recorded_at) VALUES (?, ?, ?, ?)')
      .run(runId, 'run_finished', JSON.stringify({ status, metadata }), nowIso());
  });
  return { run_id: runId, status };
}
