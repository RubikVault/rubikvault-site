/**
 * QuantLab V1 — Forecast Adapter
 * Converts forecastState into a SignalContract.
 */
import { createContract } from '../signal-contract.mjs';
import { validateRegimeProbs } from '../regime-probs-validator.mjs';

const HORIZON_MAP = { '1d': 'short', '5d': 'medium', '20d': 'long' };

/**
 * @param {Object} forecastState - forecastState.value from pipeline
 * @param {Object} context - { symbol, asof, regime_probs, volatility_bucket }
 * @returns {Object[]} Array of SignalContracts (one per horizon with data)
 */
export function adaptForecast(forecastState, context) {
  const val = forecastState?.value || forecastState;
  if (!val || typeof val !== 'object') return [];

  const contracts = [];
  const horizons = val.horizons || {};

  for (const [hKey, hData] of Object.entries(horizons)) {
    const horizon = HORIZON_MAP[hKey];
    if (!horizon || !hData) continue;

    const pUp = Number(hData.p_up);
    const conf = Number(hData.confidence ?? hData.conf ?? 0.5);
    const directionScore = Number.isFinite(pUp) ? (pUp - 0.5) * 2 : 0;
    const freshness = computeFreshness(val.as_of || context.asof);

    const regimeProbs = context.regime_probs || { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 };
    let flags = hData.neutral_flag ? ['neutral_flag'] : [];
    const { adjusted_flags } = validateRegimeProbs(regimeProbs, flags);
    flags = adjusted_flags;

    contracts.push(createContract({
      source: 'forecast',
      symbol: context.symbol,
      horizon,
      asof: context.asof || new Date().toISOString(),
      direction_score: directionScore,
      prob_up: Number.isFinite(pUp) ? pUp : null,
      prob_down: Number.isFinite(pUp) ? 1 - pUp : null,
      confidence: Number.isFinite(conf) ? conf : 0.5,
      evidence_quality: {
        freshness_score: freshness,
        completeness_score: hData.p_up != null ? 1.0 : 0.3,
        composite: freshness * (hData.p_up != null ? 1.0 : 0.3),
      },
      regime_probs: regimeProbs,
      volatility_bucket: context.volatility_bucket || 'medium',
      data_freshness_ms: val.as_of ? Date.now() - new Date(val.as_of).getTime() : null,
      fallback_active: Boolean(hData.fallback),
      data_quality_flags: flags,
      lifecycle: {
        emitted_at: val.as_of || context.asof || new Date().toISOString(),
        valid_until: computeValidUntil(hKey),
      },
      raw_payload: hData,
    }));
  }

  return contracts;
}

function computeFreshness(asof) {
  if (!asof) return 0.5;
  const ageMs = Date.now() - new Date(asof).getTime();
  const ageHours = ageMs / 3600000;
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 48) return 0.8;
  if (ageHours <= 72) return 0.5;
  return 0.2;
}

function computeValidUntil(horizonKey) {
  const days = { '1d': 1, '5d': 5, '20d': 20 }[horizonKey] || 1;
  return new Date(Date.now() + days * 86400000).toISOString();
}
