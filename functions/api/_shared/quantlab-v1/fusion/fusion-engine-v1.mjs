/**
 * QuantLab V1 — Fusion Engine
 * Weighted fusion of SignalContracts with confidence and evidence quality modulation.
 */
import { resolveWeights } from './segment-weight-resolver.mjs';

/**
 * Fuse an array of SignalContracts into a single composite score.
 * @param {Object[]} contracts - Array of validated SignalContracts
 * @param {Object} config
 * @param {string} config.horizon
 * @param {string} config.asset_class
 * @param {string} config.regime_bucket
 * @returns {{ fused_score: number, fused_confidence: number, source_contributions: Object, fallback_level: string, weights_version: string }}
 */
export function fuseContracts(contracts, config) {
  if (!contracts || contracts.length === 0) {
    return {
      fused_score: 0,
      fused_confidence: 0,
      source_contributions: {},
      fallback_level: 'no_contracts',
      weights_version: 'none',
    };
  }

  const sources = contracts.map(c => c.source);
  const { weights, fallback_level, version, regime_transition_active } = resolveWeights({
    horizon: config.horizon,
    asset_class: config.asset_class,
    regime_bucket: config.regime_bucket,
    sources,
    regimeContext: config.regimeContext,
  });

  let fusedScore = 0;
  let fusedConfidence = 0;
  let totalEffectiveWeight = 0;
  const contributions = {};

  for (const contract of contracts) {
    const baseWeight = weights[contract.source] || 0;
    // Modulate weight by contract's own confidence and evidence quality
    const qualityMod = contract.evidence_quality?.composite ?? 0.5;
    const confMod = contract.confidence ?? 0.5;
    const effectiveWeight = baseWeight * qualityMod * confMod;

    fusedScore += contract.direction_score * effectiveWeight;
    fusedConfidence += confMod * effectiveWeight;
    totalEffectiveWeight += effectiveWeight;

    contributions[contract.source] = {
      direction_score: contract.direction_score,
      confidence: confMod,
      evidence_quality: qualityMod,
      base_weight: baseWeight,
      effective_weight: effectiveWeight,
      contribution: contract.direction_score * effectiveWeight,
    };
  }

  // Flag low evidence quality sources
  const dataQualityFlags = [];
  for (const contract of contracts) {
    const eq = contract.evidence_quality?.composite ?? 1;
    if (eq < 0.3) {
      dataQualityFlags.push(`low_evidence_quality:${contract.source}`);
    }
  }

  // Normalize
  if (totalEffectiveWeight > 0) {
    fusedScore /= totalEffectiveWeight;
    fusedConfidence /= totalEffectiveWeight;
  }

  return {
    fused_score: Math.max(-1, Math.min(1, fusedScore)),
    fused_confidence: Math.max(0, Math.min(1, fusedConfidence)),
    source_contributions: contributions,
    fallback_level,
    weights_version: version,
    regime_transition_active: regime_transition_active || false,
    data_quality_flags: dataQualityFlags.length > 0 ? dataQualityFlags : undefined,
  };
}

/**
 * Determine regime bucket from regime probabilities.
 * @param {Object} regimeProbs - { bull, chop, bear, high_vol }
 * @returns {string}
 */
export function determineRegimeBucket(regimeProbs) {
  if (!regimeProbs) return 'chop';
  const { bull = 0, chop = 0, bear = 0, high_vol = 0 } = regimeProbs;
  if (high_vol > 0.6) return 'high_vol';
  if (bull >= bear && bull >= chop) return 'bull';
  if (bear >= bull && bear >= chop) return 'bear';
  return 'chop';
}
