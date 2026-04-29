#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { iterateGzipNdjson } from '../lib/io/gzip-ndjson.mjs';
import { REPO_ROOT, loadLocalBars, setLocalBarsRuntimeOverrides } from '../lib/best-setups-local-loader.mjs';
import { HistProbsRollingCore } from '../lib/indicators/rolling-core.mjs';
import { activeEventKeys } from '../lib/hist-probs/compute-outcomes.mjs';

const ROOT = process.env.RUBIKVAULT_ROOT || REPO_ROOT || process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DEFAULT_OUT_DIR = path.join(ROOT, 'mirrors/hist-probs/profile');
const HORIZONS = [5, 10, 20, 60, 120, 250];

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!hit) return fallback;
  if (hit === name) return '1';
  return hit.slice(prefix.length);
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

async function selectSample(sampleSize) {
  const explicit = argValue('--tickers', null);
  if (explicit) return explicit.split(',').map(normalizeTicker).filter(Boolean).slice(0, sampleSize);
  const rows = [];
  for await (const row of iterateGzipNdjson(REGISTRY_PATH)) {
    const symbol = normalizeTicker(row?.symbol);
    const assetClass = String(row?.type_norm || '').toUpperCase();
    if (!symbol || !['STOCK', 'ETF', 'INDEX'].includes(assetClass)) continue;
    rows.push({
      symbol,
      asset_class: assetClass,
      bars_count: Number(row?.bars_count || 0),
      last_trade_date: String(row?.last_trade_date || '').slice(0, 10),
    });
  }
  const buckets = {
    stock_long: rows.filter((row) => row.asset_class === 'STOCK' && row.bars_count >= 1000),
    stock_short: rows.filter((row) => row.asset_class === 'STOCK' && row.bars_count > 0 && row.bars_count < 250),
    etf: rows.filter((row) => row.asset_class === 'ETF'),
    index: rows.filter((row) => row.asset_class === 'INDEX'),
  };
  const picked = [];
  for (const bucketRows of Object.values(buckets)) {
    bucketRows.sort((a, b) => b.bars_count - a.bars_count || a.symbol.localeCompare(b.symbol));
    picked.push(...bucketRows.slice(0, Math.max(1, Math.floor(sampleSize / 4))).map((row) => row.symbol));
  }
  return [...new Set(picked)].slice(0, sampleSize);
}

function summarize(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return { min: null, p50: null, p95: null, max: null, avg: null };
  const pick = (q) => nums[Math.min(nums.length - 1, Math.floor((nums.length - 1) * q))];
  return {
    min: nums[0],
    p50: pick(0.5),
    p95: pick(0.95),
    max: nums.at(-1),
    avg: Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(2)),
  };
}

async function profileTicker(ticker) {
  const started = performance.now();
  const inputStart = performance.now();
  const bars = await loadLocalBars(ticker, {});
  const inputReadMs = performance.now() - inputStart;
  const latestDate = bars.at(-1)?.date || null;
  if (bars.length < 60) {
    return {
      ticker,
      bars_count: bars.length,
      latest_date: latestDate,
      input_read_ms: Number(inputReadMs.toFixed(2)),
      indicator_ms: 0,
      outcome_scan_ms: 0,
      total_ms: Number((performance.now() - started).toFixed(2)),
      event_days: 0,
      observation_count: 0,
      status: bars.length ? 'too_short_history' : 'no_data',
    };
  }
  const eventsByIndex = [];
  const indicatorStart = performance.now();
  const rollingCore = new HistProbsRollingCore();
  for (let i = 0; i < bars.length; i += 1) {
    const snap = rollingCore.push(bars[i]);
    if (i < 30 || i >= bars.length - 1) continue;
    const events = activeEventKeys(snap);
    if (events.length) eventsByIndex.push({ i, events });
  }
  const indicatorMs = performance.now() - indicatorStart;
  const scanStart = performance.now();
  let observationCount = 0;
  for (const row of eventsByIndex) {
    for (const horizon of HORIZONS) {
      const endIdx = row.i + horizon;
      if (endIdx >= bars.length) continue;
      const entry = Number(bars[row.i + 1]?.open || 0);
      const exit = Number(bars[endIdx]?.close || 0);
      if (entry > 0 && exit > 0) observationCount += row.events.length;
    }
  }
  const outcomeScanMs = performance.now() - scanStart;
  return {
    ticker,
    bars_count: bars.length,
    latest_date: latestDate,
    input_read_ms: Number(inputReadMs.toFixed(2)),
    indicator_ms: Number(indicatorMs.toFixed(2)),
    outcome_scan_ms: Number(outcomeScanMs.toFixed(2)),
    total_ms: Number((performance.now() - started).toFixed(2)),
    event_days: eventsByIndex.length,
    observation_count: observationCount,
    status: 'ok',
  };
}

export async function runProfile({ sampleSize = 100, outDir = DEFAULT_OUT_DIR } = {}) {
  setLocalBarsRuntimeOverrides({ localBarStaleDays: 9999, allowRemoteBarFetch: false });
  const tickers = await selectSample(sampleSize);
  const rows = [];
  for (const ticker of tickers) {
    rows.push(await profileTicker(ticker).catch((error) => ({
      ticker,
      status: 'error',
      message: error?.message || String(error),
    })));
  }
  const byStatus = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  const report = {
    schema: 'rv.hist_probs.profile.v1',
    generated_at: new Date().toISOString(),
    sample_size: tickers.length,
    by_status: byStatus,
    phase_ms: {
      input_read: summarize(rows.map((row) => row.input_read_ms)),
      indicator: summarize(rows.map((row) => row.indicator_ms)),
      outcome_scan: summarize(rows.map((row) => row.outcome_scan_ms)),
      total: summarize(rows.map((row) => row.total_ms)),
    },
    rows,
  };
  await fs.mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'hist_probs_profile_report.json');
  const csvPath = path.join(outDir, 'phase_breakdown.csv');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  const csv = [
    'ticker,status,bars_count,latest_date,input_read_ms,indicator_ms,outcome_scan_ms,total_ms,event_days,observation_count',
    ...rows.map((row) => [
      row.ticker,
      row.status,
      row.bars_count ?? '',
      row.latest_date ?? '',
      row.input_read_ms ?? '',
      row.indicator_ms ?? '',
      row.outcome_scan_ms ?? '',
      row.total_ms ?? '',
      row.event_days ?? '',
      row.observation_count ?? '',
    ].join(',')),
  ].join('\n') + '\n';
  await fs.writeFile(csvPath, csv);
  return { reportPath, csvPath, report };
}

async function main() {
  const sampleSize = Math.max(1, Number(argValue('--sample-size', '100')) || 100);
  const outDir = argValue('--out-dir', path.join(DEFAULT_OUT_DIR, new Date().toISOString().slice(0, 10)));
  const { report } = await runProfile({ sampleSize, outDir });
  console.log(`[hist-probs:profile] sampled=${report.sample_size} ok=${report.by_status.ok || 0}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[hist-probs:profile] fatal', error);
    process.exit(1);
  });
}
