#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const OUTCOME_ROOT = path.join(ROOT, 'mirrors/learning/outcomes');
const DEFAULT_OUT = path.join(ROOT, 'public/data/reports/hist-probs-comparison-latest.json');

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!hit) return fallback;
  if (hit === name) return '1';
  return hit.slice(prefix.length);
}

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function daysAgo(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function readNdjson(filePath) {
  try {
    return fsSync.readFileSync(filePath, 'utf8').split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function outcomePath(feature, date) {
  const [year, month] = date.split('-');
  return path.join(OUTCOME_ROOT, feature, year, month, `${date}.ndjson`);
}

function finite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampProb(value) {
  const num = finite(value);
  return Math.max(0.001, Math.min(0.999, num == null ? 0.5 : num));
}

function metricRows(rows) {
  const resolved = rows.filter((row) => row.y === 0 || row.y === 1);
  if (!resolved.length) {
    return {
      n: 0,
      brier: null,
      logloss: null,
      hit_rate: null,
      ev_net: null,
      precision_10: null,
      precision_50: null,
    };
  }
  const ranked = resolved.slice().sort((a, b) => clampProb(b.calibrated_probability ?? b.probability) - clampProb(a.calibrated_probability ?? a.probability));
  const precisionAt = (k) => {
    const top = ranked.slice(0, k);
    return top.length ? top.filter((row) => row.hit === true || row.y === 1).length / top.length : null;
  };
  const brier = resolved.reduce((sum, row) => {
    const p = clampProb(row.calibrated_probability ?? row.raw_probability ?? row.probability);
    return sum + ((p - row.y) ** 2);
  }, 0) / resolved.length;
  const logloss = resolved.reduce((sum, row) => {
    const p = clampProb(row.calibrated_probability ?? row.raw_probability ?? row.probability);
    return sum - (row.y === 1 ? Math.log(p) : Math.log(1 - p));
  }, 0) / resolved.length;
  const evRows = resolved.map((row) => finite(row.realized_return_net)).filter((value) => value != null);
  return {
    n: resolved.length,
    brier: Number(brier.toFixed(6)),
    logloss: Number(logloss.toFixed(6)),
    hit_rate: Number((resolved.filter((row) => row.hit === true || row.y === 1).length / resolved.length).toFixed(6)),
    ev_net: evRows.length ? Number((evRows.reduce((sum, value) => sum + value, 0) / evRows.length).toFixed(6)) : null,
    precision_10: precisionAt(10) == null ? null : Number(precisionAt(10).toFixed(6)),
    precision_50: precisionAt(50) == null ? null : Number(precisionAt(50).toFixed(6)),
  };
}

function compareMetric(v1, v2, key, lowerIsBetter = false) {
  if (v1[key] == null || v2[key] == null) return null;
  const delta = Number((v2[key] - v1[key]).toFixed(6));
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return { v1: v1[key], v2: v2[key], delta, improved };
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function segmentMetrics(rows) {
  const byAssetClass = {};
  for (const [key, group] of groupBy(rows, (row) => String(row.asset_class || 'unknown')).entries()) {
    byAssetClass[key] = metricRows(group);
  }
  const byHorizon = {};
  for (const [key, group] of groupBy(rows, (row) => String(row.horizon || 'unknown')).entries()) {
    byHorizon[key] = metricRows(group);
  }
  return { by_asset_class: byAssetClass, by_horizon: byHorizon };
}

export function buildComparison({ date, lookbackDays = 90, minN = 200, v1Feature = 'stock_analyzer', v2Feature = 'hist_probs_v2_shadow' } = {}) {
  const endDate = normalizeDate(date) || new Date().toISOString().slice(0, 10);
  const v1Rows = [];
  const v2Rows = [];
  for (let i = 0; i < lookbackDays; i += 1) {
    const d = daysAgo(endDate, i);
    v1Rows.push(...readNdjson(outcomePath(v1Feature, d)));
    v2Rows.push(...readNdjson(outcomePath(v2Feature, d)));
  }
  const v1 = metricRows(v1Rows);
  const v2 = metricRows(v2Rows);
  const insufficient = v1.n < minN || v2.n < minN;
  return {
    schema: 'rv.hist_probs.comparison.v1',
    generated_at: new Date().toISOString(),
    date: endDate,
    lookback_days: lookbackDays,
    min_n: minN,
    status: insufficient ? 'insufficient_n' : 'ok',
    v1_feature: v1Feature,
    v2_feature: v2Feature,
    metrics: {
      v1,
      v2,
      delta: {
        brier: compareMetric(v1, v2, 'brier', true),
        logloss: compareMetric(v1, v2, 'logloss', true),
        hit_rate: compareMetric(v1, v2, 'hit_rate', false),
        ev_net: compareMetric(v1, v2, 'ev_net', false),
        precision_10: compareMetric(v1, v2, 'precision_10', false),
        precision_50: compareMetric(v1, v2, 'precision_50', false),
      },
    },
    segments: {
      v1: segmentMetrics(v1Rows),
      v2: segmentMetrics(v2Rows),
    },
    promotion_eligible: !insufficient
      && compareMetric(v1, v2, 'brier', true)?.improved === true
      && compareMetric(v1, v2, 'logloss', true)?.improved === true
      && compareMetric(v1, v2, 'ev_net', false)?.improved === true,
  };
}

async function main() {
  const report = buildComparison({
    date: argValue('--date', null),
    lookbackDays: Number(argValue('--lookback-days', '90')) || 90,
    minN: Number(argValue('--min-n', '200')) || 200,
    v1Feature: argValue('--v1-feature', 'stock_analyzer'),
    v2Feature: argValue('--v2-feature', 'hist_probs_v2_shadow'),
  });
  const out = argValue('--out', DEFAULT_OUT);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(report, null, 2));
  await fs.rename(tmp, out);
  console.log(`[hist-probs:compare] status=${report.status} v1_n=${report.metrics.v1.n} v2_n=${report.metrics.v2.n}`);
  if (process.argv.includes('--fail-on-insufficient-n') && report.status !== 'ok') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[hist-probs:compare] fatal', error);
    process.exit(1);
  });
}
