/**
 * RUNBLOCK v3.0 — Layer 3: Audit & Feedback
 *
 * Active governance sensor, not passive storage.
 * Append-only decision logging with failure pattern detection.
 *
 * IMMUTABILITY CONTRACT:
 * - append-only only
 * - no update-overwrite
 * - realized_outcome appended as follow-up record, never by destructive overwrite
 */

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

// ── Allowed model types that MUST provide explainability ──
const EXPLAINABLE_MODEL_TYPES = ['random_forest', 'gradient_boosting', 'xgboost', 'lightgbm', 'decision_tree'];

/**
 * Create an immutable decision log entry.
 *
 * FIX #5: Explainability enforcement per Spec 4.1:
 * - Tree-based models MUST provide top_3_features + top_3_feature_weights
 * - Other models MUST provide explainability_unavailable_reason
 * - Silent omission (empty arrays without reason) is BLOCKED
 *
 * @param {Object} params - All required fields per audit-config.v3.json
 * @returns {Object} Complete log entry with log_id
 * @throws {Error} If explainability requirement is violated
 */
export function createDecisionLog({
  snapshot_id,
  ticker,
  feature_name,
  feature_version,
  model_version,
  model_type = null,
  calibration_version,
  regime_version,
  regime_tag,
  regime_confidence,
  data_quality_state,
  feature_hash,
  prediction_payload,
  fallback_used = false,
  fallback_reason = null,
  champion_id = null,
  challenger_id = null,
  reason_codes = [],
  top_3_features = [],
  top_3_feature_weights = [],
  explainability_unavailable_reason = null,
  cost_model_version = null,
  liquidity_bucket = null,
  tradability_flag = true,
  global_system_state = 'GREEN',
  git_commit_hash = null,
  dependency_trace = {},
}) {
  // ── FIX #5: Enforce explainability requirement ──
  const isExplainableType = model_type && EXPLAINABLE_MODEL_TYPES.includes(model_type.toLowerCase());
  const hasExplainability = top_3_features.length > 0 && top_3_feature_weights.length > 0;
  const hasUnavailableReason = explainability_unavailable_reason != null && explainability_unavailable_reason !== '';

  if (isExplainableType && !hasExplainability) {
    throw new Error(
      `EXPLAINABILITY_VIOLATION: Model type '${model_type}' is explainable but top_3_features/weights are empty. ` +
      `Spec 4.1 requires: "for tree-based or explainable models, record top_3_features and top_3_feature_weights".`
    );
  }

  if (!isExplainableType && !hasExplainability && !hasUnavailableReason) {
    throw new Error(
      `EXPLAINABILITY_VIOLATION: Model type '${model_type || 'unknown'}' provided no features AND no explainability_unavailable_reason. ` +
      `Spec 4.1 requires: "if unavailable due to model type, record explicit explainability_unavailable reason - do not silently omit".`
    );
  }

  return {
    log_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    snapshot_id,
    ticker,
    feature_name,
    feature_version,
    model_version,
    model_type,
    calibration_version,
    regime_version,
    regime_tag,
    regime_confidence,
    data_quality_state,
    feature_hash,
    prediction_payload,
    fallback_used,
    fallback_reason,
    champion_id,
    challenger_id,
    reason_codes,
    realized_outcome: null, // appended as follow-up record only
    structural_instability_flag: false,
    top_3_features,
    top_3_feature_weights,
    explainability_unavailable_reason,
    knowledge_time: new Date().toISOString(),
    valid_time: prediction_payload?.asof || new Date().toISOString(),
    cost_model_version,
    liquidity_bucket,
    tradability_flag,
    global_system_state,
    git_commit_hash,
    dependency_trace,
  };
}

/**
 * Create an immutable audit incident entry for pipeline-level violations.
 *
 * @param {Object} params
 * @returns {Object}
 */
export function createAuditIncident({
  ticker = null,
  layer,
  severity = 'RED',
  code,
  message,
  snapshot_id = null,
  details = {},
  dependency_trace = {},
  git_commit_hash = null,
}) {
  return {
    incident_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ticker,
    layer,
    severity,
    code,
    message,
    snapshot_id,
    details,
    dependency_trace,
    git_commit_hash,
  };
}

/**
 * Persist decision log entry (append-only, immutable).
 *
 * FIX #2: Immutability guard matching snapshot-freeze.mjs pattern.
 * Throws AUDIT_IMMUTABLE_VIOLATION if file already exists.
 * Spec 4.1: "append-only only - no update-overwrite"
 */
export async function persistDecisionLog(rootDir, entry, config = {}) {
  const logDir = path.join(rootDir, config.path || 'public/data/v3/audit/decisions');
  const dateDir = path.join(logDir, entry.timestamp.slice(0, 10));
  await fs.mkdir(dateDir, { recursive: true });

  const fileName = `${entry.ticker}_${entry.log_id}.json`;
  const filePath = path.join(dateDir, fileName);

  // ── FIX #2: Append-only immutability guard ──
  try {
    await fs.access(filePath);
    throw new Error(`AUDIT_IMMUTABLE_VIOLATION: Decision log ${filePath} already exists. Overwrite prohibited per Spec 4.1.`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  return filePath;
}

/**
 * Persist audit incident entry (append-only, immutable).
 *
 * @param {string} rootDir
 * @param {Object} entry
 * @param {Object} [config]
 */
export async function persistAuditIncident(rootDir, entry, config = {}) {
  const incidentDir = path.join(rootDir, config.incident_path || 'public/data/v3/audit/incidents');
  const dateDir = path.join(incidentDir, entry.timestamp.slice(0, 10));
  await fs.mkdir(dateDir, { recursive: true });

  const fileName = `${entry.severity}_${entry.code}_${entry.incident_id}.json`;
  const filePath = path.join(dateDir, fileName);

  try {
    await fs.access(filePath);
    throw new Error(`AUDIT_IMMUTABLE_VIOLATION: Incident ${filePath} already exists. Overwrite prohibited.`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  return filePath;
}

/**
 * Append a realized outcome to an existing decision log as a SEPARATE follow-up file.
 * Never overwrites the original entry. Spec 4.1: "realized_outcome appended as
 * follow-up record or patch-record, never by destructive overwrite."
 *
 * @param {string} rootDir
 * @param {string} originalLogId - The log_id of the original decision
 * @param {Object} outcome - { label, gross_return, net_return, horizon, exit_date }
 * @param {Object} [config]
 */
export async function appendRealizedOutcome(rootDir, originalLogId, outcome, config = {}) {
  const logDir = path.join(rootDir, config.path || 'public/data/v3/audit/decisions');
  const outcomeDir = path.join(logDir, 'outcomes');
  await fs.mkdir(outcomeDir, { recursive: true });

  const outcomeEntry = {
    outcome_id: crypto.randomUUID(),
    original_log_id: originalLogId,
    timestamp: new Date().toISOString(),
    realized_outcome: outcome,
  };

  const fileName = `outcome_${originalLogId}_${outcomeEntry.outcome_id}.json`;
  const filePath = path.join(outcomeDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(outcomeEntry, null, 2), 'utf-8');
  return filePath;
}

/**
 * Detect recurring failure patterns in decision logs.
 *
 * @param {Array} recentLogs - Recent decision log entries
 * @param {Object} [config] - From audit-config.v3.json
 * @returns {{ patterns_detected: string[], structural_instability: boolean }}
 */
export function detectFailurePatterns(recentLogs, config = {}) {
  const threshold = config.failure_pattern_detection?.threshold_consecutive || 3;
  const patterns = [];

  // Group by feature_name
  const byFeature = {};
  for (const log of recentLogs) {
    const key = log.feature_name || 'unknown';
    if (!byFeature[key]) byFeature[key] = [];
    byFeature[key].push(log);
  }

  for (const [feature, logs] of Object.entries(byFeature)) {
    // Repeated fallback dependency
    const consecutiveFallbacks = countConsecutive(logs, l => l.fallback_used);
    if (consecutiveFallbacks >= threshold) {
      patterns.push(`repeated_fallback_dependency:${feature}`);
    }

    // Repeated degraded data quality
    const consecutiveSuspect = countConsecutive(logs, l => l.data_quality_state === 'SUSPECT');
    if (consecutiveSuspect >= threshold) {
      patterns.push(`repeated_suspect_dependency:${feature}`);
    }
  }

  // Structural instability: champion transitions ACTIVE->DEGRADED/SUPPRESSED across 3+ regime shifts
  const regimeShifts = recentLogs.filter(l =>
    l.reason_codes?.includes('REGIME_SHIFT') || l.reason_codes?.includes('REGIME_BREAK')
  );
  const structuralInstability = regimeShifts.length >= threshold;

  return {
    patterns_detected: patterns,
    structural_instability: structuralInstability,
  };
}

function countConsecutive(logs, predicate) {
  let max = 0;
  let count = 0;
  for (const log of logs) {
    if (predicate(log)) {
      count++;
      max = Math.max(max, count);
    } else {
      count = 0;
    }
  }
  return max;
}
