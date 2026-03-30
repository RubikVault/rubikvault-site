/**
 * V6.0 — Objective Function & DSR
 *
 * Defines the composite objective function for strategy evaluation.
 * Includes Deflated Sharpe Ratio (DSR) to penalize multiple testing.
 */

/**
 * Compute the V6 composite objective function.
 *
 * objective = 0.30 * sharpe_norm + 0.25 * hit_rate_norm + 0.20 * dsr_norm
 *           + 0.15 * (1 - brier) + 0.10 * monotonicity_bonus
 *
 * @param {Object} params
 * @returns {{ objective_score: number, components: Object }}
 */
export function computeObjectiveFunction({
  hitRate = 0.5,
  sharpeRatio = 0,
  dsr = 0,
  brierScore = 0.25,
  monotonicityValid = true,
  liftVsBaseline = 0,
}) {
  const sharpeNorm = Math.max(0, Math.min(1, (sharpeRatio + 1) / 3));
  const hitRateNorm = Math.max(0, Math.min(1, (hitRate - 0.40) / 0.30));
  const dsrNorm = Math.max(0, Math.min(1, (dsr + 1) / 3));
  const brierComponent = Math.max(0, Math.min(1, 1 - brierScore));
  const monotonicityBonus = monotonicityValid ? 1.0 : 0.0;

  const objective =
    0.30 * sharpeNorm +
    0.25 * hitRateNorm +
    0.20 * dsrNorm +
    0.15 * brierComponent +
    0.10 * monotonicityBonus;

  return {
    objective_score: Number(Math.max(0, Math.min(1, objective)).toFixed(4)),
    components: {
      sharpe_norm: Number(sharpeNorm.toFixed(4)),
      hit_rate_norm: Number(hitRateNorm.toFixed(4)),
      dsr_norm: Number(dsrNorm.toFixed(4)),
      brier_component: Number(brierComponent.toFixed(4)),
      monotonicity_bonus: monotonicityBonus,
      lift_vs_baseline: liftVsBaseline,
    },
  };
}

/**
 * Compute Deflated Sharpe Ratio (DSR).
 * Penalizes observed Sharpe by the number of independent trials attempted.
 *
 * Simplified DSR: adjusts for multiple testing bias.
 * DSR ≈ Sharpe * (1 - ln(nTrials) / (2 * nObservations))
 *
 * @param {number} sharpeRatio - Observed Sharpe ratio
 * @param {number} nTrials - Number of independent trials (from countProductionTrials)
 * @param {number} [nObservations=252] - Number of observations (trading days)
 * @returns {{ dsr: number, dsr_significant: boolean, haircut_pct: number }}
 */
export function computeDSR(sharpeRatio, nTrials, nObservations = 252) {
  if (!Number.isFinite(sharpeRatio) || nTrials < 1) {
    return { dsr: 0, dsr_significant: false, haircut_pct: 100 };
  }

  if (nTrials <= 1) {
    return { dsr: sharpeRatio, dsr_significant: sharpeRatio > 0, haircut_pct: 0 };
  }

  const haircutFactor = Math.max(0, 1 - Math.log(nTrials) / (2 * nObservations));
  const dsr = sharpeRatio * haircutFactor;
  const haircutPct = Number(((1 - haircutFactor) * 100).toFixed(2));

  return {
    dsr: Number(dsr.toFixed(4)),
    dsr_significant: dsr > 0,
    haircut_pct: haircutPct,
  };
}

/**
 * Compare candidate vs champion objective scores.
 * Candidate must beat champion by > 5% to justify promotion.
 *
 * @param {Object} candidate - { objective_score }
 * @param {Object} champion - { objective_score }
 * @param {number} [minImprovement=0.05] - Minimum improvement threshold
 * @returns {{ promote: boolean, improvement_pct: number, comparison: string }}
 */
export function compareObjectives(candidate, champion, minImprovement = 0.05) {
  const candScore = candidate?.objective_score ?? 0;
  const champScore = champion?.objective_score ?? 0;

  if (champScore === 0) {
    return { promote: candScore > 0, improvement_pct: 100, comparison: 'NO_CHAMPION' };
  }

  const improvement = (candScore - champScore) / champScore;

  return {
    promote: improvement > minImprovement,
    improvement_pct: Number((improvement * 100).toFixed(2)),
    comparison: improvement > minImprovement ? 'CANDIDATE_WINS' : 'CHAMPION_HOLDS',
  };
}
