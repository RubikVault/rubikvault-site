/**
 * Capital Rotation Monitor — Statistical Standardization
 */

/**
 * Winsorize an array: clip values to [lo_pct, hi_pct] percentiles.
 */
export function winsorize(arr, loPct = 0.025, hiPct = 0.975) {
  if (!arr.length) return [];
  const sorted = [...arr].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return arr.map(() => 0);
  const lo = sorted[Math.floor(sorted.length * loPct)] ?? sorted[0];
  const hi = sorted[Math.ceil(sorted.length * hiPct) - 1] ?? sorted[sorted.length - 1];
  return arr.map(v => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
}

/**
 * Compute rolling z-score for the latest value using a lookback window.
 * @param {number[]} values - full series
 * @param {number} window - lookback (e.g. 252)
 * @param {number} capAbs - cap absolute z-score (e.g. 2.5)
 * @returns {number|null}
 */
export function rollingZScore(values, window = 252, capAbs = 2.5) {
  if (values.length < Math.min(window, 60)) return null;
  const lookback = values.slice(-window);
  const n = lookback.length;
  const mean = lookback.reduce((a, b) => a + b, 0) / n;
  const variance = lookback.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std < 1e-10) return 0;
  const z = (values[values.length - 1] - mean) / std;
  return Math.max(-capAbs, Math.min(capAbs, z));
}

/**
 * Map a z-score [-capAbs, capAbs] to a 0-100 score.
 * -2.5 → 0, 0 → 50, +2.5 → 100
 */
export function mapZScoreToScore(z, capAbs = 2.5) {
  if (z == null) return 50;
  const clamped = Math.max(-capAbs, Math.min(capAbs, z));
  return Math.round(((clamped + capAbs) / (2 * capAbs)) * 100);
}

/**
 * Compute empirical percentile rank of a value within a distribution.
 * Returns 0-100.
 */
export function percentileRank(value, distribution) {
  if (!distribution.length) return 50;
  const below = distribution.filter(v => v < value).length;
  const equal = distribution.filter(v => v === value).length;
  return Math.round(((below + 0.5 * equal) / distribution.length) * 100);
}

/**
 * Get the rolling percentile window values.
 * @param {number[]} values - full ratio value series
 * @param {number} windowYears - e.g. 5 (= 5*252 trading days)
 * @returns {{percentile:number, windowYearsUsed:number, limited:boolean}}
 */
export function computePercentileWindow(values, windowYears = 5) {
  const target = windowYears * 252;
  const available = values.length;
  if (available < 252 * 3) {
    return { percentile: null, windowYearsUsed: 0, limited: true };
  }
  const effectiveWindow = Math.min(target, available);
  const distribution = values.slice(-effectiveWindow, -1); // exclude latest for percentile
  const current = values[values.length - 1];
  const pct = percentileRank(current, distribution);
  return {
    percentile: pct,
    windowYearsUsed: Math.round((effectiveWindow / 252) * 10) / 10,
    limited: effectiveWindow < target
  };
}
