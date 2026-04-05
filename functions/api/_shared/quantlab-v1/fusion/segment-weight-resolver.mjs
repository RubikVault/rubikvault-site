/**
 * QuantLab V1 — Segment Weight Resolver
 * Resolves weights with 5-tier fallback hierarchy + regime transition guard.
 */
import { loadLatestWeights, getDefaultWeights, getSegmentNode } from '../weight-history.mjs';
import { detectTransition, applyRegimeDamping } from '../regime-transition-guard.mjs';

const MIN_SAMPLES_FOR_SEGMENT = 20;

/**
 * Resolve weights for a given context segment.
 * @param {Object} params
 * @param {string} params.horizon
 * @param {string} params.asset_class
 * @param {string} [params.liquidity_bucket]
 * @param {string} [params.market_cap_bucket]
 * @param {string} [params.learning_lane]
 * @param {string} params.regime_bucket
 * @param {string[]} params.sources
 * @param {Object} [params.regimeContext] - { current, previous, history } for transition detection
 * @returns {{ weights, fallback_level, fallback_reason, sample_count, min_required_samples, version, regime_transition_active }}
 */
export function resolveWeights({
  horizon,
  asset_class,
  liquidity_bucket = 'all',
  market_cap_bucket = 'all',
  learning_lane = 'all',
  regime_bucket,
  sources,
  regimeContext,
}) {
  const snapshot = loadLatestWeights();
  const w = snapshot.weights;

  let result;

  const candidates = buildCandidateSegments({
    horizon,
    asset_class,
    liquidity_bucket,
    market_cap_bucket,
    learning_lane,
    regime_bucket,
  });
  for (const candidate of candidates) {
    const hit = trySegment(w, candidate, sources);
    if (hit) {
      result = {
        weights: hit.weights,
        fallback_level: candidate.label,
        fallback_reason: candidate.reason,
        sample_count: hit.sample_count,
      };
      break;
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

function buildCandidateSegments({
  horizon,
  asset_class,
  liquidity_bucket,
  market_cap_bucket,
  learning_lane,
  regime_bucket,
}) {
  const laneCandidates = [learning_lane];
  if (learning_lane === 'blue_chip_core') laneCandidates.push('core');
  laneCandidates.push('all');
  const uniqueLaneCandidates = [...new Set(laneCandidates.filter(Boolean))];
  const regimeCandidates = [...new Set([regime_bucket, 'all'].filter(Boolean))];
  const marketCapCandidates = [...new Set([market_cap_bucket, 'all'].filter(Boolean))];
  const liquidityCandidates = [...new Set([liquidity_bucket, 'all'].filter(Boolean))];
  const assetCandidates = [...new Set([asset_class, 'all'].filter(Boolean))];
  const horizonCandidates = [...new Set([horizon, 'all'].filter(Boolean))];
  const candidates = [];
  for (const h of horizonCandidates) {
    for (const assetClassCandidate of assetCandidates) {
      for (const liquidityCandidate of liquidityCandidates) {
        for (const marketCapCandidate of marketCapCandidates) {
          for (const learningLaneCandidate of uniqueLaneCandidates) {
            for (const regimeCandidate of regimeCandidates) {
              candidates.push({
                segment: {
                  horizon: h,
                  asset_class: assetClassCandidate,
                  liquidity_bucket: liquidityCandidate,
                  market_cap_bucket: marketCapCandidate,
                  learning_lane: learningLaneCandidate,
                  regime_bucket: regimeCandidate,
                },
                label: [
                  h === horizon ? 'exact_horizon' : 'all_horizon',
                  assetClassCandidate === asset_class ? 'exact_asset' : 'all_asset',
                  liquidityCandidate === liquidity_bucket ? 'exact_liquidity' : 'all_liquidity',
                  marketCapCandidate === market_cap_bucket ? 'exact_market_cap' : 'all_market_cap',
                  learningLaneCandidate === learning_lane ? 'exact_lane' : 'all_lane',
                  regimeCandidate === regime_bucket ? 'exact_regime' : 'all_regime',
                ].join('+'),
                reason: null,
              });
            }
          }
        }
      }
    }
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate.segment);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trySegment(w, candidate, sources) {
  const segment = getSegmentNode(w, candidate.segment);
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
