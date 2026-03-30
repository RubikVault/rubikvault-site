/**
 * V6.0 — Layer 1B: PIT Adjuster & Total Return Index
 *
 * Computes total_return_index and forward total returns.
 * Integrates after Layer 01, before Layer 02.
 */

/**
 * Compute Total Return Index (TRI) for a bar series.
 * TRI reinvests dividends at ex-date, no tax modeling.
 *
 * @param {Array} bars - Sorted bars with close and optional dividend fields
 * @param {Array} [dividends] - External dividend records [{ date, amount }]
 * @param {Object} [options] - { base_value: 100.0 }
 * @returns {Array} Bars enriched with total_return_index field
 */
export function computeTotalReturnIndex(bars, dividends = [], options = {}) {
  if (!bars || bars.length === 0) return [];

  const baseValue = options.base_value ?? 100.0;
  const divMap = new Map();

  for (const d of dividends) {
    const key = d.date || d.ex_date;
    divMap.set(key, (divMap.get(key) || 0) + Number(d.amount || 0));
  }

  for (const bar of bars) {
    if (bar.dividend && Number(bar.dividend) > 0) {
      const key = bar.date || bar.timestamp;
      if (!divMap.has(key)) {
        divMap.set(key, Number(bar.dividend));
      }
    }
  }

  const result = [];
  let tri = baseValue;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const date = bar.date || bar.timestamp;

    if (i === 0) {
      result.push({ ...bar, total_return_index: tri });
      continue;
    }

    const prevClose = bars[i - 1].close;
    const curClose = bar.close;

    if (!prevClose || prevClose <= 0 || !Number.isFinite(curClose)) {
      result.push({ ...bar, total_return_index: tri });
      continue;
    }

    const divAmount = divMap.get(date) || 0;
    const priceReturn = (curClose - prevClose + divAmount) / prevClose;
    tri = tri * (1 + priceReturn);

    result.push({ ...bar, total_return_index: Number(tri.toFixed(6)) });
  }

  return result;
}

/**
 * Compute forward total return over horizon h.
 * @param {Array} triValues - Array of { date, total_return_index }
 * @param {number} t - Current index
 * @param {number} h - Horizon in trading days
 * @returns {number|null} Forward total return or null if insufficient data
 */
export function computeForwardTotalReturn(triValues, t, h) {
  if (t + h >= triValues.length || t < 0) return null;
  const triT = triValues[t]?.total_return_index;
  const triTH = triValues[t + h]?.total_return_index;
  if (!triT || !triTH || triT <= 0) return null;
  return (triTH / triT) - 1;
}
