#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, nowIso, writeJsonAtomic, REPO_ROOT, toFinite } from './lib/common.mjs';

const SSOT_SYMBOLS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const FEATURE_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/feature_stock_universe_report.json');
const COVERAGE_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/coverage_progress.json');
const FORECAST_PACK_COVERAGE_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_coverage.json');
const FORECAST_LATEST_PATH = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const QUANT_CHAMPION_PATH = path.join(REPO_ROOT, 'public/data/quantlab/champion.json');
const QUANT_STATUS_PATH = path.join(REPO_ROOT, 'public/data/quantlab/status.json');
const OUT_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_learning_loops_report.json');
const OUT_MIRROR_DIR = path.join(REPO_ROOT, 'mirrors/universe-v7/reports/feature_learning_loops');

function readJsonSafe(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function countSymbols(doc) {
  const arr = Array.isArray(doc?.symbols) ? doc.symbols : [];
  return arr.length;
}

function collectMetrics(label, loopIndex) {
  const ssotDoc = readJsonSafe(SSOT_SYMBOLS_PATH, {});
  const featureReport = readJsonSafe(FEATURE_REPORT_PATH, {});
  const coverage = readJsonSafe(COVERAGE_REPORT_PATH, {});
  const forecastPackCoverage = readJsonSafe(FORECAST_PACK_COVERAGE_PATH, {});
  const forecastLatest = readJsonSafe(FORECAST_LATEST_PATH, {});
  const quantChampion = readJsonSafe(QUANT_CHAMPION_PATH, null);
  const quantStatus = readJsonSafe(QUANT_STATUS_PATH, null);

  const counts = featureReport?.counts || {};
  const progressPct = coverage?.progress_pct || {};
  const forecastAccuracy = forecastLatest?.meta?.accuracy || forecastLatest?.data?.accuracy || {};

  const ssotTotal = toFinite(counts.ssot_stocks_max, countSymbols(ssotDoc) || 0);
  const scientificEffective = toFinite(counts.scientific_effective, 0);
  const forecastEffective = toFinite(counts.forecast_effective, 0);
  const marketphaseEffective = toFinite(counts.marketphase_effective, 0);
  const marketphaseDeepRaw = toFinite(counts.marketphase_deep_raw, 0);
  const elliottEffective = toFinite(counts.elliott_effective, 0);

  const directional = toFinite(forecastAccuracy.directional, null);
  const brier = toFinite(forecastAccuracy.brier, null);
  const sampleCount = toFinite(forecastAccuracy.sample_count, 0);
  const packFoundRatio = toFinite(forecastPackCoverage?.pack_match?.found_ratio_pct, null);
  const packMissingCount = toFinite(forecastPackCoverage?.pack_match?.missing_in_pack, null);

  const quantSharpe = toFinite(quantChampion?.champion?.metrics?.sharpe, null);
  const quantMaxDrawdown = toFinite(quantChampion?.champion?.metrics?.max_drawdown, null);
  const quantCircuitOpen = Boolean(quantStatus?.circuit_open);

  const compositeScore =
    scientificEffective +
    forecastEffective +
    marketphaseDeepRaw +
    elliottEffective +
    (directional !== null ? directional * 1000 : 0) -
    (brier !== null ? brier * 1000 : 0);

  return {
    label,
    loop_index: loopIndex,
    captured_at: nowIso(),
    counts: {
      ssot_stocks_max: ssotTotal,
      scientific_effective: scientificEffective,
      forecast_effective: forecastEffective,
      marketphase_effective: marketphaseEffective,
      marketphase_deep_raw: marketphaseDeepRaw,
      elliott_effective: elliottEffective
    },
    progress_pct: {
      forecast_vs_target_pct: toFinite(progressPct.forecast_vs_target_pct, 0),
      marketphase_vs_target_pct: toFinite(progressPct.marketphase_vs_target_pct, 0),
      marketphase_deep_vs_target_pct: toFinite(progressPct.marketphase_deep_vs_target_pct, 0),
      precondition_200bars_vs_target_pct: toFinite(progressPct.precondition_200bars_vs_target_pct, 0)
    },
    forecast_accuracy: {
      directional,
      brier,
      sample_count: sampleCount
    },
    forecast_pack_match: {
      found_ratio_pct: packFoundRatio,
      missing_in_pack: packMissingCount
    },
    quant: {
      champion_run_id: quantChampion?.run_id || null,
      sharpe: quantSharpe,
      max_drawdown: quantMaxDrawdown,
      circuit_open: quantCircuitOpen
    },
    composite_score: Number.isFinite(compositeScore) ? Number(compositeScore.toFixed(6)) : null
  };
}

function runStep(name, cmd, args, env = process.env) {
  const startedAt = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
    shell: false
  });
  const durationMs = Date.now() - startedAt;
  return {
    name,
    cmd,
    args,
    status: result.status ?? 1,
    duration_ms: durationMs
  };
}

function computeDelta(prev, curr) {
  function delta(pathKey) {
    const parts = pathKey.split('.');
    let a = prev;
    let b = curr;
    for (const part of parts) {
      a = a?.[part];
      b = b?.[part];
    }
    const prevValue = toFinite(a, null);
    const currValue = toFinite(b, null);
    if (prevValue === null || currValue === null) return null;
    return Number((currValue - prevValue).toFixed(6));
  }

  const out = {
    scientific_effective: delta('counts.scientific_effective'),
    forecast_effective: delta('counts.forecast_effective'),
    marketphase_effective: delta('counts.marketphase_effective'),
    marketphase_deep_raw: delta('counts.marketphase_deep_raw'),
    elliott_effective: delta('counts.elliott_effective'),
    forecast_directional: delta('forecast_accuracy.directional'),
    forecast_brier: delta('forecast_accuracy.brier'),
    forecast_pack_found_ratio_pct: delta('forecast_pack_match.found_ratio_pct'),
    composite_score: delta('composite_score')
  };

  const improvedCoverage =
    (out.scientific_effective || 0) > 0
    || (out.forecast_effective || 0) > 0
    || (out.marketphase_effective || 0) > 0
    || (out.marketphase_deep_raw || 0) > 0
    || (out.elliott_effective || 0) > 0;
  const improvedForecastQuality =
    (out.forecast_directional || 0) > 0
    || (out.forecast_brier || 0) < 0
    || (out.forecast_pack_found_ratio_pct || 0) > 0;

  out.improved_any = improvedCoverage || improvedForecastQuality || (out.composite_score || 0) > 0;
  out.improved_coverage = improvedCoverage;
  out.improved_forecast_quality = improvedForecastQuality;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loops = Math.max(1, Number(args.loops || 3));
  const minBars = Math.max(1, Number(args['min-bars'] || 200));
  const feature = String(args.feature || 'marketphase').trim().toLowerCase() || 'marketphase';
  const plateauLimit = Math.max(1, Number(args['plateau-limit'] || 2));
  const enforceParity = args['no-enforce-parity'] === true ? false : true;
  const runQuant = args['run-quant'] === true;

  const startedAt = nowIso();
  const loopRuns = [];
  let plateau = 0;

  // Baseline metrics before running loops.
  const baseline = collectMetrics('baseline', 0);
  let previous = baseline;

  for (let idx = 1; idx <= loops; idx += 1) {
    const steps = [];

    steps.push(runStep('Build v7 Stock SSOT', 'node', ['scripts/universe-v7/build-stock-ssot.mjs']));
    steps.push(runStep('Build Scientific Analysis', 'node', ['scripts/scientific-analyzer/generate-analysis.mjs']));
    steps.push(
      runStep(
        'Build Marketphase Deep Summary',
        'node',
        [
          'scripts/universe-v7/build-marketphase-deep-summary.mjs',
          '--min-bars', String(minBars),
          '--feature', feature
        ]
      )
    );
    steps.push(runStep('Run Forecast Daily', 'node', ['scripts/forecast/run_daily.mjs']));
    steps.push(runStep('Report Forecast Pack Coverage', 'node', ['scripts/universe-v7/report-forecast-pack-coverage.mjs']));
    steps.push(runStep('Report Feature Stock Universe', 'node', ['scripts/universe-v7/report-feature-stock-universe.mjs']));
    steps.push(runStep('Report Coverage Progress', 'node', ['scripts/universe-v7/report-coverage-progress.mjs']));
    steps.push(
      runStep(
        'Feature Universe Parity Gate',
        'node',
        ['scripts/universe-v7/gates/feature-universe-parity.mjs', ...(enforceParity ? ['--enforce'] : [])]
      )
    );

    if (runQuant) {
      steps.push(runStep('QuantLab Daily', 'npm', ['run', 'quantlab:daily']));
      steps.push(runStep('QuantLab Publish', 'npm', ['run', 'quantlab:publish']));
      steps.push(runStep('QuantLab Audit', 'npm', ['run', 'quantlab:audit']));
    }

    const failedStep = steps.find((step) => step.status !== 0);
    const current = collectMetrics(`loop_${idx}`, idx);
    const delta = computeDelta(previous, current);
    const deltaFromBaseline = computeDelta(baseline, current);

    if (delta.improved_any) plateau = 0;
    else plateau += 1;

    loopRuns.push({
      loop_index: idx,
      started_at: nowIso(),
      steps,
      failed: failedStep ? { name: failedStep.name, status: failedStep.status } : null,
      metrics: current,
      delta_vs_previous: delta,
      delta_vs_baseline: deltaFromBaseline,
      plateau_counter: plateau
    });

    previous = current;

    if (failedStep) break;
    if (plateau >= plateauLimit) break;
  }

  const lastLoop = loopRuns[loopRuns.length - 1] || null;
  const status = lastLoop?.failed ? 'FAIL' : 'OK';

  const report = {
    schema: 'rv_v7_feature_learning_loops_report_v1',
    started_at: startedAt,
    finished_at: nowIso(),
    status,
    config: {
      loops_requested: loops,
      loops_executed: loopRuns.length,
      min_bars: minBars,
      feature,
      plateau_limit: plateauLimit,
      enforce_parity: enforceParity,
      run_quant: runQuant
    },
    baseline,
    loops: loopRuns,
    summary: {
      stopped_on_plateau: plateau >= plateauLimit && !(lastLoop?.failed),
      failed_step: lastLoop?.failed || null,
      final_metrics: lastLoop?.metrics || baseline,
      delta_final_vs_baseline: lastLoop ? computeDelta(baseline, lastLoop.metrics) : null
    },
    notes: [
      'This loop runner uses only local artifacts (no direct EODHD API calls).',
      'Coverage and prediction quality are tracked per loop to prove measurable progress or plateau.',
      'Stocks->ETFs API bucket sequencing is handled by run-backfill-loop strict bucket order.'
    ]
  };

  await writeJsonAtomic(OUT_REPORT_PATH, report);
  await writeJsonAtomic(
    path.join(OUT_MIRROR_DIR, `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.json`),
    report
  );

  process.stdout.write(`${JSON.stringify({
    status,
    loops_executed: report.config.loops_executed,
    out: path.relative(REPO_ROOT, OUT_REPORT_PATH),
    final: report.summary.final_metrics?.counts || null,
    delta_vs_baseline: report.summary.delta_final_vs_baseline || null
  })}\n`);
  if (status !== 'OK') process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    code: 1,
    message: error?.message || String(error)
  })}\n`);
  process.exit(1);
});
