#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  REGISTRY_PATH,
  classifyRegion,
  isoDate,
  readJsonMaybe,
  writeJsonAtomic,
} from '../decision-core/shared.mjs';
import { histProbsReadCandidates } from '../lib/hist-probs/path-resolver.mjs';

const HIST_PROBS_DIR = path.join(ROOT, 'public/data/hist-probs');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/hist-probs-region-catchup-plan-latest.json');
const SCOPE_IDS_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DEFAULT_RUNTIME_ROOT = process.env.NAS_RUNTIME_ROOT
  ? path.join(process.env.NAS_RUNTIME_ROOT, 'hist-probs-region-catchup')
  : path.join(ROOT, 'runtime/hist-probs-region-catchup');

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function boolArg(name) {
  return process.argv.includes(`--${name}`);
}

function readScopeIds() {
  const doc = readJsonMaybe(SCOPE_IDS_PATH);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean));
}

function readRegistryRows() {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      const assetType = String(row?.type_norm || row?.asset_class || '').trim().toUpperCase();
      if (!symbol || !['STOCK', 'ETF', 'INDEX'].includes(assetType)) continue;
      rows.push({
        symbol,
        canonical_id: String(row?.canonical_id || '').trim().toUpperCase(),
        exchange: String(row?.exchange || '').trim().toUpperCase() || null,
        asset_type: assetType,
        type_norm: assetType,
        region: classifyRegion(row),
        bars_count: Number(row?.bars_count || 0),
        last_trade_date: isoDate(row?.last_trade_date),
        expected_date: isoDate(row?.last_trade_date),
        history_pack: String(row?.pointers?.history_pack || row?.history_pack || '').trim() || null,
      });
    } catch {
      // malformed registry rows excluded; registry audits cover source quality.
    }
  }
  return rows;
}

function inspectHistProbs(symbol, targetDate) {
  for (const filePath of histProbsReadCandidates(HIST_PROBS_DIR, symbol)) {
    const doc = readJsonMaybe(filePath);
    if (!doc) continue;
    const latest = isoDate(doc.latest_date);
    if (targetDate && latest && latest >= targetDate) return { status: 'fresh', latest_date: latest };
    return { status: latest ? 'stale' : 'invalid', latest_date: latest };
  }
  return { status: 'missing', latest_date: null };
}

function collectPrioritySymbols() {
  const out = new Set();
  for (const filePath of [
    'public/data/reports/decision-core-buy-breadth-core-latest.json',
    'public/data/reports/decision-core-buy-breadth-shadow-latest.json',
    'public/data/reports/decision-core-buy-breadth-latest.json',
  ]) {
    const doc = readJsonMaybe(path.join(ROOT, filePath));
    for (const key of ['us_buy_assets', 'eu_buy_assets', 'asia_buy_assets']) {
      for (const row of Array.isArray(doc?.[key]) ? doc[key] : []) {
        const symbol = String(row?.symbol || row?.asset_id?.split(':')?.pop() || '').trim().toUpperCase();
        if (symbol) out.add(symbol);
      }
    }
  }
  const best = readJsonMaybe(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'));
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;
    const symbol = String(value.symbol || value.ticker || value.display_ticker || value.canonical_id?.split(':')?.pop() || '').trim().toUpperCase();
    if (symbol) out.add(symbol);
    for (const child of Object.values(value)) visit(child);
  };
  visit(best?.data);
  for (const protectedTicker of ['AAPL', 'MSFT', 'SPY', 'QQQ', 'SHEL', '0050']) out.add(protectedTicker);
  return out;
}

function selectRows({ rows, targetDate, perRegion, maxTotal, minBars }) {
  const priority = collectPrioritySymbols();
  const byCanonical = new Map();
  for (const row of rows) {
    if (!['US', 'EU', 'ASIA'].includes(row.region)) continue;
    if (!['STOCK', 'ETF', 'INDEX'].includes(row.asset_type)) continue;
    if (Number(row.bars_count || 0) < minBars) continue;
    const key = row.canonical_id || row.symbol;
    const current = byCanonical.get(key);
    if (!current || row.bars_count > current.bars_count) byCanonical.set(key, row);
  }
  const bySymbol = new Map();
  for (const row of byCanonical.values()) {
    const current = bySymbol.get(row.symbol);
    if (!current || row.bars_count > current.bars_count) bySymbol.set(row.symbol, row);
  }
  const baseRows = [...bySymbol.values()].map((row) => ({
    ...row,
    priority: priority.has(row.symbol),
  }));
  const selected = [];
  for (const region of ['US', 'EU', 'ASIA']) {
    const candidates = baseRows
      .filter((row) => row.region === region)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority ? -1 : 1;
        const typeScore = { ETF: 3, STOCK: 2, INDEX: 1 };
        const typeDelta = (typeScore[b.asset_type] || 0) - (typeScore[a.asset_type] || 0);
        if (typeDelta) return typeDelta;
        return Number(b.bars_count || 0) - Number(a.bars_count || 0);
      });
    const pick = [];
    for (const row of candidates) {
      const enriched = { ...row, hist_probs: inspectHistProbs(row.symbol, targetDate) };
      if (enriched.hist_probs.status === 'fresh') continue;
      pick.push(enriched);
      if (pick.length >= perRegion) break;
    }
    selected.push(...pick);
  }
  return selected.slice(0, maxTotal);
}

function writeTickerFile({ selected, targetDate }) {
  fs.mkdirSync(DEFAULT_RUNTIME_ROOT, { recursive: true });
  const filePath = path.join(DEFAULT_RUNTIME_ROOT, `tickers-${targetDate || 'latest'}-${Date.now()}.txt`);
  fs.writeFileSync(filePath, `${selected.map((row) => row.symbol).join('\n')}\n`, 'utf8');
  return filePath;
}

function writeEntriesFile({ selected, targetDate }) {
  fs.mkdirSync(DEFAULT_RUNTIME_ROOT, { recursive: true });
  const filePath = path.join(DEFAULT_RUNTIME_ROOT, `entries-${targetDate || 'latest'}-${Date.now()}.json`);
  const entries = selected.map((row) => ({
    symbol: row.symbol,
    canonical_id: row.canonical_id || null,
    exchange: row.exchange || null,
    type_norm: row.type_norm || row.asset_type || null,
    bars_count: row.bars_count || 0,
    expected_date: row.expected_date || row.last_trade_date || null,
    history_pack: row.history_pack || null,
    region: row.region || null,
  }));
  fs.writeFileSync(filePath, `${JSON.stringify({
    schema: 'rv.hist_probs.catchup_entries.v1',
    generated_at: new Date().toISOString(),
    target_market_date: targetDate || null,
    entries,
  }, null, 2)}\n`, 'utf8');
  return filePath;
}

function runPostSummaries() {
  const scripts = [
    'scripts/ops/build-hist-probs-status-summary.mjs',
    'scripts/ops/build-hist-probs-public-projection.mjs',
    'scripts/ops/triage-hist-probs-errors.mjs',
    'scripts/hist-probs/classify-hist-errors.mjs',
    'scripts/hist-probs/audit-current-state.mjs',
    'scripts/hist-probs/diagnose-no-data.mjs',
  ];
  const results = [];
  for (const script of scripts) {
    const run = spawnSync(process.execPath, [script], { cwd: ROOT, stdio: 'inherit', env: process.env });
    results.push({ script, status: run.status ?? 1 });
  }
  return results;
}

function main() {
  const targetDate = isoDate(arg('target-market-date') || process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE);
  const perRegion = Math.max(1, Number(arg('per-region', process.env.RV_HIST_PROBS_REGION_CATCHUP_PER_REGION || 500)) || 500);
  const maxTotal = Math.max(1, Number(arg('max-total', process.env.RV_HIST_PROBS_REGION_CATCHUP_MAX_TOTAL || perRegion * 3)) || perRegion * 3);
  const execute = boolArg('execute');
  const minBars = Math.max(1, Number(arg('min-bars', process.env.RV_HIST_PROBS_REGION_CATCHUP_MIN_BARS || 60)) || 60);
  const scopeIds = readScopeIds();
  const registryRows = readRegistryRows().filter((row) => scopeIds.size === 0 || scopeIds.has(row.canonical_id));
  const selected = selectRows({ rows: registryRows, targetDate, perRegion, maxTotal, minBars });
  const tickerFile = writeTickerFile({ selected, targetDate });
  const entriesFile = writeEntriesFile({ selected, targetDate });
  const byRegion = {};
  for (const region of ['US', 'EU', 'ASIA']) {
    const rows = selected.filter((row) => row.region === region);
    byRegion[region] = {
      selected: rows.length,
      stock: rows.filter((row) => row.asset_type === 'STOCK').length,
      etf: rows.filter((row) => row.asset_type === 'ETF').length,
      index: rows.filter((row) => row.asset_type === 'INDEX').length,
      priority: rows.filter((row) => row.priority).length,
      missing: rows.filter((row) => row.hist_probs.status === 'missing').length,
      stale: rows.filter((row) => row.hist_probs.status === 'stale').length,
      invalid: rows.filter((row) => row.hist_probs.status === 'invalid').length,
    };
  }
  const report = {
    schema: 'rv.hist_probs_region_catchup_plan.v1',
    generated_at: new Date().toISOString(),
    target_market_date: targetDate,
    execute,
    min_bars: minBars,
    registry_rows_scanned: registryRows.length,
    scope_ids_count: scopeIds.size,
    selected_count: selected.length,
    ticker_file: path.relative(ROOT, tickerFile),
    entries_file: path.relative(ROOT, entriesFile),
    by_region: byRegion,
    sample_tickers: selected.slice(0, 30).map((row) => ({
      symbol: row.symbol,
      canonical_id: row.canonical_id || null,
      exchange: row.exchange || null,
      region: row.region,
      asset_type: row.asset_type,
      priority: row.priority,
      hist_probs_status: row.hist_probs.status,
      latest_date: row.hist_probs.latest_date,
    })),
  };
  writeJsonAtomic(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!execute || selected.length === 0) return;
  const env = {
    ...process.env,
    HIST_PROBS_WORKERS: process.env.HIST_PROBS_WORKERS || process.env.RV_HIST_PROBS_REGION_CATCHUP_WORKERS || '2',
    HIST_PROBS_WORKER_BATCH_SIZE: process.env.HIST_PROBS_WORKER_BATCH_SIZE || process.env.RV_HIST_PROBS_REGION_CATCHUP_BATCH_SIZE || '25',
    HIST_PROBS_SKIP_EXISTING: '1',
    HIST_PROBS_WRITE_MODE: process.env.HIST_PROBS_WRITE_MODE || 'bucket_only',
    HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS: process.env.HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS || '2',
    HIST_PROBS_RSS_BUDGET_MB: process.env.HIST_PROBS_RSS_BUDGET_MB || process.env.RV_HIST_PROBS_REGION_CATCHUP_RSS_BUDGET_MB || '4096',
    HIST_PROBS_RESPECT_CHECKPOINT_VERSION: '1',
    HIST_PROBS_FAIL_ON_SOFT_ERRORS: '0',
    HIST_PROBS_MIN_COVERAGE_RATIO: '0',
  };
  const run = spawnSync(process.execPath, [
    'run-hist-probs-turbo.mjs',
    '--entries-file', entriesFile,
    '--target-market-date', targetDate,
    '--asset-classes', 'STOCK,ETF,INDEX',
    '--write-run-summary=false',
  ], { cwd: ROOT, stdio: 'inherit', env });
  const post = runPostSummaries();
  const done = {
    ...report,
    completed_at: new Date().toISOString(),
    run_status: run.status ?? 1,
    post_summaries: post,
  };
  writeJsonAtomic(REPORT_PATH, done);
  if ((run.status ?? 1) !== 0) process.exit(run.status ?? 1);
}

main();
