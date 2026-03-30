/**
 * QuantLab V1 — SignalContract Builder & Validator
 */
import { randomUUID } from 'node:crypto';

const VALID_SOURCES = new Set(['forecast', 'scientific', 'elliott', 'quantlab', 'breakout_v2', 'hist_probs']);
const VALID_HORIZONS = new Set(['short', 'medium', 'long']);
const VALID_VOL_BUCKETS = new Set(['low', 'medium', 'high']);
const CONTRACT_VERSION = '1.0.0';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Create a validated SignalContract.
 * @param {Object} params
 * @returns {Object} SignalContract
 */
export function createContract({
  source,
  symbol,
  horizon,
  asof,
  correlation_id,
  direction_score,
  prob_up = null,
  prob_down = null,
  confidence,
  evidence_quality,
  regime_probs,
  volatility_bucket,
  data_freshness_ms = null,
  fallback_active = false,
  data_quality_flags = [],
  lifecycle,
  raw_payload = null,
}) {
  if (!VALID_SOURCES.has(source)) throw new Error(`Invalid source: ${source}`);
  if (!symbol || typeof symbol !== 'string') throw new Error('symbol required');
  if (!VALID_HORIZONS.has(horizon)) throw new Error(`Invalid horizon: ${horizon}`);
  if (!asof) throw new Error('asof required');
  if (!VALID_VOL_BUCKETS.has(volatility_bucket)) throw new Error(`Invalid volatility_bucket: ${volatility_bucket}`);

  const eq = evidence_quality || {};
  const rp = regime_probs || {};
  const lc = lifecycle || {};

  return {
    source,
    symbol: symbol.toUpperCase(),
    horizon,
    asof,
    correlation_id: correlation_id || randomUUID(),
    direction_score: clamp(Number(direction_score) || 0, -1, 1),
    prob_up: prob_up != null ? clamp(Number(prob_up), 0, 1) : null,
    prob_down: prob_down != null ? clamp(Number(prob_down), 0, 1) : null,
    confidence: clamp(Number(confidence) || 0, 0, 1),
    evidence_quality: {
      sample_size_score: eq.sample_size_score ?? null,
      freshness_score: clamp(Number(eq.freshness_score) || 0, 0, 1),
      completeness_score: clamp(Number(eq.completeness_score) || 0, 0, 1),
      regime_stability_score: eq.regime_stability_score ?? null,
      composite: clamp(Number(eq.composite) || 0, 0, 1),
    },
    regime_probs: {
      bull: clamp(Number(rp.bull) || 0, 0, 1),
      chop: clamp(Number(rp.chop) || 0, 0, 1),
      bear: clamp(Number(rp.bear) || 0, 0, 1),
      high_vol: clamp(Number(rp.high_vol) || 0, 0, 1),
    },
    volatility_bucket,
    data_freshness_ms,
    fallback_active: Boolean(fallback_active),
    data_quality_flags: Array.isArray(data_quality_flags) ? data_quality_flags : [],
    lifecycle: {
      emitted_at: lc.emitted_at || new Date().toISOString(),
      valid_until: lc.valid_until || new Date(Date.now() + 86400000).toISOString(),
      entry_triggered: lc.entry_triggered ?? null,
      entry_triggered_at: lc.entry_triggered_at ?? null,
      expired_without_entry: lc.expired_without_entry ?? null,
    },
    raw_payload,
    contract_version: CONTRACT_VERSION,
  };
}

/**
 * Validate a contract object has required fields and correct ranges.
 * @param {Object} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateContract(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['not an object'] };
  if (!VALID_SOURCES.has(obj.source)) errors.push(`invalid source: ${obj.source}`);
  if (!obj.symbol) errors.push('missing symbol');
  if (!VALID_HORIZONS.has(obj.horizon)) errors.push(`invalid horizon: ${obj.horizon}`);
  if (!obj.asof) errors.push('missing asof');
  if (!obj.correlation_id) errors.push('missing correlation_id');
  if (typeof obj.direction_score !== 'number' || obj.direction_score < -1 || obj.direction_score > 1) {
    errors.push('direction_score must be number in [-1,1]');
  }
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    errors.push('confidence must be number in [0,1]');
  }
  if (!obj.evidence_quality || typeof obj.evidence_quality.composite !== 'number') {
    errors.push('evidence_quality.composite required');
  }
  if (!obj.regime_probs) errors.push('missing regime_probs');
  if (!VALID_VOL_BUCKETS.has(obj.volatility_bucket)) errors.push(`invalid volatility_bucket: ${obj.volatility_bucket}`);
  if (typeof obj.fallback_active !== 'boolean') errors.push('fallback_active must be boolean');
  if (!obj.lifecycle || !obj.lifecycle.emitted_at) errors.push('lifecycle.emitted_at required');
  if (!obj.contract_version) errors.push('missing contract_version');
  return { valid: errors.length === 0, errors };
}
