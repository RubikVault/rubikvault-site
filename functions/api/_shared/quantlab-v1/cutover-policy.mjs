/**
 * QuantLab V1 — Cutover Policy
 * Controls the transition from legacy decision engine to V1 fusion engine.
 */

export const DECISION_MODES = Object.freeze({
  LEGACY_ONLY: 'legacy_only',
  SHADOW_V1: 'shadow_v1',
  V1_PRIMARY_WITH_LEGACY_AUDIT: 'v1_primary_with_legacy_audit',
});

export const READINESS_CRITERIA = Object.freeze({
  min_shadow_days: 14,
  min_matured_outcomes: 30,
  max_fallback_rate: 0.4,
  max_governance_violations: 5,
  max_fp_regression: 0.05,
  min_verdict_agreement_rate: 0.7,
});

/**
 * Get the currently active decision mode from environment.
 * @returns {string} One of DECISION_MODES values
 */
export function getActiveMode() {
  const env = typeof process !== 'undefined' && process.env
    ? process.env.QUANTLAB_V1_MODE
    : undefined;
  if (env && Object.values(DECISION_MODES).includes(env)) return env;
  return DECISION_MODES.SHADOW_V1;
}

/**
 * Check if V1 engine should run (shadow or primary).
 * @returns {boolean}
 */
export function isV1Active() {
  const mode = getActiveMode();
  return mode === DECISION_MODES.SHADOW_V1 || mode === DECISION_MODES.V1_PRIMARY_WITH_LEGACY_AUDIT;
}

/**
 * Check if V1 is the primary decision source.
 * @returns {boolean}
 */
export function isV1Primary() {
  return getActiveMode() === DECISION_MODES.V1_PRIMARY_WITH_LEGACY_AUDIT;
}

/**
 * Evaluate readiness criteria against actual metrics.
 * @param {Object} metrics
 * @param {number} metrics.shadow_days
 * @param {number} metrics.matured_outcomes
 * @param {number} metrics.fallback_rate
 * @param {number} metrics.governance_violations
 * @param {number} metrics.fp_regression - V1 FP rate minus legacy FP rate
 * @param {number} metrics.verdict_agreement_rate
 * @returns {{ cutover_recommended: boolean, criteria_met: Object, criteria_failed: Object }}
 */
export function evaluateReadiness(metrics) {
  const criteria = READINESS_CRITERIA;
  const met = {};
  const failed = {};

  const checks = [
    ['min_shadow_days', metrics.shadow_days >= criteria.min_shadow_days],
    ['min_matured_outcomes', metrics.matured_outcomes >= criteria.min_matured_outcomes],
    ['max_fallback_rate', metrics.fallback_rate <= criteria.max_fallback_rate],
    ['max_governance_violations', metrics.governance_violations <= criteria.max_governance_violations],
    ['max_fp_regression', metrics.fp_regression <= criteria.max_fp_regression],
    ['min_verdict_agreement_rate', metrics.verdict_agreement_rate >= criteria.min_verdict_agreement_rate],
  ];

  for (const [key, passed] of checks) {
    if (passed) {
      met[key] = { threshold: criteria[key], actual: metrics[key.replace('min_', '').replace('max_', '')] || metrics[key] };
    } else {
      failed[key] = { threshold: criteria[key], actual: metrics[key.replace('min_', '').replace('max_', '')] || metrics[key] };
    }
  }

  return {
    cutover_recommended: Object.keys(failed).length === 0,
    criteria_met: met,
    criteria_failed: failed,
  };
}
