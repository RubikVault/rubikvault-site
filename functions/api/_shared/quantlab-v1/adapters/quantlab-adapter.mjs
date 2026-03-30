/**
 * QuantLab V1 — QuantLab Source Adapter
 * Converts existing quantlabState into a SignalContract.
 */
import { createContract } from '../signal-contract.mjs';
import { validateRegimeProbs } from '../regime-probs-validator.mjs';

/**
 * @param {Object} quantlabState - quantlabState.value from pipeline
 * @param {Object} context - { symbol, asof, regime_probs, volatility_bucket, horizon }
 * @returns {Object|null} SignalContract or null if insufficient data
 */
export function adaptQuantLab(quantlabState, context) {
  const val = quantlabState?.value || quantlabState;
  if (!val || typeof val !== 'object') return null;

  const direction = mapDirection(val);
  const confidence = mapConfidence(val);
  const freshness = computeFreshness(val.as_of || context.asof);
  const completeness = computeCompleteness(val);

  const regimeProbs = context.regime_probs || { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 };
  let flags = [];
  const { adjusted_flags } = validateRegimeProbs(regimeProbs, flags);
  flags = adjusted_flags;

  return createContract({
    source: 'quantlab',
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

function mapDirection(val) {
  const signal = (val.signal || val.direction || '').toUpperCase();
  const score = val.composite_score || val.score;

  if (typeof score === 'number' && Number.isFinite(score)) {
    // Normalize from 0-100 or 0-1 range to -1..+1
    const normalized = score > 1 ? (score - 50) / 50 : (score - 0.5) * 2;
    return Math.max(-1, Math.min(1, normalized));
  }

  if (signal === 'BUY' || signal === 'BULLISH') return 0.6;
  if (signal === 'SELL' || signal === 'BEARISH') return -0.6;
  return 0;
}

function mapConfidence(val) {
  const conf = val.confidence;
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
  if (val.signal || val.direction) score += 0.3;
  if (val.composite_score != null || val.score != null) score += 0.3;
  if (val.confidence != null) score += 0.2;
  if (val.features || val.indicators) score += 0.2;
  return Math.min(1, score);
}
