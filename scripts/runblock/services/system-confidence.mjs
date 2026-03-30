/**
 * V6.0 — Layer 11: System Control
 *
 * System confidence, failure detection, decision quality monitoring.
 * Extends existing global-state.mjs with continuous scoring.
 */

export const SYSTEM_STATE = Object.freeze({
  NORMAL: 'NORMAL',
  DEGRADED: 'DEGRADED',
  CALIBRATION_BROKEN: 'CALIBRATION_BROKEN',
  STRUCTURAL_SHIFT: 'STRUCTURAL_SHIFT',
});

/**
 * Compute system confidence score (0-1).
 * Not trade confidence — system trust level.
 *
 * @param {Object} params
 * @returns {number} System confidence ∈ [0, 1]
 */
export function computeSystemConfidence({
  calibrationHealth = 0.7,
  regimeStability = 0.7,
  recentHitRate = 0.55,
  stressScore = 0,
  monotonicityHealth = 1.0,
}) {
  const score =
    0.25 * calibrationHealth +
    0.20 * regimeStability +
    0.25 * recentHitRate +
    0.15 * (1 - stressScore) +
    0.15 * monotonicityHealth;

  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

/**
 * Detect system state based on health indicators.
 *
 * @param {Object} params
 * @returns {{ system_state: string, reasons: string[] }}
 */
export function detectSystemState({
  systemConfidence = 0.7,
  hitRate30d = 0.55,
  monotonicityBroken = false,
  clusterDivergence = 0,
  clusterDivergenceThreshold = 0.5,
}) {
  const reasons = [];

  if (monotonicityBroken) {
    reasons.push('CONFIDENCE_MONOTONICITY_BROKEN');
    return { system_state: SYSTEM_STATE.CALIBRATION_BROKEN, reasons };
  }

  if (clusterDivergence > clusterDivergenceThreshold) {
    reasons.push(`CLUSTER_DIVERGENCE_${clusterDivergence.toFixed(2)}`);
    return { system_state: SYSTEM_STATE.STRUCTURAL_SHIFT, reasons };
  }

  if (hitRate30d < 0.45) {
    reasons.push(`HIT_RATE_30D_${hitRate30d.toFixed(2)}`);
    return { system_state: SYSTEM_STATE.DEGRADED, reasons };
  }

  if (systemConfidence < 0.4) {
    reasons.push(`SYSTEM_CONFIDENCE_LOW_${systemConfidence.toFixed(2)}`);
    return { system_state: SYSTEM_STATE.DEGRADED, reasons };
  }

  return { system_state: SYSTEM_STATE.NORMAL, reasons: [] };
}

/**
 * Apply global caps based on system state.
 *
 * @param {string} systemState
 * @param {number} systemConfidence
 * @param {string} currentBucket - Decision bucket
 * @returns {{ capped_bucket: string, cap_applied: boolean, cap_reason: string|null }}
 */
export function applyGlobalCaps(systemState, systemConfidence, currentBucket) {
  if (systemState === SYSTEM_STATE.CALIBRATION_BROKEN || systemState === SYSTEM_STATE.STRUCTURAL_SHIFT) {
    if (currentBucket === 'HIGH_CONVICTION' || currentBucket === 'MODERATE') {
      return { capped_bucket: 'WEAK', cap_applied: true, cap_reason: `SYSTEM_STATE_${systemState}` };
    }
  }

  if (systemConfidence < 0.6) {
    if (currentBucket === 'HIGH_CONVICTION' || currentBucket === 'MODERATE') {
      return { capped_bucket: 'WEAK', cap_applied: true, cap_reason: `SYSTEM_CONFIDENCE_BELOW_0.6` };
    }
  }

  return { capped_bucket: currentBucket, cap_applied: false, cap_reason: null };
}

/**
 * Compute decision quality metrics from history.
 *
 * @param {Array} history - [{ bucket, outcome_positive }]
 * @returns {Object} Quality metrics with monotonicity check
 */
export function computeDecisionQualityMetrics(history) {
  const bucketOrder = ['HIGH_CONVICTION', 'MODERATE', 'WEAK'];
  const hitRates = {};

  for (const bucket of bucketOrder) {
    const entries = history.filter(h => h.bucket === bucket && h.outcome_positive != null);
    const total = entries.length;
    const hits = entries.filter(h => h.outcome_positive).length;
    hitRates[bucket] = total >= 10 ? hits / total : null;
  }

  const monotonicityValid =
    (hitRates.HIGH_CONVICTION == null || hitRates.MODERATE == null || hitRates.HIGH_CONVICTION >= hitRates.MODERATE) &&
    (hitRates.MODERATE == null || hitRates.WEAK == null || hitRates.MODERATE >= hitRates.WEAK);

  return {
    hit_rate_by_bucket: hitRates,
    monotonicity_valid: monotonicityValid,
    targets: { HIGH_CONVICTION: 0.60, MODERATE: 0.55, WEAK: 0.50 },
  };
}
