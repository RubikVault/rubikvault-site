#!/usr/bin/env node
/**
 * QuantLab V1 — Daily Audit Report
 * Generates internal detail + external compact reports with fallback + friction metrics.
 * Run: node scripts/learning/quantlab-v1/daily-audit-report.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDecisions } from '../../../functions/api/_shared/quantlab-v1/decision-ledger.mjs';
import { readOutcomes } from '../../../functions/api/_shared/quantlab-v1/outcome-ledger.mjs';
import { loadLatestWeights, loadWeightHistory } from '../../../functions/api/_shared/quantlab-v1/weight-history.mjs';
import { getActiveMode, evaluateReadiness } from '../../../functions/api/_shared/quantlab-v1/cutover-policy.mjs';
import { classifyOutcomeState } from '../../../functions/api/_shared/quantlab-v1/signal-lifecycle.mjs';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  const allDecisions = readDecisions();
  const allOutcomes = readOutcomes();
  const latestWeights = loadLatestWeights();
  const weightHistory = loadWeightHistory(5);

  const todayDecisions = allDecisions.filter(d => d.created_at?.startsWith(TODAY));
  const maturedOutcomes = allOutcomes.filter(o => o.matured);
  const recentMatured = maturedOutcomes.filter(o => (Date.now() - new Date(o.updated_at || 0).getTime()) < 7 * 86400000);

  // Verdict distribution
  const verdictCounts = { BUY: 0, WAIT: 0, SELL: 0 };
  for (const d of todayDecisions) verdictCounts[d.verdict] = (verdictCounts[d.verdict] || 0) + 1;

  // Hit rate
  const dirCorrect = maturedOutcomes.filter(o => o.direction_correct === true).length;
  const dirTotal = maturedOutcomes.filter(o => o.direction_correct != null).length;
  const hitRate = dirTotal > 0 ? dirCorrect / dirTotal : null;

  // Fallback distribution (D6)
  const fallbackDist = {};
  for (const d of todayDecisions) {
    const level = d.fallback_level || (d.fallback_active ? 'unknown_fallback' : 'exact');
    fallbackDist[level] = (fallbackDist[level] || 0) + 1;
  }

  // Under-sampled segments
  const segmentSamples = {};
  for (const d of allDecisions) {
    const seg = `${d.horizon}/${d.asset_class}/${d.volatility_bucket}`;
    segmentSamples[seg] = (segmentSamples[seg] || 0) + 1;
  }
  const underSampled = Object.entries(segmentSamples)
    .filter(([, n]) => n < 20)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([seg, n]) => ({ segment: seg, samples: n }));

  // Governance flags
  const allFlags = todayDecisions.flatMap(d => d.data_quality_flags || []);
  const flagCounts = {};
  for (const f of allFlags) flagCounts[f] = (flagCounts[f] || 0) + 1;

  // Regime transition count
  const regimeTransitionCount = todayDecisions.filter(d => d.regime_transition_active).length;

  // Weight changes
  const weightChanges = [];
  if (weightHistory.length >= 2) {
    const prev = weightHistory[weightHistory.length - 2];
    const curr = weightHistory[weightHistory.length - 1];
    if (prev?.weights && curr?.weights) {
      for (const [source, newW] of Object.entries(curr.weights)) {
        if (typeof newW === 'number') {
          const oldW = prev.weights[source];
          if (typeof oldW === 'number' && Math.abs(newW - oldW) > 0.001) {
            weightChanges.push({ source, old: oldW, new: newW, delta: newW - oldW });
          }
        }
      }
    }
  }

  // Friction impact
  const executedOutcomes = maturedOutcomes.filter(o => o.entry_triggered);
  const frictionData = executedOutcomes.filter(o => o.estimated_slippage != null);
  const avgSpread = frictionData.length > 0 ? frictionData.reduce((s, o) => s + (o.spread_at_signal_time || 0), 0) / frictionData.length : null;
  const avgSlippage = frictionData.length > 0 ? frictionData.reduce((s, o) => s + (o.estimated_slippage || 0), 0) / frictionData.length : null;

  // Expired without entry
  const expiredCount = allOutcomes.filter(o => o.expired_without_entry).length;

  // Integrity verification
  const integrityCount = allDecisions.filter(d => d.decision_record_hash).length;

  // Lifecycle distribution
  const lifecycleDist = { emitted: 0, entry_triggered: 0, expired_without_entry: 0, invalidated_before_entry: 0, executed_and_matured: 0, unknown: 0 };
  for (const o of allOutcomes) {
    const state = classifyOutcomeState(o);
    lifecycleDist[state] = (lifecycleDist[state] || 0) + 1;
  }

  // Evidence quality across today's contracts
  const allContracts = todayDecisions.flatMap(d => d.contracts || []);
  const eqComposites = allContracts.map(c => c.evidence_quality?.composite).filter(v => typeof v === 'number');
  const avgEvidenceQuality = eqComposites.length > 0 ? eqComposites.reduce((a, b) => a + b, 0) / eqComposites.length : null;
  const eqBySource = {};
  for (const c of allContracts) {
    const eq = c.evidence_quality?.composite;
    if (typeof eq === 'number') {
      if (!eqBySource[c.source]) eqBySource[c.source] = { sum: 0, count: 0 };
      eqBySource[c.source].sum += eq;
      eqBySource[c.source].count++;
    }
  }
  const eqPerSource = {};
  for (const [src, { sum, count }] of Object.entries(eqBySource)) eqPerSource[src] = Number((sum / count).toFixed(3));
  const lowQualityContracts = allContracts.filter(c => (c.evidence_quality?.composite ?? 1) < 0.3);

  // Regime quality
  const regimeFlags = allContracts.flatMap(c => c.data_quality_flags || []);
  const contractsWithUniformProbs = regimeFlags.filter(f => f === 'uniform_regime_probs').length;
  const contractsWithMissingProbs = regimeFlags.filter(f => f === 'missing_regime_probs').length;

  // Top sources by weight
  const topSources = latestWeights.weights
    ? Object.entries(latestWeights.weights)
        .filter(([, v]) => typeof v === 'number')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k)
    : [];

  // Cutover readiness
  const cutoverReadiness = evaluateReadiness({
    matured_outcomes: maturedOutcomes.length,
    hit_rate: hitRate,
    avg_slippage: avgSlippage,
    integrity_pct: allDecisions.length > 0 ? integrityCount / allDecisions.length : 0,
    days_in_shadow: null,
    fallback_pct: todayDecisions.length > 0 ? todayDecisions.filter(d => d.fallback_active).length / todayDecisions.length : 0,
  });

  const internalReport = {
    report_type: 'internal',
    date: TODAY,
    timestamp: new Date().toISOString(),
    mode: getActiveMode(),
    decision_summary: {
      total_today: todayDecisions.length,
      verdict_distribution: verdictCounts,
      fallback_active_count: todayDecisions.filter(d => d.fallback_active).length,
    },
    fallback_metrics: {
      decisions_by_fallback_level: fallbackDist,
      top_undersampled_segments: underSampled,
    },
    learning_summary: {
      matured_outcomes_total: maturedOutcomes.length,
      matured_recent_7d: recentMatured.length,
      hit_rate: hitRate,
      expired_without_entry: expiredCount,
    },
    friction_impact: {
      executed_signals: executedOutcomes.length,
      signals_with_friction_data: frictionData.length,
      avg_spread: avgSpread,
      avg_slippage: avgSlippage,
    },
    regime_transitions: {
      active_today: regimeTransitionCount,
    },
    weight_state: {
      current_version: latestWeights.version,
      current_weights: latestWeights.weights,
      recent_changes: weightChanges,
      fallback_level: latestWeights.fallback_level,
    },
    evidence_quality: {
      avg_composite: avgEvidenceQuality,
      per_source: eqPerSource,
      low_quality_count: lowQualityContracts.length,
      low_quality_sources: [...new Set(lowQualityContracts.map(c => c.source))],
    },
    regime_quality: {
      contracts_with_default_probs: contractsWithUniformProbs,
      contracts_with_missing_probs: contractsWithMissingProbs,
      total_contracts: allContracts.length,
    },
    governance_flags: flagCounts,
    integrity: {
      decisions_with_hash: integrityCount,
      total_decisions: allDecisions.length,
    },
    lifecycle_distribution: lifecycleDist,
    cutover_readiness: cutoverReadiness,
  };

  // INTERNAL-ONLY: lifecycle_distribution, cutover_readiness, evidence_quality, regime_quality, integrity, weight_state
  // EXTERNAL: signals_today, verdict_distribution, hit_rate_matured, governance_warnings, fallback_usage, regime_transition_active, mode, top_sources, avg_evidence_quality, friction_impact_avg
  const externalReport = {
    report_type: 'external',
    date: TODAY,
    timestamp: new Date().toISOString(),
    mode: getActiveMode(),
    signals_today: todayDecisions.length,
    verdict_distribution: verdictCounts,
    hit_rate_matured: hitRate != null ? Number(hitRate.toFixed(3)) : null,
    matured_signals: maturedOutcomes.length,
    top_sources: topSources.length > 0 ? topSources : null,
    avg_evidence_quality: avgEvidenceQuality != null ? Number(avgEvidenceQuality.toFixed(3)) : null,
    top_weight_changes: weightChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3),
    governance_warnings: Object.keys(flagCounts).length > 0 ? flagCounts : null,
    fallback_usage: Object.keys(fallbackDist).length > 0 ? fallbackDist : null,
    regime_transition_active: regimeTransitionCount > 0,
    friction_impact_avg: avgSlippage != null ? `$${avgSlippage.toFixed(4)}` : null,
  };

  const reportDir = path.join(ROOT, 'mirrors/learning/quantlab-v1/reports');
  const publicDir = path.join(ROOT, 'public/data/reports');

  if (!DRY_RUN) {
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, `${TODAY}-internal.json`), JSON.stringify(internalReport, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(publicDir, 'quantlab-v1-latest.json'), JSON.stringify(externalReport, null, 2) + '\n', 'utf8');
  }

  process.stdout.write(JSON.stringify({ internal: internalReport, external: externalReport }, null, 2) + '\n');
}

main().catch(err => { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); });
