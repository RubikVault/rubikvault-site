/**
 * V6.0 — Layer 6: Decision Engine V2
 *
 * Wraps and extends stock-decisions-v1.js with:
 * - bias_score
 * - insufficient_evidence_flag
 * - final_decision_score with bucket mapping
 * - entry/hold relevance
 * - hold_state
 *
 * V1 output is a strict subset of V2 output.
 */
import { makeDecision, VERDICT, CONFIDENCE } from './stock-decisions-v1.js';

export const DECISION_BUCKET = Object.freeze({
  HIGH_CONVICTION: 'HIGH_CONVICTION',
  MODERATE: 'MODERATE',
  WEAK: 'WEAK',
  NO_TRADE: 'NO_TRADE',
});

export const HOLD_STATE = Object.freeze({
  HOLD_STRONG: 'hold_strong',
  HOLD_NORMAL: 'hold_normal',
  HOLD_FADING: 'hold_fading',
  REDUCE: 'reduce',
  EXIT_SIGNAL: 'exit_signal',
});

const BUCKET_THRESHOLDS = Object.freeze({
  HIGH_CONVICTION: 0.75,
  MODERATE: 0.60,
  WEAK: 0.50,
});

/**
 * Make decision with V6 extensions.
 *
 * @param {Object} inputs - Same inputs as makeDecision() from V1
 * @param {Object} [v6Context] - Additional V6 context
 * @returns {Object} V1 decision + v6 extension block
 */
export function makeDecisionV2(inputs, v6Context = {}) {
  const v1Result = makeDecision({ ...inputs, breakoutState: inputs.breakoutState });

  const v6Extensions = {};

  // Process each horizon
  for (const horizonKey of ['short', 'medium', 'long']) {
    const slice = v1Result.horizons?.[horizonKey];
    if (!slice) continue;

    const ext = computeV6Extensions(slice, v6Context, v1Result);
    v6Extensions[horizonKey] = ext;
  }

  // Overall V6 extensions
  const overallExt = computeV6Extensions(v1Result, v6Context, v1Result);

  return {
    ...v1Result,
    v6: {
      ...overallExt,
      horizons: v6Extensions,
      system_version: '6.0.0',
    },
  };
}

function computeV6Extensions(slice, context, fullResult) {
  const scores = slice.scores || {};
  const confidence = confidenceToNumeric(slice.confidence_bucket);

  // Bias score
  const biasScore = computeBiasScore(scores, context);

  // Insufficient evidence flag
  const insufficientEvidence = computeInsufficientEvidence(context, scores);

  // Final decision score
  const finalDecisionScore = computeFinalDecisionScore({
    biasScore,
    confidence,
    marketPredictability: context.market_predictability ?? 0.7,
    clusterAgreement: context.cluster_agreement_score ?? 0.6,
  });

  // Bucket mapping
  let bucket = mapToBucket(finalDecisionScore);

  // Hard gates
  if (insufficientEvidence) bucket = DECISION_BUCKET.NO_TRADE;
  if (context.crash_state === 'critical') bucket = DECISION_BUCKET.NO_TRADE;
  if (context.system_state === 'CALIBRATION_BROKEN' && bucket === DECISION_BUCKET.HIGH_CONVICTION) {
    bucket = DECISION_BUCKET.WEAK;
  }

  // Signal direction conflict dampening
  if (context.signal_direction_conflict) {
    bucket = bucket === DECISION_BUCKET.HIGH_CONVICTION ? DECISION_BUCKET.MODERATE : bucket;
  }

  // Entry / hold relevance
  const entryRelevance = computeEntryRelevance(slice, confidence, insufficientEvidence);
  const holdRelevance = computeHoldRelevance(context);
  const holdState = computeHoldState(confidence, biasScore, context);

  return {
    bias_score: Number(biasScore.toFixed(4)),
    insufficient_evidence_flag: insufficientEvidence,
    final_decision_score: Number(finalDecisionScore.toFixed(4)),
    bucket,
    entry_relevance: entryRelevance,
    hold_relevance: holdRelevance,
    hold_state: holdState,
  };
}

function computeBiasScore(scores, context) {
  const trend = (scores.trend || 50) / 100;
  const entry = (scores.entry || 50) / 100;
  const risk = (scores.risk || 50) / 100;
  const ctx = (scores.context || 50) / 100;

  const regimeFit = context.regime_fit ?? 0.5;
  const rawBias = (trend * 0.30 + entry * 0.30 + ctx * 0.20 + risk * 0.20) * regimeFit;

  return Math.max(-1, Math.min(1, (rawBias - 0.5) * 2));
}

function computeInsufficientEvidence(context, scores) {
  const activeEvents = context.active_events ?? 4;
  const contributingClusters = context.contributing_clusters ?? 3;
  const dataQualityScore = context.data_quality_score ?? 80;

  return (
    activeEvents < 3 ||
    contributingClusters < 2 ||
    dataQualityScore < 70
  );
}

function computeFinalDecisionScore({ biasScore, confidence, marketPredictability, clusterAgreement }) {
  return (
    0.35 * Math.abs(biasScore) +
    0.30 * confidence +
    0.20 * marketPredictability +
    0.15 * clusterAgreement
  );
}

function mapToBucket(score) {
  if (score >= BUCKET_THRESHOLDS.HIGH_CONVICTION) return DECISION_BUCKET.HIGH_CONVICTION;
  if (score >= BUCKET_THRESHOLDS.MODERATE) return DECISION_BUCKET.MODERATE;
  if (score >= BUCKET_THRESHOLDS.WEAK) return DECISION_BUCKET.WEAK;
  return DECISION_BUCKET.NO_TRADE;
}

function confidenceToNumeric(bucket) {
  if (bucket === CONFIDENCE.HIGH) return 0.85;
  if (bucket === CONFIDENCE.MEDIUM) return 0.60;
  if (bucket === CONFIDENCE.LOW) return 0.35;
  return 0.1;
}

function computeEntryRelevance(slice, confidence, insufficientEvidence) {
  if (insufficientEvidence) return false;
  if (confidence < 0.55) return false;
  if (slice.verdict === VERDICT.BUY || slice.verdict === VERDICT.SELL) return true;
  return false;
}

function computeHoldRelevance(context) {
  const dirContinuity = context.direction_continuity_last_3d ?? 0;
  const crossConsistency = context.cross_horizon_consistency_score ?? 0;
  return dirContinuity > 0.7 || crossConsistency > 0.6;
}

function computeHoldState(confidence, biasScore, context) {
  if (confidence >= 0.7 && Math.abs(biasScore) >= 0.4) return HOLD_STATE.HOLD_STRONG;
  if (confidence >= 0.5) return HOLD_STATE.HOLD_NORMAL;
  if (confidence >= 0.3) return HOLD_STATE.HOLD_FADING;

  if (context.bias_score_prev != null) {
    const signFlip = Math.sign(biasScore) !== Math.sign(context.bias_score_prev);
    if (signFlip && confidence < 0.6) return HOLD_STATE.EXIT_SIGNAL;
  }

  return HOLD_STATE.REDUCE;
}
