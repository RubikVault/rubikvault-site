/**
 * Capital Rotation Monitor — Ratio Computation
 */

/**
 * Compute ratio time series from aligned pair data.
 * ratio_t = closeA_t / closeB_t
 */
export function computeRatioSeries(aligned) {
  return aligned.map(row => ({
    date: row.date,
    value: row.closeA / row.closeB
  }));
}

/**
 * Compute returns over specified windows on a ratio series.
 * @param {Array<{date:string, value:number}>} series
 * @param {number[]} windows - e.g. [21, 63, 126, 252]
 * @returns {Object<number, number|null>} window → return (decimal)
 */
export function computeReturns(series, windows) {
  if (!series.length) return Object.fromEntries(windows.map(w => [w, null]));
  const latest = series[series.length - 1].value;
  const result = {};
  for (const w of windows) {
    const idx = series.length - 1 - w;
    if (idx >= 0 && series[idx].value > 0) {
      result[w] = (latest - series[idx].value) / series[idx].value;
    } else {
      result[w] = null;
    }
  }
  return result;
}

/**
 * Compute rolling standard deviation of daily ratio returns.
 * @param {Array<{date:string, value:number}>} series
 * @param {number} window
 * @returns {number|null}
 */
export function computeRollingVol(series, window) {
  if (series.length < window + 1) return null;
  const dailyReturns = [];
  for (let i = series.length - window; i < series.length; i++) {
    if (series[i - 1].value > 0) {
      dailyReturns.push((series[i].value - series[i - 1].value) / series[i - 1].value);
    }
  }
  if (dailyReturns.length < 10) return null;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyReturns.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute simple slope (linear trend) of last N values.
 * Returns slope normalized by mean value.
 */
export function computeTrendSlope(series, window = 60) {
  if (series.length < window) return null;
  const slice = series.slice(-window);
  const n = slice.length;
  const meanX = (n - 1) / 2;
  const meanY = slice.reduce((a, b) => a + b.value, 0) / n;
  if (meanY === 0) return 0;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (slice[i].value - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  return slope / meanY; // normalize
}
