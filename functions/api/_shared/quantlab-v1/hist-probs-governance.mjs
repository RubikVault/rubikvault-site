/**
 * QuantLab V1 — Historical Probabilities Governance Gate
 * Validates eligibility of hist-probs data before contract creation.
 */

const MIN_SAMPLE_SIZE = 50;
const MAX_STALE_DAYS = 7;

const HORIZON_MAP = {
  short: 'h5d',
  medium: 'h20d',
  long: 'h60d',
};

/**
 * Validate whether hist-probs data is eligible for use in fusion.
 * @param {Object} hpData - Ticker-specific hist-probs JSON
 * @param {Object} regimeData - regime-daily.json content
 * @param {string} horizon - 'short' | 'medium' | 'long'
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function validateHistProbsEligibility(hpData, regimeData, horizon) {
  const reasons = [];

  if (!hpData || typeof hpData !== 'object') {
    return { eligible: false, reasons: ['no_hp_data'] };
  }

  // Check horizon mapping exists
  const hKey = HORIZON_MAP[horizon];
  if (!hKey) {
    reasons.push(`invalid_horizon:${horizon}`);
    return { eligible: false, reasons };
  }

  // Check events exist
  const events = hpData.events;
  if (!events || typeof events !== 'object' || Object.keys(events).length === 0) {
    reasons.push('no_events');
    return { eligible: false, reasons };
  }

  // Check at least one event has sufficient sample size for this horizon
  const eventKeys = Object.keys(events);
  const validEvents = eventKeys.filter(k => {
    const evH = events[k]?.[hKey];
    return evH && typeof evH.n === 'number' && evH.n >= MIN_SAMPLE_SIZE;
  });

  if (validEvents.length === 0) {
    reasons.push(`sample_size_below_${MIN_SAMPLE_SIZE}`);
  }

  // Check data freshness
  if (hpData.generated_at || hpData.as_of) {
    const genDate = new Date(hpData.generated_at || hpData.as_of);
    const ageDays = (Date.now() - genDate.getTime()) / 86400000;
    if (ageDays > MAX_STALE_DAYS) {
      reasons.push(`stale_data:${ageDays.toFixed(0)}d`);
    }
  } else {
    reasons.push('missing_timestamp');
  }

  // Check regime data exists (basic plausibility)
  if (!regimeData || typeof regimeData !== 'object') {
    reasons.push('no_regime_data');
  } else if (!regimeData.market_regime) {
    reasons.push('missing_market_regime');
  }

  // Symbol consistency
  if (hpData.symbol && hpData.ticker) {
    // Both present — ok
  } else if (!hpData.symbol && !hpData.ticker) {
    reasons.push('missing_symbol_reference');
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Get the horizon key mapping.
 * @returns {Object}
 */
export function getHorizonMap() {
  return { ...HORIZON_MAP };
}
