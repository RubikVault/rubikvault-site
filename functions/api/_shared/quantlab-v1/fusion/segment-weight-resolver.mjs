/**
 * QuantLab V1 — Segment Weight Resolver
 * Resolves weights with 5-tier fallback hierarchy + regime transition guard.
 */
import { loadLatestWeights, getDefaultWeights } from '../weight-history.mjs';
import { detectTransition, applyRegimeDamping } from '../regime-transition-guard.mjs';

const MIN_SAMPLES_FOR_SEGMENT = 20;

/**
 * Resolve weights for a given context segment.
 * @param {Object} params
 * @param {string} params.horizon
 * @param {string} params.asset_class
 * @param {string} params.regime_bucket
 * @param {string[]} params.sources
 * @param {Object} [params.regimeContext] - { current, previous, history } for transition detection
 * @returns {{ weights, fallback_level, fallback_reason, sample_count, min_required_samples, version, regime_transition_active }}
 */
export function resolveWeights({ horizon, asset_class, regime_bucket, sources, regimeContext }) {
  const snapshot = loadLatestWeights();
  const w = snapshot.weights;

  let result;

  // Try exact segment match
  const exact = trySegment(w, horizon, asset_class, regime_bucket, sources);
  if (exact) {
    result = { weights: exact.weights, fallback_level: 'exact', fallback_reason: null, sample_count: exact.sample_count };
  }

  if (!result) {
    const allAC = trySegment(w, horizon, 'all', regime_bucket, sources);
    if (allAC) {
      result = { weights: allAC.weights, fallback_level: 'all_asset_class', fallback_reason: `no segment for asset_class=${asset_class}`, sample_count: allAC.sample_count };
    }
  }

  if (!result) {
    const allRegime = trySegment(w, horizon, 'all', 'all', sources);
    if (allRegime) {
      result = { weights: allRegime.weights, fallback_level: 'all_regime', fallback_reason: `no segment for regime=${regime_bucket}`, sample_count: allRegime.sample_count };
    }
  }

  if (!result && isFlat(w) && hasAllSources(w, sources)) {
    result = { weights: pickSources(w, sources), fallback_level: 'global_prior', fallback_reason: 'using flat global weights', sample_count: null };
  }

  if (!result) {
    const eq = {};
    const equalW = 1 / sources.length;
    for (const s of sources) eq[s] = equalW;
    result = { weights: eq, fallback_level: 'equal_weight', fallback_reason: 'no weight data available', sample_count: 0 };
  }

  // Apply regime transition guard
  let regimeTransitionActive = false;
  if (regimeContext) {
    const transition = detectTransition(
      regimeContext.current || {},
      regimeContext.previous || null,
      regimeContext.history || []
    );
    if (transition.transition_active) {
      result.weights = applyRegimeDamping(result.weights, transition.damping_factor);
      regimeTransitionActive = true;
      result.fallback_reason = (result.fallback_reason || '') + `; regime_transition: ${transition.reason}`;
    }
  }

  return {
    weights: result.weights,
    fallback_level: result.fallback_level,
    fallback_reason: result.fallback_reason,
    sample_count: result.sample_count,
    min_required_samples: MIN_SAMPLES_FOR_SEGMENT,
    version: snapshot.version,
    regime_transition_active: regimeTransitionActive,
  };
}

function trySegment(w, horizon, ac, regime, sources) {
  const segment = w?.[horizon]?.[ac]?.[regime];
  if (!segment || typeof segment !== 'object') return null;
  if (!hasAllSources(segment, sources)) return null;
  const sampleCount = segment._sample_count ?? null;
  return { weights: pickSources(segment, sources), sample_count: sampleCount };
}

function isFlat(w) {
  if (!w || typeof w !== 'object') return false;
  return typeof Object.values(w)[0] === 'number';
}

function hasAllSources(obj, sources) {
  return sources.every(s => typeof obj[s] === 'number');
}

function pickSources(obj, sources) {
  const result = {};
  let total = 0;
  for (const s of sources) { result[s] = obj[s] || 0; total += result[s]; }
  if (total > 0) { for (const s of sources) result[s] /= total; }
  else { const eq = 1 / sources.length; for (const s of sources) result[s] = eq; }
  return result;
}
