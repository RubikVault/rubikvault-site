/**
 * QuantLab V1 — Breakout V2 Adapter
 * Converts breakout tracker data into a SignalContract.
 * Primarily a timing/entry signal for short horizon.
 */
import { createContract } from '../signal-contract.mjs';
import { validateRegimeProbs } from '../regime-probs-validator.mjs';

const STATUS_MAP = {
  TRIGGERED: { direction: 0.8, confidence: 0.75 },
  ARMED: { direction: 0.4, confidence: 0.5 },
  SETUP: { direction: 0.15, confidence: 0.3 },
  FAILED: { direction: -0.5, confidence: 0.6 },
  NONE: { direction: 0, confidence: 0.1 },
};

/**
 * @param {Object} breakoutData - From breakout-core.mjs output
 * @param {Object} context - { symbol, asof, regime_probs, volatility_bucket, horizon }
 * @returns {Object|null} SignalContract or null if no actionable data
 */
export function adaptBreakoutV2(breakoutData, context) {
  if (!breakoutData || typeof breakoutData !== 'object') return null;

  const status = (breakoutData.status || breakoutData.state || 'NONE').toUpperCase();
  const mapping = STATUS_MAP[status] || STATUS_MAP.NONE;
  if (mapping.direction === 0 && mapping.confidence < 0.2) return null;

  const volumeConfirmed = Boolean(
    breakoutData.volume_confirmed ||
    breakoutData.volume_confirmation ||
    breakoutData.vol_confirm
  );

  let direction = mapping.direction;
  let confidence = mapping.confidence;

  // Volume confirmation adjustment
  if (status === 'TRIGGERED' && !volumeConfirmed) {
    direction *= 0.5;
    confidence *= 0.7;
  }

  // Regime dampening: suppress in strongly bearish regimes
  const rp = context.regime_probs || {};
  if (rp.bear > 0.6) {
    direction *= 0.3;
    confidence *= 0.5;
  }

  const freshness = computeFreshness(breakoutData.as_of || context.asof);
  let flags = [];
  if (!volumeConfirmed && status === 'TRIGGERED') flags.push('no_volume_confirmation');
  if (rp.bear > 0.6) flags.push('bearish_regime_dampened');

  const regimeProbs = context.regime_probs || { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 };
  const { adjusted_flags } = validateRegimeProbs(regimeProbs, flags);
  flags = adjusted_flags;

  return createContract({
    source: 'breakout_v2',
    symbol: context.symbol,
    horizon: context.horizon || 'short',
    asof: context.asof || new Date().toISOString(),
    direction_score: direction,
    confidence,
    evidence_quality: {
      freshness_score: freshness,
      completeness_score: volumeConfirmed ? 0.9 : 0.5,
      composite: freshness * (volumeConfirmed ? 0.9 : 0.5),
    },
    regime_probs: regimeProbs,
    volatility_bucket: context.volatility_bucket || 'medium',
    data_freshness_ms: breakoutData.as_of ? Date.now() - new Date(breakoutData.as_of).getTime() : null,
    fallback_active: false,
    data_quality_flags: flags,
    lifecycle: {
      emitted_at: breakoutData.as_of || context.asof || new Date().toISOString(),
      valid_until: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
    raw_payload: breakoutData,
  });
}

function computeFreshness(asof) {
  if (!asof) return 0.5;
  const ageHours = (Date.now() - new Date(asof).getTime()) / 3600000;
  if (ageHours <= 12) return 1.0;
  if (ageHours <= 24) return 0.8;
  if (ageHours <= 48) return 0.5;
  return 0.2;
}
