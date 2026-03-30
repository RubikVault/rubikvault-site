/**
 * QuantLab V1 — Scientific Adapter
 * Converts scientificState into a SignalContract.
 */
import { createContract } from '../signal-contract.mjs';
import { validateRegimeProbs } from '../regime-probs-validator.mjs';

/**
 * @param {Object} scientificState - scientificState.value from pipeline
 * @param {Object} context - { symbol, asof, regime_probs, volatility_bucket, horizon }
 * @returns {Object|null} SignalContract or null if insufficient data
 */
export function adaptScientific(scientificState, context) {
  const val = scientificState?.value || scientificState;
  if (!val || typeof val !== 'object') return null;

  const direction = mapSetupDirection(val);
  const confidence = mapConfidence(val);
  const freshness = computeFreshness(val.as_of || context.asof);
  const completeness = computeCompleteness(val);

  const regimeProbs = context.regime_probs || { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 };
  let flags = val.data_quality === 'PARTIAL' ? ['partial_data'] : [];
  const { adjusted_flags } = validateRegimeProbs(regimeProbs, flags);
  flags = adjusted_flags;

  return createContract({
    source: 'scientific',
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
    fallback_active: false,
    data_quality_flags: flags,
    lifecycle: {
      emitted_at: val.as_of || context.asof || new Date().toISOString(),
      valid_until: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
    raw_payload: val,
  });
}

function mapSetupDirection(val) {
  const bias = val.bias || val.strategic_bias || '';
  const trigger = val.trigger_status || val.trigger || '';

  if (bias === 'BULLISH' || bias === 'bullish') {
    return trigger === 'CONFIRMED' ? 0.8 : 0.5;
  }
  if (bias === 'BEARISH' || bias === 'bearish') {
    return trigger === 'CONFIRMED' ? -0.8 : -0.5;
  }
  return 0;
}

function mapConfidence(val) {
  const score = val.confidence_score || val.confidence;
  if (typeof score === 'number' && Number.isFinite(score)) {
    return score > 1 ? score / 100 : score;
  }
  if (val.trigger_status === 'CONFIRMED') return 0.7;
  if (val.trigger_status === 'ARMED') return 0.5;
  return 0.3;
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
  if (val.bias || val.strategic_bias) score += 0.3;
  if (val.trigger_status || val.trigger) score += 0.3;
  if (val.support_levels || val.resistance_levels) score += 0.2;
  if (val.confidence_score != null || val.confidence != null) score += 0.2;
  return Math.min(1, score);
}
