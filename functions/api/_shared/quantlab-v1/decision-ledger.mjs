/**
 * QuantLab V1 — Decision Ledger
 * Append-only NDJSON storage for DecisionRecords.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildAuditChain } from './snapshot-integrity.mjs';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/decision-ledger.ndjson');

function ensureDir() {
  const dir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Get the decision_record_hash of the last entry in the ledger (for chain linkage).
 * @returns {string|null}
 */
export function getLastDecisionHash() {
  if (!fs.existsSync(LEDGER_PATH)) return null;
  const content = fs.readFileSync(LEDGER_PATH, 'utf8').trimEnd();
  if (!content) return null;
  const lastLine = content.split('\n').pop();
  try {
    const rec = JSON.parse(lastLine);
    return rec.decision_record_hash || null;
  } catch { return null; }
}

/**
 * Append a DecisionRecord to the ledger.
 * If integrity hash fields are missing and auditContext is provided, computes them.
 * @param {Object} record - Must conform to decision-record.schema.json
 * @param {Object} [auditContext] - { contracts, weights, policy, fusionResult }
 */
export function appendDecision(record, auditContext) {
  if (!record.decision_id || !record.symbol || !record.verdict) {
    throw new Error('Invalid DecisionRecord: missing required fields');
  }
  if (!record.decision_record_hash && auditContext) {
    const previousHash = getLastDecisionHash();
    const chainHashes = buildAuditChain({
      contracts: auditContext.contracts || [],
      weights: auditContext.weights || {},
      policy: auditContext.policy || {},
      fusionResult: auditContext.fusionResult || null,
      decisionRecord: record,
      previousHash,
    });
    Object.assign(record, chainHashes);
  }
  ensureDir();
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Read all decisions, optionally filtered.
 * @param {Object} [filter]
 * @param {string} [filter.symbol]
 * @param {string} [filter.horizon]
 * @param {string} [filter.verdict]
 * @param {string} [filter.since] - ISO date string
 * @returns {Object[]}
 */
export function readDecisions(filter = {}) {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean);
  let records = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  if (filter.symbol) records = records.filter(r => r.symbol === filter.symbol);
  if (filter.horizon) records = records.filter(r => r.horizon === filter.horizon);
  if (filter.verdict) records = records.filter(r => r.verdict === filter.verdict);
  if (filter.since) records = records.filter(r => r.created_at >= filter.since);

  return records;
}

/**
 * Get the ledger file path (for external tooling).
 * @returns {string}
 */
export function getLedgerPath() {
  return LEDGER_PATH;
}
