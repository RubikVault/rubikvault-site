/**
 * RUNBLOCK v3.0 — Layer 1: Data Integrity
 *
 * First mandatory gate. FAIL blocks all downstream.
 * SUSPECT may continue only in degraded/shadow paths.
 */

/**
 * Validate OHLCV bar integrity.
 *
 * @param {Object} bar - { open, high, low, close, volume, timestamp }
 * @returns {{ state: 'PASS'|'SUSPECT'|'FAIL', reason_codes: string[] }}
 */
export function validateBar(bar) {
  const reasons = [];

  if (!bar || typeof bar !== 'object') return { state: 'FAIL', reason_codes: ['NULL_BAR'] };

  const { open, high, low, close, volume, timestamp } = bar;

  // Hard FAIL: non-positive price
  if (close <= 0 || open <= 0 || high <= 0 || low <= 0) {
    reasons.push('NON_POSITIVE_PRICE');
    return { state: 'FAIL', reason_codes: reasons };
  }

  // Hard FAIL: OHLC inconsistency
  if (high < low) {
    reasons.push('OHLC_HIGH_LT_LOW');
    return { state: 'FAIL', reason_codes: reasons };
  }
  if (high < open || high < close) reasons.push('OHLC_HIGH_INCONSISTENT');
  if (low > open || low > close) reasons.push('OHLC_LOW_INCONSISTENT');

  // Negative volume
  if (volume != null && volume < 0) {
    reasons.push('NEGATIVE_VOLUME');
    return { state: 'FAIL', reason_codes: reasons };
  }

  // Null/corrupted fields
  if (close == null || !Number.isFinite(close)) {
    reasons.push('CORRUPTED_CLOSE');
    return { state: 'FAIL', reason_codes: reasons };
  }

  if (!timestamp) reasons.push('MISSING_TIMESTAMP');

  if (reasons.length > 0) return { state: 'SUSPECT', reason_codes: reasons };
  return { state: 'PASS', reason_codes: [] };
}

/**
 * Validate a series of bars for sequence integrity.
 *
 * @param {Array} bars - Array of OHLCV bars, sorted by timestamp
 * @param {Object} [config] - From pipeline-config.v3.json
 * @returns {{ state: 'PASS'|'SUSPECT'|'FAIL', reason_codes: string[], bar_results: Array, stats: Object }}
 */
export function validateSeries(bars, config = {}) {
  if (!bars || bars.length === 0) return { state: 'FAIL', reason_codes: ['EMPTY_SERIES'], bar_results: [], stats: {} };

  const barResults = [];
  const reasons = [];
  let failCount = 0;
  let suspectCount = 0;

  for (let i = 0; i < bars.length; i++) {
    const result = validateBar(bars[i]);
    barResults.push(result);
    if (result.state === 'FAIL') failCount++;
    if (result.state === 'SUSPECT') suspectCount++;

    // Duplicate candle check
    if (i > 0 && bars[i].timestamp === bars[i - 1].timestamp) {
      reasons.push(`DUPLICATE_CANDLE_AT_${i}`);
      failCount++;
    }

    // Out-of-order check
    if (i > 0 && bars[i].timestamp < bars[i - 1].timestamp) {
      reasons.push(`OUT_OF_ORDER_AT_${i}`);
      failCount++;
    }
  }

  // Unexplained gaps (>3 trading days)
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].timestamp && bars[i - 1].timestamp) {
      const gap = (new Date(bars[i].timestamp) - new Date(bars[i - 1].timestamp)) / 86400000;
      if (gap > 5) reasons.push(`GAP_${Math.round(gap)}D_AT_${i}`);
    }
  }

  const suspectPct = bars.length > 0 ? (suspectCount / bars.length) * 100 : 0;
  let state = 'PASS';
  if (failCount > 0) state = 'FAIL';
  else if (suspectCount > 0) state = 'SUSPECT';

  return {
    state,
    reason_codes: reasons,
    bar_results: barResults,
    stats: {
      total: bars.length,
      pass: bars.length - failCount - suspectCount,
      suspect: suspectCount,
      fail: failCount,
      suspect_pct: suspectPct,
    },
  };
}

/**
 * Cross-feed reconciliation between primary and secondary data sources.
 *
 * @param {Object} primary - { close, volume, timestamp }
 * @param {Object} secondary - { close, volume, timestamp }
 * @param {Object} [config] - { price_deviation_tolerance_pct }
 * @returns {{ state: 'PASS'|'SUSPECT'|'FAIL', deviation_pct: number, reason_codes: string[] }}
 */
export function reconcileFeeds(primary, secondary, config = {}) {
  const tolerance = config.price_deviation_tolerance_pct ?? 0.10;
  const reasons = [];

  if (!primary || !secondary) {
    return { state: 'FAIL', deviation_pct: null, reason_codes: ['FEED_MISSING'] };
  }

  if (primary.close <= 0 || secondary.close <= 0) {
    return { state: 'FAIL', deviation_pct: null, reason_codes: ['NON_POSITIVE_PRICE'] };
  }

  const deviation = Math.abs(primary.close - secondary.close) / primary.close * 100;

  if (deviation > tolerance * 10) {
    reasons.push('EXTREME_DEVIATION');
    return { state: 'FAIL', deviation_pct: deviation, reason_codes: reasons };
  }

  if (deviation > tolerance) {
    reasons.push('DEVIATION_ABOVE_TOLERANCE');
    return { state: 'SUSPECT', deviation_pct: deviation, reason_codes: reasons };
  }

  return { state: 'PASS', deviation_pct: deviation, reason_codes: [] };
}
