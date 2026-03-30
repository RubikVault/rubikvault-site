/**
 * V6.0 — Layer 9: Confidence & Ensemble
 *
 * Aggregated data confidence, market predictability, cross-horizon consistency,
 * ensemble bias, and summary state.
 */

export const SUMMARY_STATE = Object.freeze({
  STRONG_BULLISH_CONSENSUS: 'strong_bullish_consensus',
  CONSISTENT_BULLISH: 'consistent_bullish',
  MIXED_BULLISH_SIGNALS: 'mixed_bullish_signals',
  NEUTRAL_CONSENSUS: 'neutral_consensus',
  STRONG_BEARISH_CONSENSUS: 'strong_bearish_consensus',
  MIXED_SIGNALS_CAUTION: 'mixed_signals_caution',
});

/**
 * Aggregate data confidence across evidence records.
 * Weighted mean by effective sample size.
 *
 * @param {Array} evidenceRecords - [{ data_confidence, effective_sample_size }]
 * @returns {number} Aggregated data confidence ∈ [0, 1]
 */
export function computeDataConfidenceAgg(evidenceRecords) {
  if (!evidenceRecords?.length) return 0.5;

  let sumWeighted = 0;
  let sumWeights = 0;

  for (const r of evidenceRecords) {
    const w = r.effective_sample_size ?? 1;
    const c = r.data_confidence ?? 0.5;
    sumWeighted += w * c;
    sumWeights += w;
  }

  return sumWeights > 0 ? Number((sumWeighted / sumWeights).toFixed(4)) : 0.5;
}

/**
 * Compute market predictability score.
 * Lookup-based with regime/stress dampening.
 *
 * @param {Object} regimeResult - { regime_tag, regime_confidence }
 * @param {Object} stressResult - { stress_score, crash_state, transition_state }
 * @returns {number} Market predictability ∈ [0, 1]
 */
export function computeMarketPredictability(regimeResult = {}, stressResult = {}) {
  const baseLookup = {
    NORMAL: 0.75,
    RANGE: 0.65,
    STRESS: 0.45,
    REGIME_SHIFT: 0.30,
  };

  let mp = baseLookup[regimeResult.regime_tag || regimeResult.regime] || 0.60;

  mp *= Math.max(0.5, regimeResult.regime_confidence ?? 0.7);

  if (stressResult.transition_state === 'unstable') mp *= 0.70;

  const stressScore = stressResult.stress_score ?? 0;
  if (stressResult.crash_state === 'warning' || stressResult.crash_state === 'critical') {
    mp *= (1 - 0.6 * stressScore);
  }

  return Number(Math.max(0, Math.min(1, mp)).toFixed(4));
}

/**
 * Compute raw confidence.
 *
 * raw_confidence = data_conf^0.45 * market_pred^0.30 * cluster_agreement^0.15 * stability^0.10
 *
 * @param {number} dataConfidenceAgg
 * @param {number} marketPredictability
 * @param {number} clusterAgreementScore
 * @param {number} stabilityAgg
 * @returns {number} Raw confidence ∈ [0, 1]
 */
export function computeRawConfidence(dataConfidenceAgg, marketPredictability, clusterAgreementScore, stabilityAgg) {
  return Number((
    Math.pow(Math.max(0.01, dataConfidenceAgg), 0.45) *
    Math.pow(Math.max(0.01, marketPredictability), 0.30) *
    Math.pow(Math.max(0.01, clusterAgreementScore), 0.15) *
    Math.pow(Math.max(0.01, stabilityAgg), 0.10)
  ).toFixed(4));
}

/**
 * Compute cross-horizon consistency score.
 *
 * @param {Object} horizonSlices - { short: { bias_score }, medium: { bias_score }, long: { bias_score } }
 * @returns {{ cross_horizon_consistency_score: number, inconsistencies: string[] }}
 */
export function computeCrossHorizonConsistency(horizonSlices) {
  const biases = [];
  const inconsistencies = [];

  for (const [key, slice] of Object.entries(horizonSlices || {})) {
    if (slice?.bias_score != null) biases.push({ key, bias: slice.bias_score });
  }

  if (biases.length < 2) return { cross_horizon_consistency_score: 0.5, inconsistencies: [] };

  let totalDiff = 0;
  let comparisons = 0;
  for (let i = 0; i < biases.length; i++) {
    for (let j = i + 1; j < biases.length; j++) {
      const diff = Math.abs(biases[i].bias - biases[j].bias);
      totalDiff += diff;
      comparisons++;

      if (Math.sign(biases[i].bias) !== Math.sign(biases[j].bias) &&
          Math.abs(biases[i].bias) > 0.2 && Math.abs(biases[j].bias) > 0.2) {
        inconsistencies.push(`${biases[i].key}_vs_${biases[j].key}`);
      }
    }
  }

  const avgDiff = comparisons > 0 ? totalDiff / comparisons : 0;
  const score = Math.max(0, 1 - avgDiff / 2);

  return {
    cross_horizon_consistency_score: Number(score.toFixed(4)),
    inconsistencies,
  };
}

/**
 * Compute ensemble bias (weighted average of horizon biases by confidence).
 *
 * @param {number} biasShort
 * @param {number} biasMid
 * @param {number} biasLong
 * @param {number} confShort
 * @param {number} confMid
 * @param {number} confLong
 * @returns {number} Ensemble bias ∈ [-1, 1]
 */
export function computeEnsembleBias(biasShort, biasMid, biasLong, confShort, confMid, confLong) {
  const totalConf = (confShort || 0) + (confMid || 0) + (confLong || 0);
  if (totalConf === 0) return 0;

  const weighted =
    (biasShort || 0) * (confShort || 0) +
    (biasMid || 0) * (confMid || 0) +
    (biasLong || 0) * (confLong || 0);

  return Number(Math.max(-1, Math.min(1, weighted / totalConf)).toFixed(4));
}

/**
 * Compute summary state from ensemble bias and cross-horizon consistency.
 *
 * @param {number} ensembleBias
 * @param {number} crossHorizonConsistency
 * @returns {string} Summary state
 */
export function computeSummaryState(ensembleBias, crossHorizonConsistency) {
  if (ensembleBias > 0.5 && crossHorizonConsistency > 0.7) return SUMMARY_STATE.STRONG_BULLISH_CONSENSUS;
  if (ensembleBias > 0.3) return SUMMARY_STATE.CONSISTENT_BULLISH;
  if (ensembleBias > 0.1) return SUMMARY_STATE.MIXED_BULLISH_SIGNALS;
  if (Math.abs(ensembleBias) <= 0.2) return SUMMARY_STATE.NEUTRAL_CONSENSUS;
  if (ensembleBias < -0.5 && crossHorizonConsistency > 0.7) return SUMMARY_STATE.STRONG_BEARISH_CONSENSUS;
  return SUMMARY_STATE.MIXED_SIGNALS_CAUTION;
}
