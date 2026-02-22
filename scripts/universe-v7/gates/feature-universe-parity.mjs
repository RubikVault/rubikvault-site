#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SSOT_SYMBOLS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const BY_FEATURE_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.by_feature.json');
const SCI_PATH = path.join(REPO_ROOT, 'public/data/snapshots/stock-analysis.json');
const FORECAST_PATH = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const MARKETPHASE_PATH = path.join(REPO_ROOT, 'public/data/marketphase/index.json');
const REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_universe_parity_report.json');

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function setFrom(values) {
  const out = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const symbol = String(value || '').trim().toUpperCase();
    if (symbol) out.add(symbol);
  }
  return out;
}

function setDiff(a, b) {
  const out = [];
  for (const value of a) {
    if (!b.has(value)) out.push(value);
  }
  return out;
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    enforce: argv.includes('--enforce')
      || String(process.env.RV_V7_FEATURE_PARITY_ENFORCE || '').toLowerCase() === 'true'
  };
}

async function main() {
  const args = parseArgs();
  const ssotDoc = await readJson(SSOT_SYMBOLS_PATH, {});
  const byFeatureDoc = await readJson(BY_FEATURE_PATH, {});

  const ssotSet = setFrom(ssotDoc?.symbols);
  const byFeature = byFeatureDoc?.symbols && typeof byFeatureDoc.symbols === 'object'
    ? byFeatureDoc.symbols
    : {};
  const featureIds = ['analyzer', 'scientific', 'forecast', 'marketphase', 'elliott'];

  const setChecks = {};
  const violations = [];
  if (ssotSet.size === 0) {
    violations.push('SSOT_EMPTY_OR_MISSING');
  }
  for (const featureId of featureIds) {
    const featureSet = setFrom(byFeature[featureId]);
    const missingFromFeature = setDiff(ssotSet, featureSet);
    const extraInFeature = setDiff(featureSet, ssotSet);
    const ok = missingFromFeature.length === 0 && extraInFeature.length === 0;
    setChecks[featureId] = {
      ok,
      count: featureSet.size,
      ssot_count: ssotSet.size,
      missing_from_feature_count: missingFromFeature.length,
      extra_in_feature_count: extraInFeature.length,
      sample_missing_from_feature: missingFromFeature.slice(0, 10),
      sample_extra_in_feature: extraInFeature.slice(0, 10)
    };
    if (!ok) violations.push(`SET_MISMATCH:${featureId}`);
  }

  const sciDoc = await readJson(SCI_PATH, {});
  const forecastDoc = await readJson(FORECAST_PATH, {});
  const marketphaseDoc = await readJson(MARKETPHASE_PATH, {});
  const scientificLiveCount = Object.keys(sciDoc || {}).filter((key) => !String(key).startsWith('_')).length;
  const forecastRows = Array.isArray(forecastDoc?.data?.forecasts)
    ? forecastDoc.data.forecasts
    : [];
  const forecastLiveSet = setFrom(forecastRows.map((row) => row?.ticker || row?.symbol || null));
  const marketphaseRows = Array.isArray(marketphaseDoc?.data?.symbols)
    ? marketphaseDoc.data.symbols
    : [];
  const marketphaseLiveSet = setFrom(marketphaseRows.map((row) => (typeof row === 'string' ? row : row?.symbol)));

  const report = {
    schema: 'rv_v7_feature_universe_parity_report_v1',
    generated_at: nowIso(),
    enforce: args.enforce,
    ssot: {
      symbols_count: ssotSet.size,
      symbols_path: 'public/data/universe/v7/ssot/stocks.max.symbols.json',
      by_feature_path: 'public/data/universe/v7/ssot/stocks.by_feature.json'
    },
    set_parity: setChecks,
    live_coverage: {
      scientific_count: scientificLiveCount,
      forecast_count: forecastLiveSet.size,
      marketphase_count: marketphaseLiveSet.size,
      scientific_ratio_to_ssot: ssotSet.size > 0 ? Number((scientificLiveCount / ssotSet.size).toFixed(6)) : null,
      forecast_ratio_to_ssot: ssotSet.size > 0 ? Number((forecastLiveSet.size / ssotSet.size).toFixed(6)) : null,
      marketphase_ratio_to_ssot: ssotSet.size > 0 ? Number((marketphaseLiveSet.size / ssotSet.size).toFixed(6)) : null
    },
    violations,
    status: violations.length === 0 ? 'PASS' : (args.enforce ? 'FAIL' : 'WARN')
  };

  await writeJsonAtomic(REPORT_PATH, report);

  const out = {
    status: report.status === 'FAIL' ? 'FAIL' : 'OK',
    code: report.status === 'FAIL' ? 1 : 0,
    report: 'public/data/universe/v7/reports/feature_universe_parity_report.json',
    violations: report.violations.length,
    ssot_symbols: ssotSet.size
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);

  if (report.status === 'FAIL') process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    code: 1,
    reason: error?.message || 'feature_universe_parity_gate_failed'
  })}\n`);
  process.exit(1);
});
