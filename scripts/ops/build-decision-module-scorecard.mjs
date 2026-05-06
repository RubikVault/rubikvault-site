#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_LEARNING_REPORT = path.join(REPO_ROOT, 'mirrors/learning/reports/latest.json');
const DEFAULT_MONTHLY_REPORT = path.join(REPO_ROOT, 'mirrors/learning/reports/monthly/latest.json');
const DEFAULT_OUT = path.join(REPO_ROOT, 'public/data/status/decision-module-scorecard-latest.json');
const HORIZONS = ['1d', '5d', '20d'];
const MODULES = ['forecast', 'breakout', 'hist_probs', 'quantlab', 'scientific', 'fundamentals', 'stock_analyzer'];
const MIN_SAMPLE = Number(process.env.RV_MODULE_SCORECARD_MIN_SAMPLE || 100);

function parseArgs(argv) {
  const args = {
    learningReport: DEFAULT_LEARNING_REPORT,
    monthlyReport: DEFAULT_MONTHLY_REPORT,
    out: DEFAULT_OUT,
  };
  for (const arg of argv) {
    if (arg.startsWith('--learning-report=')) args.learningReport = path.resolve(arg.slice('--learning-report='.length));
    else if (arg.startsWith('--monthly-report=')) args.monthlyReport = path.resolve(arg.slice('--monthly-report='.length));
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice('--out='.length));
  }
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 4) {
  const n = toNumber(value);
  if (n == null) return null;
  return Number(n.toFixed(digits));
}

function metricFor(feature, horizon) {
  const bucket = feature?.by_horizon?.[horizon] || (horizon === '20d' ? feature?.by_horizon?.['20D'] : null) || null;
  const source = bucket || (horizon === '5d' ? feature : null);
  if (!source) {
    return {
      status: 'not_available',
      sample_n: 0,
      hit_rate: null,
      precision_50: null,
      brier: null,
      max_drawdown: null,
      regime_breakdown: {},
    };
  }
  const sampleN = Number(source.outcomes_resolved || source.predictions_total || 0);
  const hitRate = round(source.hit_rate_all ?? source.accuracy_all);
  return {
    status: sampleN > 0 ? (sampleN >= MIN_SAMPLE ? 'available' : 'low_sample') : 'not_available',
    sample_n: sampleN,
    hit_rate: hitRate,
    precision_50: round(source.precision_50 ?? source.precision_at_50),
    brier: round(source.brier_all),
    max_drawdown: null,
    regime_breakdown: {},
  };
}

function emptyModule(id, reason = 'no_learning_metrics') {
  return {
    id,
    status: 'not_available',
    reason,
    horizons: Object.fromEntries(HORIZONS.map((horizon) => [horizon, metricFor(null, horizon)])),
  };
}

function mapFeature(id, features = {}) {
  const feature = features?.[id] || null;
  if (!feature) return emptyModule(id);
  const horizons = Object.fromEntries(HORIZONS.map((horizon) => [horizon, metricFor(feature, horizon)]));
  const available = Object.values(horizons).filter((row) => row.status === 'available').length;
  return {
    id,
    name: feature.name || id,
    type: feature.type || null,
    status: available > 0 ? 'available' : 'low_sample_or_unavailable',
    source_meta: feature.source_meta || null,
    horizons,
  };
}

function buildWeights(modules) {
  const candidates = [];
  for (const module of modules) {
    const h5 = module.horizons?.['5d'] || module.horizons?.['20d'] || module.horizons?.['1d'] || null;
    const sampleN = Number(h5?.sample_n || 0);
    const quality = toNumber(h5?.precision_50 ?? h5?.hit_rate);
    if (sampleN >= MIN_SAMPLE && quality != null) {
      candidates.push({ id: module.id, sample_n: sampleN, quality: Math.max(0.01, quality) });
    }
  }
  const total = candidates.reduce((sum, row) => sum + row.quality, 0);
  const weights = {};
  for (const row of candidates) {
    weights[row.id] = round(row.quality / (total || 1), 4);
  }
  return {
    status: candidates.length >= 2 ? 'ready_for_review' : 'monitor_only',
    min_sample: MIN_SAMPLE,
    weights,
    candidates,
    runtime_active: false,
    rule: 'Weights are evidence recommendations only. Runtime adoption needs explicit feature flag and fallback.',
  };
}

function buildScorecard({ learningReport, monthlyReport }) {
  const features = learningReport?.features || {};
  const modules = MODULES.map((id) => mapFeature(id, features));
  return {
    schema: 'rv.decision_module_scorecard.v1',
    generated_at: new Date().toISOString(),
    target_market_date: learningReport?.target_market_date || learningReport?.date || null,
    source_reports: {
      learning_daily: learningReport?.generated_at ? 'mirrors/learning/reports/latest.json' : null,
      learning_monthly: monthlyReport?.generated_at ? 'mirrors/learning/reports/monthly/latest.json' : null,
    },
    horizons: HORIZONS,
    modules: Object.fromEntries(modules.map((module) => [module.id, module])),
    adaptive_aggregation: buildWeights(modules),
    acceptance: {
      ok: true,
      stale_actionable_policy: 'BUY/WAIT must not be actionable from stale module data; stale modules are cached/degraded only.',
      gaps: modules.filter((module) => module.status !== 'available').map((module) => module.id),
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const learningReport = readJson(args.learningReport);
  const monthlyReport = readJson(args.monthlyReport);
  const scorecard = buildScorecard({ learningReport, monthlyReport });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(scorecard, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    output: path.relative(REPO_ROOT, args.out),
    target_market_date: scorecard.target_market_date,
    modules: Object.keys(scorecard.modules).length,
    adaptive_status: scorecard.adaptive_aggregation.status,
  }, null, 2));
}

main();
