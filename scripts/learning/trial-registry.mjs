/**
 * V6.0 — Layer 8A: Trial Registry
 *
 * Append-only trial tracking for overfitting protection.
 * Tracks code_hash, parameter_config_hash, lifecycle, and OOS metrics.
 */
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compareObjectives } from './objective-function.mjs';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'mirrors/learning/trial-registry.ndjson');

export const TRIAL_STATUS = Object.freeze({
  SANDBOX: 'sandbox',
  PRODUCTION_PROMOTED: 'production_promoted',
  DEPRECATED: 'deprecated',
});

/**
 * Create a new trial entry.
 * @param {Object} params
 * @returns {Object} Trial record
 */
export function createTrial({
  codeHash,
  paramConfigHash,
  dataSnapshotId,
  selectionFoldId,
  evaluationFoldId = null,
  author = 'system',
  researchOnly = false,
}) {
  return {
    trial_id: randomUUID(),
    status: TRIAL_STATUS.SANDBOX,
    code_hash: codeHash,
    parameter_config_hash: paramConfigHash,
    data_snapshot_id: dataSnapshotId,
    selection_fold_id: selectionFoldId,
    evaluation_fold_id: evaluationFoldId,
    oos_touched: false,
    research_only: researchOnly,
    alpha_cost: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    author,
    metrics: {},
  };
}

/**
 * Promote a trial to production after passing all gates.
 * @param {Object} trial
 * @param {Object} oosMetrics - { oos_months, oos_sharpe, hit_rate, dsr, objective_score }
 * @param {Object} [options] - { championObjective, benchmarkGate }
 * @returns {{ promoted: boolean, trial: Object, gate_failures: string[], objective_comparison: Object|null }}
 */
export function promoteTrial(trial, oosMetrics, { championObjective = null, benchmarkGate = null } = {}) {
  const failures = [];

  if ((oosMetrics.oos_months || 0) < 6) failures.push('OOS_MONTHS_BELOW_6');
  if ((oosMetrics.oos_sharpe || 0) <= 0.5) failures.push('OOS_SHARPE_BELOW_0.5');
  if ((oosMetrics.hit_rate || 0) <= 0.55) failures.push('HIT_RATE_BELOW_0.55');

  // F4: Objective function comparison gate
  let objectiveComparison = null;
  if (championObjective != null && oosMetrics.objective_score != null) {
    objectiveComparison = compareObjectives(
      { objective_score: oosMetrics.objective_score },
      championObjective
    );
    if (!objectiveComparison.promote) {
      failures.push('OBJECTIVE_BELOW_CHAMPION');
    }
  }

  // F6: Benchmark gate
  if (benchmarkGate != null && !benchmarkGate.gate_passed) {
    for (const f of benchmarkGate.failures) {
      failures.push(f);
    }
  }

  if (failures.length > 0) {
    return { promoted: false, trial, gate_failures: failures, objective_comparison: objectiveComparison };
  }

  return {
    promoted: true,
    trial: {
      ...trial,
      status: TRIAL_STATUS.PRODUCTION_PROMOTED,
      oos_touched: true,
      updated_at: new Date().toISOString(),
      metrics: { ...trial.metrics, ...oosMetrics },
    },
    gate_failures: [],
    objective_comparison: objectiveComparison,
  };
}

/**
 * Deprecate a trial.
 * @param {Object} trial
 * @param {string} reason
 * @returns {Object} Deprecated trial
 */
export function deprecateTrial(trial, reason) {
  return {
    ...trial,
    status: TRIAL_STATUS.DEPRECATED,
    updated_at: new Date().toISOString(),
    deprecated_reason: reason,
  };
}

/**
 * Load trial registry from disk.
 * @param {string} [registryPath]
 * @returns {Promise<Array>}
 */
export async function loadTrialRegistry(registryPath = REGISTRY_PATH) {
  try {
    const content = await fs.readFile(registryPath, 'utf-8');
    return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Append trial to registry (append-only).
 * @param {Object} trial
 * @param {string} [registryPath]
 */
export async function appendTrial(trial, registryPath = REGISTRY_PATH) {
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.appendFile(registryPath, JSON.stringify(trial) + '\n', 'utf-8');
}

/**
 * Compute content hash for code deduplication.
 * @param {string} content
 * @returns {string} SHA-256 hash
 */
export function computeCodeHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Count unique production trials (for DSR N_trials).
 * @param {Array} registry
 * @returns {number}
 */
export function countProductionTrials(registry) {
  const seen = new Set();
  for (const trial of registry) {
    if (trial.research_only || !trial.oos_touched) continue;
    const key = `${trial.code_hash}|${trial.parameter_config_hash}|${trial.data_snapshot_id}|${trial.selection_fold_id}|${trial.evaluation_fold_id}`;
    seen.add(key);
  }
  return seen.size;
}
