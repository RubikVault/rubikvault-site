#!/usr/bin/env node
/**
 * QuantLab V1 — Daily Reweight
 * Computes per-segment performance using net outcomes and adjusts weights.
 * Run: node scripts/learning/quantlab-v1/daily-reweight.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readOutcomes } from '../../../functions/api/_shared/quantlab-v1/outcome-ledger.mjs';
import { readDecisions } from '../../../functions/api/_shared/quantlab-v1/decision-ledger.mjs';
import { loadLatestWeights, saveWeightSnapshot, getDefaultWeights } from '../../../functions/api/_shared/quantlab-v1/weight-history.mjs';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

const MAX_DAILY_ADJUSTMENT = 0.05;
const MIN_SAMPLES_FOR_ADJUST = 10;
const MIN_WEIGHT = 0.05;
const SOURCES = ['forecast', 'scientific', 'elliott', 'quantlab', 'breakout_v2', 'hist_probs'];

async function main() {
  const outcomes = readOutcomes({ matured: true });
  const decisions = readDecisions();

  if (outcomes.length < MIN_SAMPLES_FOR_ADJUST) {
    const msg = { timestamp: new Date().toISOString(), action: 'skip', reason: `only ${outcomes.length} matured outcomes (need ${MIN_SAMPLES_FOR_ADJUST})`, dry_run: DRY_RUN };
    process.stdout.write(JSON.stringify(msg, null, 2) + '\n');
    return;
  }

  const decisionMap = new Map(decisions.map(d => [d.decision_id, d]));
  const sourcePerf = {};
  for (const s of SOURCES) sourcePerf[s] = { correct: 0, total: 0, fp: 0, gross_sum: 0, net_sum: 0, friction_count: 0 };

  for (const outcome of outcomes) {
    if (outcome.direction_correct == null) continue;
    const dec = decisionMap.get(outcome.decision_id);
    if (!dec || !dec.contracts) continue;

    for (const contract of dec.contracts) {
      const s = contract.source;
      if (!sourcePerf[s]) continue;
      sourcePerf[s].total++;
      if (outcome.direction_correct) sourcePerf[s].correct++;
      else if (dec.verdict === 'BUY' || dec.verdict === 'SELL') sourcePerf[s].fp++;

      // Prefer net outcome over gross
      const grossRet = outcome.outcome_5d ?? outcome.outcome_1d ?? null;
      const netRet = outcome.outcome_net_5d ?? outcome.outcome_net_1d ?? null;
      if (netRet != null) {
        sourcePerf[s].net_sum += netRet;
        sourcePerf[s].friction_count++;
      } else if (grossRet != null) {
        sourcePerf[s].gross_sum += grossRet;
      }
    }
  }

  const perfScores = {};
  for (const s of SOURCES) {
    const p = sourcePerf[s];
    if (p.total < MIN_SAMPLES_FOR_ADJUST) { perfScores[s] = null; continue; }
    const accuracy = p.correct / p.total;
    const fpRate = p.fp / p.total;
    perfScores[s] = accuracy * 0.7 - fpRate * 0.3;
  }

  const current = loadLatestWeights();
  const isFlat = typeof Object.values(current.weights)[0] === 'number';
  const flatWeights = isFlat ? { ...current.weights } : getDefaultWeights();
  const newWeights = { ...flatWeights };
  const changes = {};

  const validScores = Object.values(perfScores).filter(v => v != null);
  const avgPerf = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;

  for (const s of SOURCES) {
    if (perfScores[s] == null) { changes[s] = { action: 'hold', reason: 'insufficient_samples' }; continue; }
    const delta = Math.max(-MAX_DAILY_ADJUSTMENT, Math.min(MAX_DAILY_ADJUSTMENT, (perfScores[s] - avgPerf) * 0.1));
    const oldW = flatWeights[s] || getDefaultWeights()[s] || (1 / SOURCES.length);
    newWeights[s] = Math.max(MIN_WEIGHT, oldW + delta);
    changes[s] = { action: delta > 0.001 ? 'increase' : delta < -0.001 ? 'decrease' : 'hold', old_weight: oldW, new_weight: newWeights[s], delta, perf_score: perfScores[s], samples: sourcePerf[s].total };
  }

  const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
  if (total > 0) for (const s of SOURCES) newWeights[s] /= total;

  // Friction impact stats
  let totalGross = 0, totalNet = 0, frictionSamples = 0;
  for (const s of SOURCES) {
    totalGross += sourcePerf[s].gross_sum;
    totalNet += sourcePerf[s].net_sum;
    frictionSamples += sourcePerf[s].friction_count;
  }

  const version = `w-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  if (!DRY_RUN) saveWeightSnapshot(newWeights, { version, trigger: 'daily_reweight', fallback_level: 'none' });

  const report = {
    timestamp: new Date().toISOString(),
    matured_outcomes: outcomes.length,
    source_performance: sourcePerf,
    performance_scores: perfScores,
    weight_changes: changes,
    new_weights: newWeights,
    weights_version: version,
    friction_impact: {
      samples_with_net_outcome: frictionSamples,
      avg_gross: frictionSamples > 0 ? totalGross / frictionSamples : null,
      avg_net: frictionSamples > 0 ? totalNet / frictionSamples : null,
      gross_vs_net_delta: frictionSamples > 0 ? (totalGross - totalNet) / frictionSamples : null,
    },
    dry_run: DRY_RUN,
  };

  const reportDir = path.join(ROOT, 'mirrors/learning/quantlab-v1/reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  if (!DRY_RUN) fs.writeFileSync(path.join(reportDir, `reweight-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch(err => { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); });
