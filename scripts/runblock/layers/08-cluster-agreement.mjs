/**
 * V6.0 — Layer 8: Cluster Agreement
 *
 * Intra-cluster redundancy, conflict detection, and agreement scoring.
 */

/**
 * Compute intra-cluster redundancy adjustment.
 * When correlation > 0.70, weaker event is dampened.
 *
 * @param {Array} evidenceRecords - [{ event_id, cluster_id, raw_evidence_score, correlation_to_peers }]
 * @returns {Array} Records with redundancy_adjustment applied
 */
export function computeIntraClusterRedundancy(evidenceRecords) {
  if (!evidenceRecords || evidenceRecords.length < 2) return evidenceRecords || [];

  const sorted = [...evidenceRecords].sort((a, b) =>
    Math.abs(b.raw_evidence_score || 0) - Math.abs(a.raw_evidence_score || 0)
  );

  return sorted.map((record, idx) => {
    if (idx === 0) return { ...record, redundancy_adjustment: 1.0 };

    const strongerRecords = sorted.slice(0, idx);
    let maxCorr = 0;
    for (const stronger of strongerRecords) {
      if (stronger.cluster_id === record.cluster_id) {
        const corr = record.correlation_to_peers ?? 0;
        maxCorr = Math.max(maxCorr, corr);
      }
    }

    let adjustment = 1.0;
    if (maxCorr > 0.70) {
      adjustment = 1 - ((maxCorr - 0.70) / 0.30) * 0.5;
      adjustment = Math.max(0.5, adjustment);
    }

    return {
      ...record,
      redundancy_adjustment: Number(adjustment.toFixed(4)),
      adjusted_evidence_score: Number(((record.raw_evidence_score || 0) * adjustment).toFixed(6)),
    };
  });
}

/**
 * Detect intra-cluster conflicts (opposing signals).
 *
 * @param {Array} evidenceRecords - [{ event_id, cluster_id, direction, correlation_to_peers }]
 * @returns {{ conflicts: Array, has_conflicts: boolean }}
 */
export function detectClusterConflicts(evidenceRecords) {
  const conflicts = [];

  for (let i = 0; i < evidenceRecords.length; i++) {
    for (let j = i + 1; j < evidenceRecords.length; j++) {
      const a = evidenceRecords[i];
      const b = evidenceRecords[j];

      if (a.cluster_id !== b.cluster_id) continue;

      const corr = Math.min(a.correlation_to_peers ?? 0, b.correlation_to_peers ?? 0);
      if (corr < -0.40) {
        conflicts.push({
          event_a: a.event_id,
          event_b: b.event_id,
          cluster_id: a.cluster_id,
          correlation: corr,
          severity: Math.abs(corr),
          conflict_type: 'DIRECTIONAL_OPPOSITION',
        });
      }

      if (a.direction && b.direction && a.direction !== b.direction) {
        conflicts.push({
          event_a: a.event_id,
          event_b: b.event_id,
          cluster_id: a.cluster_id,
          severity: 0.5,
          conflict_type: 'DIRECTION_MISMATCH',
        });
      }
    }
  }

  return { conflicts, has_conflicts: conflicts.length > 0 };
}

/**
 * Compute cluster agreement score.
 *
 * cluster_agreement_score = 1 - weighted_directional_disagreement
 *
 * @param {Array} clusterScores - [{ cluster_id, direction_numeric, weight }]
 *   direction_numeric: +1 for bullish, -1 for bearish, 0 for neutral
 * @returns {{ cluster_agreement_score: number, dominant_direction: string }}
 */
export function computeClusterAgreementScore(clusterScores) {
  if (!clusterScores || clusterScores.length === 0) {
    return { cluster_agreement_score: 0.5, dominant_direction: 'neutral' };
  }

  let totalWeight = 0;
  let weightedDirection = 0;
  let weightedAbsDirection = 0;

  for (const cs of clusterScores) {
    const w = Math.abs(cs.weight || 1);
    const d = cs.direction_numeric || 0;
    totalWeight += w;
    weightedDirection += w * d;
    weightedAbsDirection += w * Math.abs(d);
  }

  if (totalWeight === 0) return { cluster_agreement_score: 0.5, dominant_direction: 'neutral' };

  const avgDirection = weightedDirection / totalWeight;
  const avgAbsDirection = weightedAbsDirection / totalWeight;

  // Disagreement: when avgDirection ≈ 0 but avgAbsDirection >> 0, there's disagreement
  const disagreement = avgAbsDirection > 0
    ? 1 - Math.abs(avgDirection) / avgAbsDirection
    : 0;

  const agreement = Number(Math.max(0, Math.min(1, 1 - disagreement)).toFixed(4));
  const dominant = avgDirection > 0.1 ? 'bullish' : avgDirection < -0.1 ? 'bearish' : 'neutral';

  return { cluster_agreement_score: agreement, dominant_direction: dominant };
}

/**
 * Neutralize cross-cluster conflicts.
 * When 2+ clusters disagree strongly (opposite directions, both weight > threshold),
 * dampen both sides proportionally and reduce confidence.
 *
 * @param {Array} clusterScores - [{ cluster_id, direction_numeric, weight }]
 * @param {number} [weightThreshold=0.3] - Minimum weight for conflict detection
 * @returns {{ neutralized_scores: Array, conflict_penalty: number, conflict_pairs: Array }}
 */
export function neutralizeCrossClusterConflicts(clusterScores, weightThreshold = 0.3) {
  if (!clusterScores || clusterScores.length < 2) {
    return { neutralized_scores: clusterScores || [], conflict_penalty: 0, conflict_pairs: [] };
  }

  const conflictPairs = [];
  const significantClusters = clusterScores.filter(cs => Math.abs(cs.weight || 0) >= weightThreshold);

  for (let i = 0; i < significantClusters.length; i++) {
    for (let j = i + 1; j < significantClusters.length; j++) {
      const a = significantClusters[i];
      const b = significantClusters[j];

      if (Math.sign(a.direction_numeric || 0) !== 0 &&
          Math.sign(b.direction_numeric || 0) !== 0 &&
          Math.sign(a.direction_numeric) !== Math.sign(b.direction_numeric)) {
        conflictPairs.push({
          cluster_a: a.cluster_id,
          cluster_b: b.cluster_id,
          direction_a: a.direction_numeric,
          direction_b: b.direction_numeric,
        });
      }
    }
  }

  if (conflictPairs.length === 0) {
    return { neutralized_scores: clusterScores, conflict_penalty: 0, conflict_pairs: [] };
  }

  const conflictingIds = new Set();
  for (const pair of conflictPairs) {
    conflictingIds.add(pair.cluster_a);
    conflictingIds.add(pair.cluster_b);
  }

  const dampeningFactor = Math.max(0.3, 1 - 0.2 * conflictPairs.length);
  const neutralized = clusterScores.map(cs => {
    if (conflictingIds.has(cs.cluster_id)) {
      return {
        ...cs,
        weight: Number(((cs.weight || 1) * dampeningFactor).toFixed(4)),
        conflict_dampened: true,
      };
    }
    return cs;
  });

  return {
    neutralized_scores: neutralized,
    conflict_penalty: Number((1 - dampeningFactor).toFixed(4)),
    conflict_pairs: conflictPairs,
  };
}
