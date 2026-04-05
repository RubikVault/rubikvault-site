#!/usr/bin/env node
/**
 * QuantLab V1 — Daily Reweight
 * Computes segmented source performance and writes segment-specific weights.
 * Run: node scripts/learning/quantlab-v1/daily-reweight.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readOutcomes } from '../../../functions/api/_shared/quantlab-v1/outcome-ledger.mjs';
import { readDecisions } from '../../../functions/api/_shared/quantlab-v1/decision-ledger.mjs';
import {
  loadLatestWeights,
  saveWeightSnapshot,
  getDefaultWeights,
  getSegmentNode,
  isFlatWeights,
} from '../../../functions/api/_shared/quantlab-v1/weight-history.mjs';
import { buildAssetSegmentationProfile } from '../../../functions/api/_shared/asset-segmentation.mjs';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

const MAX_DAILY_ADJUSTMENT = 0.05;
const MIN_SAMPLES_FOR_ADJUST = 10;
const MIN_WEIGHT = 0.05;
const SOURCES = ['forecast', 'scientific', 'elliott', 'quantlab', 'breakout_v2', 'hist_probs'];

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildSegmentContext(decision = {}, outcome = {}) {
  const baseSegmentation = decision?.segmentation && typeof decision.segmentation === 'object'
    ? decision.segmentation
    : outcome?.segmentation && typeof outcome.segmentation === 'object'
      ? outcome.segmentation
      : buildAssetSegmentationProfile({
        ticker: decision?.symbol || outcome?.symbol || null,
        assetClass: decision?.asset_class || outcome?.asset_class || 'stock',
        marketCapUsd: decision?.market_cap_usd ?? outcome?.market_cap_usd ?? null,
        liquidityScore: null,
        liquidityState: null,
      });

  return {
    horizon: String(decision?.horizon || outcome?.horizon || 'all').trim() || 'all',
    asset_class: String(baseSegmentation?.asset_class || decision?.asset_class || outcome?.asset_class || 'stock').trim() || 'stock',
    liquidity_bucket: String(baseSegmentation?.liquidity_bucket || decision?.liquidity_bucket || outcome?.liquidity_bucket || 'unknown').trim() || 'unknown',
    market_cap_bucket: String(baseSegmentation?.market_cap_bucket || decision?.market_cap_bucket || outcome?.market_cap_bucket || 'unknown').trim() || 'unknown',
    learning_lane: String(baseSegmentation?.learning_lane || decision?.learning_lane || outcome?.learning_lane || 'core').trim() || 'core',
    regime_bucket: String(decision?.regime_bucket || outcome?.regime_tag || 'all').trim() || 'all',
    blue_chip_core: baseSegmentation?.blue_chip_core === true,
  };
}

function segmentKey(segment) {
  return [
    segment.horizon,
    segment.asset_class,
    segment.liquidity_bucket,
    segment.market_cap_bucket,
    segment.learning_lane,
    segment.regime_bucket,
  ].join('|');
}

function readBaseWeights(snapshot, segment) {
  if (!snapshot?.weights) return getDefaultWeights();
  if (isFlatWeights(snapshot.weights)) return { ...snapshot.weights };
  const node = getSegmentNode(snapshot.weights, segment);
  if (!node || typeof node !== 'object') return getDefaultWeights();
  const selected = {};
  let hasAny = false;
  for (const source of SOURCES) {
    if (typeof node[source] === 'number') {
      selected[source] = node[source];
      hasAny = true;
    }
  }
  return hasAny ? selected : getDefaultWeights();
}

function ensureLeaf(root, segment) {
  root[segment.horizon] ||= {};
  root[segment.horizon][segment.asset_class] ||= {};
  root[segment.horizon][segment.asset_class][segment.liquidity_bucket] ||= {};
  root[segment.horizon][segment.asset_class][segment.liquidity_bucket][segment.market_cap_bucket] ||= {};
  root[segment.horizon][segment.asset_class][segment.liquidity_bucket][segment.market_cap_bucket][segment.learning_lane] ||= {};
  root[segment.horizon][segment.asset_class][segment.liquidity_bucket][segment.market_cap_bucket][segment.learning_lane][segment.regime_bucket] ||= {};
  return root[segment.horizon][segment.asset_class][segment.liquidity_bucket][segment.market_cap_bucket][segment.learning_lane][segment.regime_bucket];
}

async function main() {
  const outcomes = readOutcomes({ matured: true });
  const decisions = readDecisions();

  if (outcomes.length < MIN_SAMPLES_FOR_ADJUST) {
    const msg = { timestamp: new Date().toISOString(), action: 'skip', reason: `only ${outcomes.length} matured outcomes (need ${MIN_SAMPLES_FOR_ADJUST})`, dry_run: DRY_RUN };
    process.stdout.write(JSON.stringify(msg, null, 2) + '\n');
    return;
  }

  const decisionMap = new Map(decisions.map((decision) => [decision.decision_id, decision]));
  const segmentPerf = new Map();

  for (const outcome of outcomes) {
    if (outcome.direction_correct == null) continue;
    const decision = decisionMap.get(outcome.decision_id);
    if (!decision || !decision.contracts) continue;
    const segment = buildSegmentContext(decision, outcome);
    const key = segmentKey(segment);
    if (!segmentPerf.has(key)) {
      const sourcePerf = {};
      for (const source of SOURCES) sourcePerf[source] = { correct: 0, total: 0, fp: 0, gross_sum: 0, net_sum: 0, friction_count: 0 };
      segmentPerf.set(key, { segment, sourcePerf });
    }
    const entry = segmentPerf.get(key);
    for (const contract of decision.contracts) {
      const source = contract.source;
      if (!entry.sourcePerf[source]) continue;
      entry.sourcePerf[source].total++;
      if (outcome.direction_correct) entry.sourcePerf[source].correct++;
      else if (decision.verdict === 'BUY' || decision.verdict === 'SELL') entry.sourcePerf[source].fp++;

      const grossRet = outcome.outcome_5d ?? outcome.outcome_1d ?? null;
      const netRet = outcome.outcome_net_5d ?? outcome.outcome_net_1d ?? outcome.realized_return_net ?? null;
      if (netRet != null) {
        entry.sourcePerf[source].net_sum += netRet;
        entry.sourcePerf[source].friction_count++;
      } else if (grossRet != null) {
        entry.sourcePerf[source].gross_sum += grossRet;
      }
    }
  }

  const current = loadLatestWeights();
  const newWeights = {};
  const segmentReports = [];

  for (const { segment, sourcePerf } of segmentPerf.values()) {
    const perfScores = {};
    for (const source of SOURCES) {
      const perf = sourcePerf[source];
      if (perf.total < MIN_SAMPLES_FOR_ADJUST) {
        perfScores[source] = null;
        continue;
      }
      const accuracy = perf.correct / perf.total;
      const fpRate = perf.fp / perf.total;
      perfScores[source] = accuracy * 0.7 - fpRate * 0.3;
    }

    const validScores = Object.values(perfScores).filter((value) => value != null);
    if (!validScores.length) continue;

    const avgPerf = validScores.reduce((sum, value) => sum + value, 0) / validScores.length;
    const baseWeights = readBaseWeights(current, segment);
    const segmentWeights = { ...baseWeights };
    const changes = {};

    for (const source of SOURCES) {
      if (perfScores[source] == null) {
        changes[source] = { action: 'hold', reason: 'insufficient_samples' };
        continue;
      }
      const delta = Math.max(-MAX_DAILY_ADJUSTMENT, Math.min(MAX_DAILY_ADJUSTMENT, (perfScores[source] - avgPerf) * 0.1));
      const oldWeight = baseWeights[source] || getDefaultWeights()[source] || (1 / SOURCES.length);
      segmentWeights[source] = Math.max(MIN_WEIGHT, oldWeight + delta);
      changes[source] = {
        action: delta > 0.001 ? 'increase' : delta < -0.001 ? 'decrease' : 'hold',
        old_weight: oldWeight,
        new_weight: segmentWeights[source],
        delta,
        perf_score: perfScores[source],
        samples: sourcePerf[source].total,
      };
    }

    const total = Object.values(segmentWeights).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      for (const source of SOURCES) segmentWeights[source] /= total;
    }

    const leaf = ensureLeaf(newWeights, segment);
    for (const source of SOURCES) leaf[source] = segmentWeights[source];
    leaf._sample_count = Object.values(sourcePerf).reduce((sum, perf) => sum + perf.total, 0);
    leaf._blue_chip_core = segment.blue_chip_core === true;

    segmentReports.push({
      segment,
      source_performance: sourcePerf,
      performance_scores: perfScores,
      weight_changes: changes,
      weights: segmentWeights,
    });
  }

  const version = `w-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  if (!DRY_RUN) {
    saveWeightSnapshot(newWeights, {
      version,
      trigger: 'daily_reweight_segmented',
      fallback_level: 'segmented',
      segment_schema_version: 'v2_asset_liquidity_marketcap_lane_regime',
    });
  }

  const report = {
    timestamp: new Date().toISOString(),
    matured_outcomes: outcomes.length,
    weights_version: version,
    segment_schema_version: 'v2_asset_liquidity_marketcap_lane_regime',
    segments_trained: segmentReports.length,
    segment_reports: segmentReports,
    dry_run: DRY_RUN,
  };

  const reportDir = path.join(ROOT, 'mirrors/learning/quantlab-v1/reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  if (!DRY_RUN) fs.writeFileSync(path.join(reportDir, `reweight-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
