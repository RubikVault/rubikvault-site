/**
 * V6.0 — Layer 3C: Oracle Statistical Metrics
 *
 * Pure JS implementations of HAC, Newey-West, n_eff, FDR.
 * No dependencies beyond standard Math.
 */

/**
 * Compute effective sample size (n_eff) accounting for autocorrelation.
 *
 * n_eff = n / (1 + 2 * sum((1 - k/n) * rho_k))
 *
 * @param {number} n - Raw sample size
 * @param {Array} autocorrelations - Array of autocorrelation coefficients [rho_1, rho_2, ...]
 * @returns {number} Effective sample size
 */
export function computeNEff(n, autocorrelations = []) {
  if (n <= 1) return 1;
  if (!autocorrelations.length) return n;

  let sumRho = 0;
  const lag = autocorrelations.length;
  for (let k = 0; k < lag; k++) {
    const rho = autocorrelations[k] || 0;
    sumRho += (1 - (k + 1) / n) * rho;
  }

  const nEffRaw = n / (1 + 2 * sumRho);
  return Math.max(1, Math.min(n, nEffRaw));
}

/**
 * Compute autocorrelation function for a time series.
 * @param {Array} values - Numeric array
 * @param {number} [maxLag] - Max lag to compute (default: floor(sqrt(n)))
 * @returns {Array} Autocorrelation coefficients [rho_1, rho_2, ...]
 */
export function computeAutocorrelation(values, maxLag = null) {
  const n = values.length;
  if (n < 4) return [];

  const lag = maxLag ?? Math.floor(Math.sqrt(n));
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

  if (variance === 0) return new Array(lag).fill(0);

  const result = [];
  for (let k = 1; k <= lag; k++) {
    let cov = 0;
    for (let t = 0; t < n - k; t++) {
      cov += (values[t] - mean) * (values[t + k] - mean);
    }
    cov /= n;
    result.push(cov / variance);
  }

  return result;
}

/**
 * Compute HAC (Heteroskedasticity and Autocorrelation Consistent) variance.
 * Uses Bartlett kernel.
 *
 * @param {Array} residuals - Array of residuals
 * @param {number} [lags] - Number of lags (default: floor(sqrt(n)))
 * @returns {number} HAC variance estimate
 */
export function computeHAC(residuals, lags = null) {
  const n = residuals.length;
  if (n < 2) return 0;

  const L = lags ?? Math.floor(Math.sqrt(n));
  const mean = residuals.reduce((s, v) => s + v, 0) / n;
  const centered = residuals.map(r => r - mean);

  // Gamma_0
  let gamma0 = 0;
  for (let t = 0; t < n; t++) gamma0 += centered[t] ** 2;
  gamma0 /= n;

  // Weighted sum of autocovariances (Bartlett kernel)
  let hacVar = gamma0;
  for (let j = 1; j <= L; j++) {
    let gammaJ = 0;
    for (let t = j; t < n; t++) {
      gammaJ += centered[t] * centered[t - j];
    }
    gammaJ /= n;
    const bartlettWeight = 1 - j / (L + 1);
    hacVar += 2 * bartlettWeight * gammaJ;
  }

  return Math.max(0, hacVar);
}

/**
 * Compute Newey-West standard errors.
 * @param {Array} residuals - Array of residuals
 * @param {number} [lags] - Number of lags
 * @returns {number} Newey-West standard error
 */
export function computeNeweyWest(residuals, lags = null) {
  const hacVar = computeHAC(residuals, lags);
  return Math.sqrt(hacVar / Math.max(1, residuals.length));
}

/**
 * Compute FDR-adjusted p-values using Benjamini-Hochberg procedure.
 * @param {Array} pValues - Array of raw p-values
 * @returns {Array} Adjusted p-values (same order as input)
 */
export function computeFDR(pValues) {
  if (!pValues.length) return [];

  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array(n);
  let cumMin = 1;

  for (let rank = n; rank >= 1; rank--) {
    const idx = rank - 1;
    const corrected = (indexed[idx].p * n) / rank;
    cumMin = Math.min(cumMin, corrected);
    adjusted[indexed[idx].i] = Math.min(1, cumMin);
  }

  return adjusted;
}

/**
 * Compute regime-conditional fit score.
 * @param {number} winRateConditional - Win rate under current regime
 * @param {number} winRateBaseline - Overall baseline win rate
 * @param {number} nRegimeConditional - Sample size under current regime
 * @returns {{ regime_fit: number, insufficient_regime_evidence_flag: boolean, regime_fit_uncertainty_flag: boolean }}
 */
export function computeRegimeFit(winRateConditional, winRateBaseline, nRegimeConditional) {
  if (nRegimeConditional < 30) {
    return { regime_fit: 0.5, insufficient_regime_evidence_flag: true, regime_fit_uncertainty_flag: false };
  }

  const regimeFitRaw = winRateBaseline > 0
    ? winRateConditional / winRateBaseline
    : 0.5;

  if (nRegimeConditional < 100) {
    const w = nRegimeConditional / (nRegimeConditional + 75);
    const regimeFit = w * regimeFitRaw + (1 - w) * 0.5;
    return { regime_fit: Number(regimeFit.toFixed(4)), insufficient_regime_evidence_flag: false, regime_fit_uncertainty_flag: true };
  }

  return { regime_fit: Number(regimeFitRaw.toFixed(4)), insufficient_regime_evidence_flag: false, regime_fit_uncertainty_flag: false };
}
