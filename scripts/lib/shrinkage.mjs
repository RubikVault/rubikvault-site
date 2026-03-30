/**
 * V6.0 — Layer 4A: Shrinkage & Risk Adjustment
 *
 * Immutable Invariant: raw_effect → shrinkage → risk_adjustment → tanh
 * Pure functions, no I/O.
 */

/**
 * Bayesian shrinkage toward prior mean.
 *
 * posterior = (n_eff / (n_eff + K)) * raw_effect + (K / (n_eff + K)) * prior_mean
 *
 * @param {number} rawEffect - Observed effect size
 * @param {number} priorMean - Prior mean (cluster-specific median historical effect)
 * @param {number} nEff - Effective sample size
 * @param {number} [K=50] - Shrinkage strength parameter
 * @returns {number} Posterior effect (shrunk)
 */
export function computePosteriorEffect(rawEffect, priorMean, nEff, K = 50) {
  if (!Number.isFinite(rawEffect)) return priorMean;
  if (!Number.isFinite(nEff) || nEff <= 0) return priorMean;
  if (!Number.isFinite(K) || K <= 0) return rawEffect;

  const w = nEff / (nEff + K);
  return w * rawEffect + (1 - w) * priorMean;
}

/**
 * Risk-adjust the posterior effect using a volatility proxy.
 *
 * risk_adjusted = posterior_effect / vol_proxy (Sharpe-like normalization)
 *
 * @param {number} posteriorEffect - Shrunk effect
 * @param {number} volProxy - Volatility proxy (cluster-specific)
 * @param {number} [riskFreeRate=0] - Risk-free rate for Sharpe adjustment
 * @returns {number} Risk-adjusted effect
 */
export function computeRiskAdjustedEffect(posteriorEffect, volProxy, riskFreeRate = 0) {
  if (!Number.isFinite(posteriorEffect)) return 0;
  if (!Number.isFinite(volProxy) || volProxy <= 0) return posteriorEffect;

  return (posteriorEffect - riskFreeRate) / volProxy;
}

/**
 * Apply tanh capping to bound the risk-adjusted effect to [-1, 1].
 * This is an IMMUTABLE INVARIANT and must never be removed.
 *
 * @param {number} riskAdjustedEffect - Risk-adjusted effect
 * @returns {number} Bounded effect ∈ [-1, 1]
 */
export function applyTanhCap(riskAdjustedEffect) {
  if (!Number.isFinite(riskAdjustedEffect)) return 0;
  return Math.tanh(riskAdjustedEffect);
}

/**
 * Full shrinkage pipeline (immutable order enforced).
 *
 * raw_effect → posterior_effect_raw → risk_adjusted_effect → posterior_effect_risk_adjusted
 *
 * @param {Object} params
 * @returns {Object} { posterior_effect_raw, risk_adjusted_effect, posterior_effect_risk_adjusted }
 */
export function applyShrinkagePipeline({ rawEffect, priorMean = 0, nEff, K = 50, volProxy = 1, riskFreeRate = 0 }) {
  const posteriorEffectRaw = computePosteriorEffect(rawEffect, priorMean, nEff, K);
  const riskAdjustedEffect = computeRiskAdjustedEffect(posteriorEffectRaw, volProxy, riskFreeRate);
  const posteriorEffectRiskAdjusted = applyTanhCap(riskAdjustedEffect);

  return {
    posterior_effect_raw: posteriorEffectRaw,
    risk_adjusted_effect: riskAdjustedEffect,
    posterior_effect_risk_adjusted: posteriorEffectRiskAdjusted,
  };
}

/**
 * Cluster-specific volatility proxy mapping.
 */
export const VOL_PROXY_MAPPING = Object.freeze({
  mean_reversion: 'ATR_14_pct',
  trend: 'historical_vol_60d',
  breakout: 'ATR_20_pct',
  momentum: 'historical_vol_60d',
  relative_strength: 'historical_vol_60d',
  volume: 'ATR_14_pct',
  volatility: 'historical_vol_20d',
});
