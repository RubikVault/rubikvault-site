/**
 * Capital Rotation Monitor — Scoring Engine
 */

import { PARAMS_V1 } from './params.js';

/**
 * Compute Risk-Adjusted Momentum (RAM).
 * RAM(window) = ratio_return_window / rolling_volatility
 * Composite = weighted average across windows.
 * @param {Object<number,number|null>} returns - window→return map
 * @param {number|null} rollingVol
 * @param {Object<number,number>} weights
 * @returns {{composite:number, components:Object<number,number|null>}}
 */
export function computeRAM(returns, rollingVol, weights = PARAMS_V1.ramWeights) {
  const components = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [window, weight] of Object.entries(weights)) {
    const w = Number(window);
    const ret = returns[w];
    if (ret == null || rollingVol == null || rollingVol < 1e-8) {
      components[w] = null;
      continue;
    }
    const ram = ret / rollingVol;
    components[w] = ram;
    weightedSum += ram * weight;
    totalWeight += weight;
  }

  const composite = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { composite, components };
}

/**
 * Map RAM composite to 0-100 score.
 * RAM typically ranges from -5 to +5; map to 0-100.
 */
export function ramToScore(ram) {
  const clamped = Math.max(-5, Math.min(5, ram));
  return Math.round(((clamped + 5) / 10) * 100);
}

/**
 * Map trend slope to 0-100 score.
 */
export function trendToScore(slope) {
  if (slope == null) return 50;
  const clamped = Math.max(-0.02, Math.min(0.02, slope));
  return Math.round(((clamped + 0.02) / 0.04) * 100);
}

/**
 * Compute ratio composite score from components.
 */
export function computeRatioComposite(ramScore, percentileScore, zScoreMapped, trendScore, weights = PARAMS_V1.compositeWeights) {
  const w = weights;
  const pctScore = percentileScore ?? 50;
  const score = w.ramScore * ramScore
    + w.currentRegimePercentileScore * pctScore
    + w.zScoreMapped * zScoreMapped
    + w.trendDirectionScore * trendScore;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Compute block score from ratio composites.
 * @param {Object<string, {composite:number}>} ratioResults - ratioId → result
 * @param {string[]} ratioIds - IDs belonging to this block
 * @returns {{score:number, count:number, available:number}}
 */
export function computeBlockScore(ratioResults, ratioIds) {
  let sum = 0, count = 0;
  for (const id of ratioIds) {
    const r = ratioResults[id];
    if (r && Number.isFinite(r.composite)) {
      sum += r.composite;
      count++;
    }
  }
  return {
    score: count > 0 ? Math.round(sum / count) : 50,
    count,
    available: ratioIds.length
  };
}

/**
 * Compute global rotation score from block scores.
 */
export function computeGlobalScore(blockScores, weights = PARAMS_V1.blockWeights) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [blockId, weight] of Object.entries(weights)) {
    const block = blockScores[blockId];
    if (block && Number.isFinite(block.score)) {
      weightedSum += block.score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
}

/**
 * Classify regime from score 0-100.
 */
export function classifyRegime(score) {
  if (score <= 20) return 'Deep Risk-Off';
  if (score <= 40) return 'Cautious';
  if (score <= 60) return 'Neutral';
  if (score <= 80) return 'Risk-On';
  return 'Extreme Risk-On';
}

/**
 * Compute confidence score 0-1.
 */
export function computeConfidence(blockScores, coverage, staleDays, divergenceCount = 0) {
  // Block agreement: how consistent are block scores?
  const scores = Object.values(blockScores).map(b => b.score).filter(Number.isFinite);
  const blockStd = scores.length > 1
    ? Math.sqrt(scores.reduce((a, s) => a + (s - scores.reduce((x, y) => x + y, 0) / scores.length) ** 2, 0) / (scores.length - 1))
    : 0;
  const agreementPenalty = Math.min(blockStd / 50, 0.3); // max 0.3 penalty

  // Coverage bonus
  const coverageBonus = Math.min(coverage, 1);

  // Staleness penalty
  let stalenessPenalty = 0;
  if (staleDays >= PARAMS_V1.staleTradingDaysHard) stalenessPenalty = 0.3;
  else if (staleDays >= PARAMS_V1.staleTradingDaysSoft) stalenessPenalty = 0.15;

  // Divergence penalty
  const divPenalty = Math.min(divergenceCount * 0.05, 0.2);

  const raw = 0.5 + (coverageBonus * 0.3) - agreementPenalty - stalenessPenalty - divPenalty;
  return Math.max(0, Math.min(1, Math.round(raw * 100) / 100));
}

/**
 * Classify confidence label.
 */
export function classifyConfidence(score) {
  const t = PARAMS_V1.confidenceThresholds;
  if (score >= t.high) return 'High';
  if (score >= t.medium) return 'Medium';
  if (score >= t.mixed) return 'Mixed';
  return 'Low';
}

/**
 * Resolve neutral mode.
 */
export function resolveNeutralMode(globalScore, blockScores) {
  const { neutralRangeLow, neutralRangeHigh } = PARAMS_V1;
  if (globalScore < neutralRangeLow || globalScore > neutralRangeHigh) return 'none';

  const scores = Object.values(blockScores).map(b => b.score).filter(Number.isFinite);
  if (scores.length < 2) return 'quiet';
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  return (max - min) > 30 ? 'conflicted' : 'quiet';
}

/**
 * Detect factor concentration (cluster overweight penalty).
 * Returns 0-0.15 penalty.
 */
export function factorConcentrationPenalty(ratioResults) {
  const clusterScores = {};
  for (const [id, result] of Object.entries(ratioResults)) {
    const cluster = result.riskCluster;
    if (!cluster) continue;
    if (!clusterScores[cluster]) clusterScores[cluster] = [];
    clusterScores[cluster].push(result.composite);
  }

  // If any cluster has >4 ratios, slight penalty
  let penalty = 0;
  for (const scores of Object.values(clusterScores)) {
    if (scores.length > 4) {
      penalty = Math.max(penalty, (scores.length - 4) * 0.03);
    }
  }
  return Math.min(penalty, 0.15);
}
