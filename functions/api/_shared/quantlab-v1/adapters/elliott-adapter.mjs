/**
 * QuantLab V1 — Elliott Wave Adapter
 * Converts elliottState into a SignalContract.
 */
import { createContract } from '../signal-contract.mjs';
import { validateRegimeProbs } from '../regime-probs-validator.mjs';

/**
 * @param {Object} elliottState - elliottState.value from pipeline
 * @param {Object} context - { symbol, asof, regime_probs, volatility_bucket, horizon, isBridge }
 * @returns {Object|null} SignalContract or null if insufficient data
 */
export function adaptElliott(elliottState, context) {
  const val = elliottState?.value || elliottState;
  if (!val || typeof val !== 'object') return null;

  const direction = mapWaveDirection(val);
  const confidence = mapConfidence(val, context);
  const isBridge = context.isBridge || false;
  const freshness = computeFreshness(val.as_of || context.asof);
  const completeness = isBridge ? 0.5 : computeCompleteness(val);

  const regimeProbs = context.regime_probs || { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 };
  let flags = isBridge ? ['bridge_source'] : [];
  const { adjusted_flags } = validateRegimeProbs(regimeProbs, flags);
  flags = adjusted_flags;

  return createContract({
    source: 'elliott',
    symbol: context.symbol,
    horizon: context.horizon || 'medium',
    asof: context.asof || new Date().toISOString(),
    direction_score: direction,
    confidence,
    evidence_quality: {
      freshness_score: freshness,
      completeness_score: completeness,
      composite: freshness * completeness,
    },
    regime_probs: regimeProbs,
    volatility_bucket: context.volatility_bucket || 'medium',
    data_freshness_ms: val.as_of ? Date.now() - new Date(val.as_of).getTime() : null,
    fallback_active: isBridge,
    data_quality_flags: flags,
    lifecycle: {
      emitted_at: val.as_of || context.asof || new Date().toISOString(),
      valid_until: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
    raw_payload: val,
  });
}

function mapWaveDirection(val) {
  const phase = (val.phase || val.wave_phase || val.market_phase || '').toLowerCase();
  const direction = (val.direction || val.wave_direction || '').toLowerCase();

  if (direction === 'up' || direction === 'bullish') {
    return phase === 'impulse' ? 0.7 : 0.4;
  }
  if (direction === 'down' || direction === 'bearish') {
    return phase === 'impulse' ? -0.7 : -0.4;
  }
  if (phase === 'corrective') return -0.2;
  return 0;
}

function mapConfidence(val, context) {
  if (context.isBridge) return 0.3;
  const conf = val.confidence || val.wave_confidence;
  if (typeof conf === 'number' && Number.isFinite(conf)) {
    return conf > 1 ? conf / 100 : conf;
  }
  return 0.4;
}

function computeFreshness(asof) {
  if (!asof) return 0.5;
  const ageHours = (Date.now() - new Date(asof).getTime()) / 3600000;
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 72) return 0.7;
  return 0.3;
}

function computeCompleteness(val) {
  let score = 0;
  if (val.phase || val.wave_phase || val.market_phase) score += 0.3;
  if (val.direction || val.wave_direction) score += 0.3;
  if (val.wave_count || val.count) score += 0.2;
  if (val.confidence || val.wave_confidence) score += 0.2;
  return Math.min(1, score);
}
