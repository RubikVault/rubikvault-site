/**
 * V6.0 — Layer 7: Evidence Scoring
 *
 * Computes raw_evidence_score, freshness_multiplier, stability_score.
 * Depends on shrinkage output and regime fit.
 */

const FRESHNESS_DEFAULTS = Object.freeze({
  mean_reversion: { fresh_end: 3, aging_end: 8 },
  trend: { fresh_end: 10, aging_end: 30 },
  breakout: { fresh_end: 5, aging_end: 15 },
  momentum: { fresh_end: 7, aging_end: 20 },
  relative_strength: { fresh_end: 10, aging_end: 25 },
  volume: { fresh_end: 3, aging_end: 10 },
  volatility: { fresh_end: 5, aging_end: 15 },
});

const STALE_MAP = Object.freeze({
  short: 0.0,
  mid: 0.25,
  long: 0.60,
});

/**
 * Compute freshness multiplier based on event streak days.
 *
 * @param {number} eventStreakDays
 * @param {string} horizon - "short" | "mid" | "long"
 * @param {string} [clusterId] - Cluster for config lookup
 * @param {Object} [config] - Override { fresh_end, aging_end }
 * @returns {number} Freshness multiplier ∈ [0, 1]
 */
export function computeFreshnessMultiplier(eventStreakDays, horizon, clusterId = 'trend', config = null) {
  const clusterConfig = config || FRESHNESS_DEFAULTS[clusterId] || FRESHNESS_DEFAULTS.trend;
  const { fresh_end, aging_end } = clusterConfig;

  if (eventStreakDays <= fresh_end) return 1.0;

  if (eventStreakDays <= aging_end) {
    const progress = (eventStreakDays - fresh_end) / (aging_end - fresh_end);
    return Number((1.0 - 0.6 * progress).toFixed(4));
  }

  return STALE_MAP[horizon] ?? 0.25;
}

/**
 * Compute stability score from subperiod medians.
 *
 * stability_score = 0.7 * direction_consistency + 0.3 * (1 / (1 + effect_cv))
 *
 * @param {Array} subperiodMedians - Array of median returns per subperiod
 * @returns {{ stability_score: number, direction_consistency: number, effect_cv: number }}
 */
export function computeStabilityScore(subperiodMedians) {
  if (!subperiodMedians || subperiodMedians.length < 2) {
    return { stability_score: 0.5, direction_consistency: 0.5, effect_cv: 1 };
  }

  const fullMedian = subperiodMedians.reduce((s, v) => s + v, 0) / subperiodMedians.length;
  const fullSign = Math.sign(fullMedian);

  // Direction consistency: proportion of subperiods with same sign as full sample
  const consistent = subperiodMedians.filter(m => Math.sign(m) === fullSign).length;
  const directionConsistency = consistent / subperiodMedians.length;

  // Effect CV: coefficient of variation
  const absMeans = subperiodMedians.map(Math.abs);
  const meanAbs = absMeans.reduce((s, v) => s + v, 0) / absMeans.length;
  const stdAbs = Math.sqrt(
    subperiodMedians.reduce((s, v) => s + (v - fullMedian) ** 2, 0) / subperiodMedians.length
  );
  const effectCv = meanAbs > 1e-6 ? stdAbs / meanAbs : 10;

  const stabilityScore = Math.max(0, Math.min(1,
    0.7 * directionConsistency + 0.3 * (1 / (1 + effectCv))
  ));

  return {
    stability_score: Number(stabilityScore.toFixed(4)),
    direction_consistency: Number(directionConsistency.toFixed(4)),
    effect_cv: Number(effectCv.toFixed(4)),
  };
}

/**
 * Compute raw evidence score.
 *
 * raw_evidence_score = direction * (w_effect * effect + w_regime * regime + w_stability * stability)
 *                      * significance_multiplier * freshness_multiplier
 *
 * @param {Object} params
 * @returns {number} Raw evidence score ∈ [-1, 1]
 */
export function computeRawEvidenceScore({
  effectStrengthNorm,
  regimeFit,
  stabilityScore,
  significanceMultiplier = 1.0,
  freshnessMultiplier = 1.0,
  directionNumeric = 1,
  weights = { effect: 0.50, regime: 0.25, stability: 0.25 },
}) {
  const weighted =
    weights.effect * (effectStrengthNorm || 0) +
    weights.regime * (regimeFit || 0.5) +
    weights.stability * (stabilityScore || 0.5);

  const raw = directionNumeric * weighted * significanceMultiplier * freshnessMultiplier;
  return Number(Math.max(-1, Math.min(1, raw)).toFixed(6));
}

/**
 * Apply micro-uncertainty overlay for TS signals (V6 addition).
 * @param {number} freshnessMultiplier
 * @param {Object} params - { high_idiosyncratic_vol, imminent_event, market_stock_conflict, signal_type }
 * @returns {number} Adjusted freshness multiplier
 */
export function applyMicroUncertainty(freshnessMultiplier, params = {}) {
  if (params.signal_type !== 'ts') return freshnessMultiplier;

  let adjusted = freshnessMultiplier;

  if (params.high_idiosyncratic_vol) adjusted *= 0.85;
  if (params.market_stock_conflict) adjusted *= 0.90;

  return Number(Math.max(0, adjusted).toFixed(4));
}

/**
 * Guard against CS double-penalty.
 * If a CS signal already received cluster-level redundancy adjustment,
 * do NOT apply additional micro-uncertainty penalties.
 *
 * @param {number} evidenceScore - Current evidence score
 * @param {Object} params - { signal_type, clusterPenaltyApplied }
 * @returns {{ adjusted_score: number, guard_applied: boolean }}
 */
export function guardCsDoublePenalty(evidenceScore, params = {}) {
  if (params.signal_type !== 'cs') return { adjusted_score: evidenceScore, guard_applied: false };

  if (params.clusterPenaltyApplied) {
    return { adjusted_score: evidenceScore, guard_applied: true };
  }

  return { adjusted_score: evidenceScore, guard_applied: false };
}
