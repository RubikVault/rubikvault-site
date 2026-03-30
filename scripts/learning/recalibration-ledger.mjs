/**
 * V6.0 — Layer 8C: Recalibration Ledger
 *
 * Tracks all recalibration events to prevent circular calibration inflation.
 * Append-only, versioned, auditable.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'mirrors/learning/recalibration-ledger.ndjson');

/**
 * Create a recalibration ledger entry.
 * @param {Object} params
 * @returns {Object} Ledger entry
 */
export function createRecalibrationEntry({
  trigger,
  triggerValue,
  scope,
  preCalibrationSnapshot,
  postCalibrationSnapshot,
  approvedBy = 'auto',
  versionDelta,
}) {
  return {
    recalibration_id: randomUUID(),
    timestamp: new Date().toISOString(),
    trigger,
    trigger_value: triggerValue,
    scope,
    pre_calibration_snapshot: preCalibrationSnapshot,
    post_calibration_snapshot: postCalibrationSnapshot,
    approved_by: approvedBy,
    version_delta: versionDelta,
  };
}

/**
 * Validate recalibration: Brier must improve, monotonicity must hold.
 * @param {Object} preSnapshot - { brier_score, monotonicity_valid }
 * @param {Object} postSnapshot - { brier_score, monotonicity_valid }
 * @returns {{ approved: boolean, violations: string[] }}
 */
export function validateRecalibration(preSnapshot, postSnapshot) {
  const violations = [];

  if (postSnapshot.brier_score >= preSnapshot.brier_score) {
    violations.push('BRIER_NOT_IMPROVED');
  }

  if (!postSnapshot.monotonicity_valid) {
    violations.push('MONOTONICITY_BROKEN');
  }

  return { approved: violations.length === 0, violations };
}

/**
 * Load recalibration ledger from disk.
 * @param {string} [ledgerPath]
 * @returns {Promise<Array>}
 */
export async function loadRecalibrationLedger(ledgerPath = LEDGER_PATH) {
  try {
    const content = await fs.readFile(ledgerPath, 'utf-8');
    return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Append entry to recalibration ledger.
 * @param {Object} entry
 * @param {string} [ledgerPath]
 */
export async function appendRecalibrationEntry(entry, ledgerPath = LEDGER_PATH) {
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.appendFile(ledgerPath, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Check for recalibration circularity.
 * Flags if the same scope was recalibrated more than N times in a window.
 *
 * @param {Array} ledger
 * @param {string} scope
 * @param {number} [windowDays=30]
 * @param {number} [maxRecalibrations=3]
 * @returns {{ circular_risk: boolean, count_in_window: number }}
 */
export function checkCircularity(ledger, scope, windowDays = 30, maxRecalibrations = 3) {
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const recent = ledger.filter(e => e.scope === scope && e.timestamp >= cutoff);

  return {
    circular_risk: recent.length >= maxRecalibrations,
    count_in_window: recent.length,
  };
}

/**
 * Rollback a recalibration by ID.
 * Marks the entry as rolled_back and returns the pre-calibration snapshot.
 *
 * @param {Array} ledger - Full recalibration ledger
 * @param {string} recalibrationId - ID of the recalibration to rollback
 * @returns {{ rolled_back: boolean, restored_snapshot: Object|null, rollback_entry: Object|null }}
 */
export function rollbackRecalibration(ledger, recalibrationId) {
  const entry = ledger.find(e => e.recalibration_id === recalibrationId);
  if (!entry) return { rolled_back: false, restored_snapshot: null, rollback_entry: null };

  const rollbackEntry = {
    recalibration_id: randomUUID(),
    timestamp: new Date().toISOString(),
    trigger: 'ROLLBACK',
    trigger_value: recalibrationId,
    scope: entry.scope,
    pre_calibration_snapshot: entry.post_calibration_snapshot,
    post_calibration_snapshot: entry.pre_calibration_snapshot,
    approved_by: 'auto_rollback',
    version_delta: `rollback_of_${recalibrationId.slice(0, 8)}`,
  };

  return {
    rolled_back: true,
    restored_snapshot: entry.pre_calibration_snapshot,
    rollback_entry: rollbackEntry,
  };
}

/**
 * Determine if a recalibration should be automatically rolled back.
 *
 * @param {Object} preSnapshot - { brier_score, monotonicity_violations }
 * @param {Object} postSnapshot - { brier_score, monotonicity_violations }
 * @param {Object} [thresholds] - { max_brier_degradation: 0.05, max_monotonicity_violations: 2 }
 * @returns {{ should_rollback: boolean, trigger_reason: string|null }}
 */
export function shouldAutoRollback(preSnapshot, postSnapshot, thresholds = {}) {
  const maxBrierDegradation = thresholds.max_brier_degradation ?? 0.05;
  const maxMonotonicityViolations = thresholds.max_monotonicity_violations ?? 2;

  if (postSnapshot.brier_score > (preSnapshot.brier_score || 0) + maxBrierDegradation) {
    return { should_rollback: true, trigger_reason: 'BRIER_DEGRADATION_EXCEEDED' };
  }

  if ((postSnapshot.monotonicity_violations || 0) > maxMonotonicityViolations) {
    return { should_rollback: true, trigger_reason: 'MONOTONICITY_VIOLATIONS_EXCEEDED' };
  }

  return { should_rollback: false, trigger_reason: null };
}
