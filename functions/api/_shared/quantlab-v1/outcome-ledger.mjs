/**
 * QuantLab V1 — Outcome Ledger
 * Append-only NDJSON storage for OutcomeLedgerRecords.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/outcome-ledger.ndjson');

function ensureDir() {
  const dir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Append an OutcomeLedgerRecord.
 * @param {Object} record - Must conform to outcome-ledger-record.schema.json
 */
export function appendOutcome(record) {
  if (!record.decision_id || !record.symbol) {
    throw new Error('Invalid OutcomeLedgerRecord: missing required fields');
  }
  ensureDir();
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Update an existing outcome record by decision_id.
 * Rewrites the full ledger (acceptable for daily batch).
 * @param {string} decisionId
 * @param {Object} patch - Fields to merge
 * @returns {boolean} true if found and updated
 */
export function updateOutcome(decisionId, patch) {
  if (!fs.existsSync(LEDGER_PATH)) return false;
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean);
  let found = false;
  const updated = lines.map(line => {
    try {
      const rec = JSON.parse(line);
      if (rec.decision_id === decisionId) {
        found = true;
        return JSON.stringify({ ...rec, ...patch, updated_at: new Date().toISOString() });
      }
      return line;
    } catch {
      return line;
    }
  });
  if (found) {
    ensureDir();
    fs.writeFileSync(LEDGER_PATH, updated.join('\n') + '\n', 'utf8');
  }
  return found;
}

/**
 * Read all outcome records, optionally filtered.
 * @param {Object} [filter]
 * @param {string} [filter.symbol]
 * @param {string} [filter.horizon]
 * @param {boolean} [filter.matured]
 * @param {string} [filter.since] - ISO date string
 * @returns {Object[]}
 */
export function readOutcomes(filter = {}) {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean);
  let records = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  if (filter.symbol) records = records.filter(r => r.symbol === filter.symbol);
  if (filter.horizon) records = records.filter(r => r.horizon === filter.horizon);
  if (filter.matured !== undefined) records = records.filter(r => r.matured === filter.matured);
  if (filter.since) records = records.filter(r => r.emitted_at >= filter.since);

  return records;
}

/**
 * Get the ledger file path.
 * @returns {string}
 */
export function getLedgerPath() {
  return LEDGER_PATH;
}
