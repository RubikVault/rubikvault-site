/**
 * V6.0 — Explainability Levels
 *
 * Provides tiered explainability output for decisions.
 * FULL → all intermediate results; SUMMARY → key scores; DECISION_ONLY → bucket + hold.
 */

export const EXPLAINABILITY_LEVEL = Object.freeze({
  FULL: 'full',
  SUMMARY: 'summary',
  DECISION_ONLY: 'decision_only',
});

/**
 * Compute top contributing evidence records.
 *
 * @param {Array} evidenceRecords - [{ event_id, cluster_id, raw_evidence_score, weight }]
 * @param {number} [limit=3]
 * @returns {Array} Top contributors sorted by |contribution|
 */
export function computeTopContributors(evidenceRecords, limit = 3) {
  if (!evidenceRecords?.length) return [];

  return evidenceRecords
    .map(r => ({
      event_id: r.event_id,
      cluster_id: r.cluster_id,
      contribution: Math.abs((r.raw_evidence_score || 0) * (r.weight || 1)),
      direction: (r.raw_evidence_score || 0) >= 0 ? 'bullish' : 'bearish',
      raw_evidence_score: r.raw_evidence_score,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, limit);
}

/**
 * Build explainability output at the requested level.
 *
 * @param {string} level - 'full' | 'summary' | 'decision_only'
 * @param {Object} params
 * @returns {Object} Explainability output
 */
export function buildExplainabilityOutput(level, {
  v6Result = {},
  evidenceRecords = [],
  clusterScores = [],
  riskResult = {},
  regimeResult = {},
  stressResult = {},
  confidenceResult = {},
} = {}) {
  if (level === EXPLAINABILITY_LEVEL.DECISION_ONLY) {
    return {
      level: 'decision_only',
      bucket: v6Result.bucket ?? null,
      hold_state: v6Result.hold_state ?? null,
      crash_state: stressResult.crash_state ?? 'normal',
      emergency_override: v6Result.emergency_override ?? null,
    };
  }

  const topContributors = computeTopContributors(evidenceRecords);

  if (level === EXPLAINABILITY_LEVEL.SUMMARY) {
    return {
      level: 'summary',
      bias_score: v6Result.bias_score ?? null,
      bucket: v6Result.bucket ?? null,
      hold_state: v6Result.hold_state ?? null,
      final_decision_score: v6Result.final_decision_score ?? null,
      confidence: confidenceResult.raw_confidence ?? null,
      crash_state: stressResult.crash_state ?? 'normal',
      top_contributors: topContributors,
      key_risks: {
        tail_risk_penalty: riskResult.tail_risk_penalty ?? null,
        execution_cost_penalty: riskResult.execution_cost_penalty ?? null,
        stress_score: stressResult.stress_score ?? null,
      },
      insufficient_evidence: v6Result.insufficient_evidence_flag ?? false,
      emergency_override: v6Result.emergency_override ?? null,
    };
  }

  // FULL level
  return {
    level: 'full',
    decision: {
      bias_score: v6Result.bias_score ?? null,
      bucket: v6Result.bucket ?? null,
      hold_state: v6Result.hold_state ?? null,
      final_decision_score: v6Result.final_decision_score ?? null,
      insufficient_evidence: v6Result.insufficient_evidence_flag ?? false,
      entry_relevance: v6Result.entry_relevance ?? null,
      hold_relevance: v6Result.hold_relevance ?? null,
    },
    evidence: {
      total_records: evidenceRecords.length,
      top_contributors: topContributors,
      all_scores: evidenceRecords.map(r => ({
        event_id: r.event_id,
        cluster_id: r.cluster_id,
        raw_evidence_score: r.raw_evidence_score,
        freshness_multiplier: r.freshness_multiplier,
        stability_score: r.stability_score,
        direction: r.direction,
      })),
    },
    clusters: {
      scores: clusterScores,
      agreement_score: v6Result.cluster_agreement_score ?? null,
    },
    regime: {
      regime_tag: regimeResult.regime_tag ?? regimeResult.regime ?? null,
      regime_confidence: regimeResult.regime_confidence ?? null,
      regime_stability: regimeResult.regime_stability ?? null,
      transition_state: regimeResult.transition_state ?? null,
    },
    stress: {
      stress_score: stressResult.stress_score ?? null,
      crash_state: stressResult.crash_state ?? 'normal',
      crash_velocity: stressResult.crash_velocity ?? null,
    },
    confidence: {
      raw_confidence: confidenceResult.raw_confidence ?? null,
      data_confidence_agg: confidenceResult.data_confidence_agg ?? null,
      market_predictability: confidenceResult.market_predictability ?? null,
      cross_horizon_consistency: confidenceResult.cross_horizon_consistency_score ?? null,
    },
    risk: {
      cvar_95: riskResult.cvar_95 ?? null,
      execution_cost_penalty: riskResult.execution_cost_penalty ?? null,
      tail_risk_penalty: riskResult.tail_risk_penalty ?? null,
      actionability_score: riskResult.actionability_score ?? null,
    },
    emergency: {
      override: v6Result.emergency_override ?? null,
      reasons: v6Result.emergency_reasons ?? [],
    },
  };
}
