/**
 * QuantLab V1 — Regime Transition Guard
 * Detects regime shifts and applies conservative weight dampening.
 */

const PROB_DELTA_THRESHOLD = 0.25;
const INSTABILITY_MAX_PROB = 0.45;
const INSTABILITY_CONSECUTIVE_DAYS = 2;

/**
 * Detect whether a regime transition is active.
 * @param {Object} currentRegime - { market_regime, regime_probs: {bull,chop,bear,high_vol} }
 * @param {Object|null} previousRegime - Same shape, from previous day
 * @param {Object[]} regimeHistory - Array of regime objects (newest last), at least 2 entries
 * @returns {{ transition_active: boolean, reason: string|null, damping_factor: number }}
 */
export function detectTransition(currentRegime, previousRegime, regimeHistory = []) {
  const reasons = [];

  // Check 1: Dominant regime flip
  if (previousRegime && currentRegime.market_regime !== previousRegime.market_regime) {
    reasons.push(`regime_flip:${previousRegime.market_regime}->${currentRegime.market_regime}`);
  }

  // Check 2: Large regime probability delta
  if (previousRegime?.regime_probs && currentRegime.regime_probs) {
    for (const key of ['bull', 'chop', 'bear', 'high_vol']) {
      const delta = Math.abs(
        (currentRegime.regime_probs[key] || 0) - (previousRegime.regime_probs[key] || 0)
      );
      if (delta > PROB_DELTA_THRESHOLD) {
        reasons.push(`prob_delta:${key}=${delta.toFixed(3)}`);
      }
    }
  }

  // Check 3: Consecutive unstable days (max prob < threshold)
  if (regimeHistory.length >= INSTABILITY_CONSECUTIVE_DAYS) {
    const recentDays = regimeHistory.slice(-INSTABILITY_CONSECUTIVE_DAYS);
    const allUnstable = recentDays.every(day => {
      const probs = day.regime_probs || {};
      const maxProb = Math.max(probs.bull || 0, probs.chop || 0, probs.bear || 0, probs.high_vol || 0);
      return maxProb < INSTABILITY_MAX_PROB;
    });
    if (allUnstable) {
      reasons.push('consecutive_instability');
    }
  }

  const transitionActive = reasons.length > 0;

  // Damping factor: 0 = no damping, 1 = full equal weight
  // Scale by severity: more reasons = stronger damping
  const damping = transitionActive
    ? Math.min(0.7, 0.3 + reasons.length * 0.15)
    : 0;

  return {
    transition_active: transitionActive,
    reason: transitionActive ? reasons.join('; ') : null,
    damping_factor: damping,
  };
}

/**
 * Apply regime dampening to weights (pull toward equal weight).
 * @param {Object<string,number>} weights - Source-keyed weights
 * @param {number} dampingFactor - 0..1 (0=no change, 1=full equal weight)
 * @returns {Object<string,number>} Dampened weights (normalized to sum=1)
 */
export function applyRegimeDamping(weights, dampingFactor) {
  if (dampingFactor <= 0) return { ...weights };

  const sources = Object.keys(weights);
  const equalW = 1 / sources.length;
  const result = {};
  let total = 0;

  for (const s of sources) {
    const original = weights[s] || 0;
    result[s] = original * (1 - dampingFactor) + equalW * dampingFactor;
    total += result[s];
  }

  // Normalize
  if (total > 0) {
    for (const s of sources) result[s] /= total;
  }

  return result;
}
