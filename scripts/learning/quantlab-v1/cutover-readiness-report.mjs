#!/usr/bin/env node
/**
 * QuantLab V1 — Cutover Readiness Report
 * Evaluates whether V1 is ready to replace legacy decision engine.
 * Run: node scripts/learning/quantlab-v1/cutover-readiness-report.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDecisions } from '../../../functions/api/_shared/quantlab-v1/decision-ledger.mjs';
import { readOutcomes } from '../../../functions/api/_shared/quantlab-v1/outcome-ledger.mjs';
import { loadWeightHistory } from '../../../functions/api/_shared/quantlab-v1/weight-history.mjs';
import { evaluateReadiness, getActiveMode } from '../../../functions/api/_shared/quantlab-v1/cutover-policy.mjs';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const TODAY = new Date().toISOString().slice(0, 10);

async function main() {
  const decisions = readDecisions();
  const outcomes = readOutcomes();
  const maturedOutcomes = outcomes.filter(o => o.matured);
  const weightHistory = loadWeightHistory(30);

  // Shadow run days: from earliest decision to today
  const earliest = decisions.reduce((min, d) => {
    const t = new Date(d.created_at).getTime();
    return t < min ? t : min;
  }, Date.now());
  const shadowDays = Math.floor((Date.now() - earliest) / 86400000);

  // Fallback rate
  const fallbackCount = decisions.filter(d => d.fallback_active).length;
  const fallbackRate = decisions.length > 0 ? fallbackCount / decisions.length : 1;

  // Governance violations
  const govViolations = decisions.filter(d =>
    (d.data_quality_flags || []).some(f =>
      f.includes('stale') || f.includes('missing') || f.includes('integrity')
    )
  ).length;

  // Verdict agreement (V1 vs legacy) — from decisions that have both
  const withBothVerdicts = decisions.filter(d => d.legacy_verdict && d.verdict);
  const agreementCount = withBothVerdicts.filter(d => d.verdict === d.legacy_verdict).length;
  const verdictAgreementRate = withBothVerdicts.length > 0
    ? agreementCount / withBothVerdicts.length
    : 1;

  // FP regression: V1 BUY false positive rate vs legacy
  const v1Buys = maturedOutcomes.filter(o => o.verdict === 'BUY');
  const v1FP = v1Buys.filter(o => o.direction_correct === false).length;
  const v1FPRate = v1Buys.length > 0 ? v1FP / v1Buys.length : 0;
  // Legacy FP rate would come from legacy outcomes — estimate as baseline
  const legacyFPRate = 0.3; // conservative baseline
  const fpRegression = v1FPRate - legacyFPRate;

  const metrics = {
    shadow_days: shadowDays,
    matured_outcomes: maturedOutcomes.length,
    fallback_rate: fallbackRate,
    governance_violations: govViolations,
    fp_regression: fpRegression,
    verdict_agreement_rate: verdictAgreementRate,
  };

  const readiness = evaluateReadiness(metrics);

  const report = {
    report_type: 'cutover_readiness',
    date: TODAY,
    timestamp: new Date().toISOString(),
    current_mode: getActiveMode(),
    metrics,
    readiness,
    summary: {
      total_decisions: decisions.length,
      total_outcomes: outcomes.length,
      matured_outcomes: maturedOutcomes.length,
      weight_snapshots: weightHistory.length,
      v1_fp_rate: v1FPRate,
      legacy_fp_rate_baseline: legacyFPRate,
    },
    dry_run: DRY_RUN,
  };

  const reportDir = path.join(ROOT, 'mirrors/learning/quantlab-v1/reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  if (!DRY_RUN) {
    fs.writeFileSync(
      path.join(reportDir, `cutover-readiness-${TODAY}.json`),
      JSON.stringify(report, null, 2) + '\n', 'utf8'
    );
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
