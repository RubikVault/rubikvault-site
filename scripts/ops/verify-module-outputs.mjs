#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

function argValue(name, fallback = null) {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

function normalizeDate(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function readJson(relPath) {
  const absPath = path.join(ROOT, relPath);
  try {
    return { path: relPath, doc: JSON.parse(fs.readFileSync(absPath, 'utf8')) };
  } catch {
    return null;
  }
}

function firstDoc(paths) {
  for (const relPath of paths) {
    const hit = readJson(relPath);
    if (hit) return hit;
  }
  return null;
}

function pickDate(doc) {
  return normalizeDate(
    doc?.target_market_date
    || doc?.as_of
    || doc?.report_date
    || doc?.reportDate
    || doc?.freshness
    || doc?.run_meta?.target_market_date
    || doc?.meta?.target_market_date
    || doc?.data?.asof
    || doc?.data?.freshness
    || doc?.source_meta?.asof
    || doc?.meta?.data_asof
    || doc?.data_asof
    || doc?.date
    || doc?.generatedAt
    || doc?.generated_at
  );
}

function pickCount(doc, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => acc?.[part], doc);
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function compareDate(a, b) {
  const left = normalizeDate(a);
  const right = normalizeDate(b);
  if (!left || !right) return null;
  return left.localeCompare(right);
}

function checkModule(def, targetMarketDate) {
  const hit = firstDoc(def.paths);
  if (!hit) {
    return {
      id: def.id,
      ok: false,
      status: 'missing',
      path: null,
      reason: 'module_output_missing',
    };
  }
  const target = pickDate(hit.doc);
  const count = pickCount(hit.doc, def.countKeys || []);
  let ratio = pickCount(hit.doc, def.ratioKeys || []);
  if (!Number.isFinite(ratio)) {
    const numerator = pickCount(hit.doc, def.ratioNumeratorKeys || []);
    const denominator = pickCount(hit.doc, def.ratioDenominatorKeys || []);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      ratio = numerator / denominator;
    }
  }
  const reasons = [];
  const cmp = compareDate(target, targetMarketDate);
  const dateOk = def.dateMode === 'on_or_after'
    ? cmp != null && cmp >= 0
    : target === targetMarketDate;
  if (targetMarketDate && !dateOk) {
    reasons.push('target_market_date_mismatch');
  }
  if (def.minCount != null && !(Number.isFinite(count) && count >= def.minCount)) {
    reasons.push('asset_count_below_minimum');
  }
  if (def.minRatio != null && !(Number.isFinite(ratio) && ratio >= def.minRatio)) {
    reasons.push('coverage_ratio_below_minimum');
  }
  return {
    id: def.id,
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'ok' : 'failed',
    path: hit.path,
    target_market_date: target,
    count,
    ratio,
    reasons,
  };
}

const targetMarketDate = normalizeDate(argValue('--target-market-date') || process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE);
const outputPath = argValue('--output') || 'public/data/ops/module-outputs-verify-latest.json';

const modules = [
  {
    id: 'forecast',
    paths: ['public/data/forecast/forecast-summary-latest.json', 'public/data/forecast/latest.json'],
    countKeys: ['asset_count', 'completed_assets', 'data.forecasts', 'forecasts', 'predictions'],
    minCount: 1,
  },
  {
    id: 'hist_probs',
    paths: ['public/data/hist-probs/coverage-report-latest.json', 'public/data/hist-probs/run-summary.json', 'public/data/runtime/hist-probs-status-summary.json'],
    countKeys: ['tickers_covered', 'covered_assets', 'asset_count'],
    ratioKeys: ['coverage_ratio', 'artifact_coverage_ratio', 'run_coverage_ratio', 'ssot_coverage_pct'],
    ratioNumeratorKeys: ['tickers_covered'],
    ratioDenominatorKeys: ['tickers_total', 'tickers_input_total'],
    minCount: 1,
    minRatio: 0.90,
  },
  {
    id: 'breakout',
    paths: ['public/data/breakout/latest.json', 'public/data/breakout/manifests/latest.json', 'public/data/snapshots/breakout-all.json'],
    countKeys: ['scored', 'counts.scored', 'count', 'validation.publishable', 'top500', 'rows', 'items'],
    minCount: 1,
  },
  {
    id: 'quantlab',
    paths: ['public/data/quantlab/daily-scorecard-latest.json', 'public/data/quantlab/reports/v4-daily-latest.json', 'public/data/quantlab/latest.json'],
    countKeys: ['asset_count', 'assets_scored', 'targetAsofs', 'trainingScope.currentFocusFamilies', 'rows', 'items', 'symbols'],
    dateMode: 'on_or_after',
    minCount: 1,
  },
  {
    id: 'scientific',
    paths: ['public/data/supermodules/scientific-summary.json', 'public/data/decision-core/status/latest.json'],
    countKeys: ['asset_count', 'assets', 'rows', 'summary.asset_count', 'universe_stats.total', 'total_assets'],
    minCount: 1,
  },
];

const checks = modules.map((def) => checkModule(def, targetMarketDate));
const failed = checks.filter((item) => !item.ok);
const payload = {
  schema: 'rv.module_outputs_verify.v1',
  generated_at: new Date().toISOString(),
  target_market_date: targetMarketDate,
  ok: failed.length === 0,
  status: failed.length === 0 ? 'OK' : 'FAILED',
  failed_count: failed.length,
  checks,
};

writeJsonAtomic(path.join(ROOT, outputPath), payload);
process.stdout.write(`${JSON.stringify({
  ok: payload.ok,
  target_market_date: payload.target_market_date,
  failed_count: payload.failed_count,
  failed_modules: failed.map((item) => item.id),
})}\n`);

if (!payload.ok) process.exit(4);
