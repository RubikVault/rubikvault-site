import fs from 'node:fs/promises';
import path from 'node:path';
import {
  STOCK_ANALYZER_STATUS,
  STOCK_ANALYZER_THRESHOLDS,
  evaluateParity,
  evaluatePromotionEligibility,
} from './promotion-governance.mjs';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function ensureDir(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildReasonSummary({ parity, eligibility, metricsAvailable }) {
  if (eligibility.blockers.includes('kill_switch_force_v1')) return 'Kill switch forces V1 champion.';
  if (!parity.ok) return `Parity not reached: ${(parity.blockers || []).join(', ')}.`;
  if (!metricsAvailable) return 'Parity reached, but promotion metrics are not fully available yet.';
  if (eligibility.warnings.includes('manual_go_pending')) return 'All hard gates passed, waiting for manual GO.';
  if (eligibility.eligible) return `Eligible to promote ${eligibility.candidate}.`;
  return `Champion remains active: ${(eligibility.blockers || []).join(', ')}.`;
}

async function main() {
  const cfg = await readJson(path.join(REPO_ROOT, 'config/v2-gates.json'));
  const nonRegression = await readJson(path.join(REPO_ROOT, 'public/data/features-v4/reports/stock-analyzer-non-regression-gate.json'));
  const parity5 = await readJson(path.join(REPO_ROOT, 'public/data/features-v4/reports/stock-v4-local-vs-main-5ticker.json'));
  const learningLatest = await readJson(path.join(REPO_ROOT, 'mirrors/learning/reports/latest.json'));

  const total = Number(parity5?.summary?.total || 0);
  const baselinePresenceParityOk = total > 0 && Number(parity5?.summary?.baseline_presence_parity_ok || 0) >= total;
  const localContractOk = total > 0 && Number(parity5?.summary?.v4_local_contract_ok || 0) >= total;
  const parity = evaluateParity({
    nonRegressionPass: Boolean(nonRegression?.pass),
    baselinePresenceOk: baselinePresenceParityOk,
    localContractOk,
  });

  const stockAnalyzerMetrics = learningLatest?.features?.stock_analyzer || null;
  const predictionsTotal = toFiniteNumber(stockAnalyzerMetrics?.predictions_total);
  const accuracyAll = toFiniteNumber(stockAnalyzerMetrics?.accuracy_all);
  const brierAll = toFiniteNumber(stockAnalyzerMetrics?.brier_all);
  const coveragePct = toFiniteNumber(
    stockAnalyzerMetrics?.coverage_ratio
      ?? stockAnalyzerMetrics?.coverage_7d
      ?? stockAnalyzerMetrics?.coverage_per_day
  );
  const coverageRatio = coveragePct == null ? null : Math.max(0, Math.min(1, coveragePct / 100));
  const metricsAvailable = [predictionsTotal, accuracyAll, brierAll].every(Number.isFinite);

  const metrics = {
    accuracy_improved: false,
    accuracy_significant: false,
    calibration_not_worse: false,
    brier_not_worse: false,
    coverage_ratio_global: coverageRatio,
    predictions_made_global: predictionsTotal,
    leakage_pass: true,
    drift_blocked: false,
    segment_regression: false,
    regime_regression: false,
    accuracy_all: accuracyAll,
    brier_all: brierAll,
    source: metricsAvailable ? 'learning_report.features.stock_analyzer' : 'unavailable',
  };

  const eligibility = evaluatePromotionEligibility({
    parity,
    killSwitchForceV1: Boolean(cfg?.kill_switch_force_v1),
    manualGoRequired: cfg?.manual_go_required !== false,
    manualGoGranted: false,
    metrics,
    candidate: 'V4',
  });

  const report = {
    schema_version: 'stock-analyzer-promotion-readiness.v1',
    generated_at: new Date().toISOString(),
    status: eligibility.status,
    recommendation: eligibility.recommendation,
    manual_go_required: cfg?.manual_go_required !== false,
    kill_switch_force_v1: Boolean(cfg?.kill_switch_force_v1),
    promotion_state: cfg?.promotion_state || STOCK_ANALYZER_STATUS.PARITY_NOT_REACHED,
    parity: {
      status: parity.status,
      non_regression_pass: Boolean(nonRegression?.pass),
      baseline_presence_parity_ok: baselinePresenceParityOk,
      local_contract_ok: localContractOk,
      blockers: parity.blockers,
    },
    metrics_policy: STOCK_ANALYZER_THRESHOLDS,
    metrics_available: metricsAvailable,
    metrics,
    eligibility,
    reason_summary: buildReasonSummary({ parity, eligibility, metricsAvailable }),
  };

  const out = path.join(REPO_ROOT, 'public/data/reports/stock-analyzer-promotion-readiness.json');
  await ensureDir(out);
  await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`wrote ${path.relative(REPO_ROOT, out)}`);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
