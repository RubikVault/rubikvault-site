/**
 * Leaf-Seal utility — writes normalized step-completion seals to public/data/ops/.
 *
 * Each pipeline step should call writeLeafSeal() after it finishes so that
 * final-integrity-seal.mjs can verify required steps are OK/DEGRADED.
 *
 * File naming convention: <step_id>-latest.json
 * Schema: rv.leaf_seal.v1
 */

import fs from 'node:fs';
import path from 'node:path';
import { writeJsonDurableAtomicSync } from './durable-atomic-write.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OPS_DIR = path.join(ROOT, 'public/data/ops');

// Step IDs that have normalized leaf seals expected by the final integrity seal.
export const REQUIRED_LEAF_SEAL_STEP_IDS = [
  'market_data_refresh',
  'q1_delta_ingest',
  'quantlab_daily_report',
  'hist_probs',
  'forecast_daily',
  'scientific_summary',
  'snapshot',           // best-setups
  'decision_bundle',
];

/**
 * Returns the path for a given step_id leaf seal.
 * @param {string} stepId
 * @returns {string}
 */
export function leafSealPath(stepId) {
  return path.join(OPS_DIR, `${String(stepId).replace(/_/g, '-')}-latest.json`);
}

/**
 * Writes a normalized leaf seal for a pipeline step.
 *
 * @param {string} stepId           - Registry step ID (e.g. 'market_data_refresh')
 * @param {'OK'|'DEGRADED'|'FAILED'} status
 * @param {object} [options]
 * @param {string} [options.targetMarketDate]
 * @param {string} [options.runId]
 * @param {string[]} [options.outputsVerified]  - Output paths that were verified OK
 * @param {string[]} [options.blockingReasons]  - blocking_reason IDs
 * @param {string[]} [options.warnings]         - warning strings
 * @param {object}  [options.meta]              - arbitrary extra fields
 */
export function writeLeafSeal(stepId, status, {
  targetMarketDate = null,
  runId = null,
  outputsVerified = [],
  blockingReasons = [],
  warnings = [],
  meta = {},
} = {}) {
  const allowedStatuses = new Set(['OK', 'DEGRADED', 'FAILED']);
  const normalizedStatus = String(status || '').toUpperCase();
  if (!allowedStatuses.has(normalizedStatus)) {
    throw new Error(`LEAF_SEAL_INVALID_STATUS:${stepId}:${status}`);
  }
  const payload = {
    schema: 'rv.leaf_seal.v1',
    schema_version: '1.0',
    step_id: stepId,
    status: normalizedStatus,
    target_market_date: targetMarketDate || null,
    run_id: runId || null,
    generated_at: new Date().toISOString(),
    outputs_verified: outputsVerified,
    blocking_reasons: blockingReasons,
    warnings,
  };
  if (meta && typeof meta === 'object') {
    Object.assign(payload, meta);
  }
  writeJsonDurableAtomicSync(leafSealPath(stepId), payload);
  return payload;
}

/**
 * Reads a leaf seal from disk. Returns null if missing or unreadable.
 * @param {string} stepId
 * @returns {object|null}
 */
export function readLeafSeal(stepId) {
  try {
    return JSON.parse(fs.readFileSync(leafSealPath(stepId), 'utf8'));
  } catch {
    return null;
  }
}
