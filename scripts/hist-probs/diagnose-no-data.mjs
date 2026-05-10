#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readHistoryPackRows } from '../lib/history-pack-overlay.mjs';
import { ROOT } from '../decision-core/shared.mjs';

const NO_DATA_PATH = path.join(ROOT, 'public/data/hist-probs/no-data-tickers.json');
const RUN_SUMMARY_PATH = path.join(ROOT, 'public/data/hist-probs/run-summary.json');
const RETRY_SUMMARY_PATH = path.join(ROOT, 'public/data/hist-probs/retry-summary-latest.json');
const SCOPE_IDS_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const PROVIDER_NO_DATA_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/provider-no-data-exclusions.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/hist-probs-no-data-diagnostics-latest.json');
const MIN_BARS = 60;

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase() || null;
}

function normalizeCanonicalId(value) {
  return String(value || '').trim().toUpperCase() || null;
}

function canonicalExchange(canonicalId) {
  const normalized = normalizeCanonicalId(canonicalId);
  return normalized?.includes(':') ? normalized.split(':')[0] : null;
}

function isoDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function tradingDaysBetween(olderDateId, newerDateId) {
  if (!olderDateId || !newerDateId) return null;
  const older = new Date(`${olderDateId}T00:00:00Z`);
  const newer = new Date(`${newerDateId}T00:00:00Z`);
  if (Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime()) || newer <= older) return 0;
  let count = 0;
  const cursor = new Date(older);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= newer) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function readScopeIds() {
  const doc = readJson(SCOPE_IDS_PATH);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map(normalizeCanonicalId).filter(Boolean));
}

function normalizeRegistryRow(row = {}) {
  const symbol = normalizeSymbol(row.symbol);
  const canonicalId = normalizeCanonicalId(row.canonical_id);
  if (!symbol || !canonicalId) return null;
  return {
    symbol,
    canonical_id: canonicalId,
    exchange: normalizeSymbol(row.exchange) || canonicalExchange(canonicalId),
    type_norm: String(row.type_norm || row.asset_class || '').trim().toUpperCase() || null,
    bars_count: Number(row.bars_count || 0),
    last_trade_date: isoDate(row.last_trade_date),
    history_pack: String(row?.pointers?.history_pack || row.history_pack || '').trim() || null,
  };
}

function readRegistryIndex() {
  const byCanonical = new Map();
  const bySymbol = new Map();
  try {
    const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = normalizeRegistryRow(JSON.parse(line));
        if (!row) continue;
        byCanonical.set(row.canonical_id, row);
        if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
        bySymbol.get(row.symbol).push(row);
      } catch {}
    }
  } catch {}
  return { byCanonical, bySymbol };
}

function providerNoDataSet() {
  const doc = readJson(PROVIDER_NO_DATA_PATH);
  const rows = Array.isArray(doc?.items) ? doc.items
    : Array.isArray(doc?.entries) ? doc.entries
      : Array.isArray(doc) ? doc
        : [];
  const ids = new Set();
  const symbols = new Set();
  for (const row of rows) {
    const id = normalizeCanonicalId(row?.canonical_id || row?.canonicalId || row?.asset_id);
    const symbol = normalizeSymbol(row?.symbol || row?.ticker);
    if (id) ids.add(id);
    if (symbol) symbols.add(symbol);
  }
  return { ids, symbols };
}

function collectNoDataInputs() {
  const byKey = new Map();
  const add = (row = {}, source) => {
    const symbol = normalizeSymbol(row.symbol || row.ticker);
    const canonicalId = normalizeCanonicalId(row.canonical_id || row.canonicalId || row.canonical_ids?.[0]);
    const key = canonicalId || symbol;
    if (!key) return;
    const prev = byKey.get(key) || {};
    byKey.set(key, {
      ...prev,
      symbol: symbol || prev.symbol || null,
      canonical_id: canonicalId || prev.canonical_id || null,
      exchange: normalizeSymbol(row.exchange) || prev.exchange || canonicalExchange(canonicalId),
      bars_count: Number(row.bars_count || prev.bars_count || 0),
      expected_date: isoDate(row.expected_date || row.required_date || row.latest_date) || prev.expected_date || null,
      type_norm: String(row.type_norm || prev.type_norm || '').trim().toUpperCase() || null,
      history_pack: String(row.history_pack || prev.history_pack || '').trim() || null,
      source,
    });
  };

  const noData = readJson(NO_DATA_PATH);
  for (const row of Array.isArray(noData?.tickers) ? noData.tickers : []) add(row, 'no_data_manifest');

  for (const summaryPath of [RUN_SUMMARY_PATH, RETRY_SUMMARY_PATH]) {
    const summary = readJson(summaryPath);
    for (const row of Array.isArray(summary?.runtime_no_data_entries) ? summary.runtime_no_data_entries : []) {
      add(row, `${path.basename(summaryPath)}:runtime_no_data_entries`);
    }
    for (const ticker of Array.isArray(summary?.runtime_no_data_tickers) ? summary.runtime_no_data_tickers : []) {
      add({ symbol: ticker }, `${path.basename(summaryPath)}:runtime_no_data_tickers`);
    }
    for (const row of Array.isArray(summary?.no_data_samples) ? summary.no_data_samples : []) {
      add(row, path.basename(summaryPath));
    }
  }
  return [...byKey.values()];
}

async function inspectPack(row, registryRow) {
  const historyPack = row.history_pack || registryRow?.history_pack || null;
  if (!historyPack) return { status: 'pack_missing', bars_count: 0, latest_date: null };
  const rows = await readHistoryPackRows(ROOT, historyPack, {
    includeDeltas: process.env.RV_HISTORY_READ_DELTAS === '1',
    baseDir: 'mirrors/universe-v7',
  });
  if (!rows.length) return { status: 'pack_missing', history_pack: historyPack, bars_count: 0, latest_date: null };
  const canonicalId = normalizeCanonicalId(row.canonical_id || registryRow?.canonical_id);
  const hit = canonicalId
    ? rows.find((item) => normalizeCanonicalId(item?.canonical_id) === canonicalId)
    : rows[0];
  if (!hit) return { status: 'canonical_absent', history_pack: historyPack, bars_count: 0, latest_date: null };
  const bars = Array.isArray(hit?.bars) ? hit.bars : [];
  const latestDate = bars.map((bar) => isoDate(bar?.date || bar?.trading_date)).filter(Boolean).sort().at(-1) || null;
  return { status: 'ok', history_pack: historyPack, bars_count: bars.length, latest_date: latestDate };
}

async function classify(row, context) {
  const { scopeIds, registry, providerNoData, staleTradingDays } = context;
  const symbol = normalizeSymbol(row.symbol);
  const explicitCanonical = normalizeCanonicalId(row.canonical_id);
  const symbolCandidates = symbol ? registry.bySymbol.get(symbol) || [] : [];
  const registryRow = explicitCanonical
    ? registry.byCanonical.get(explicitCanonical)
    : symbolCandidates.find((candidate) => !scopeIds.size || scopeIds.has(candidate.canonical_id)) || symbolCandidates[0] || null;
  const canonicalId = explicitCanonical || registryRow?.canonical_id || null;

  if (scopeIds.size && canonicalId && !scopeIds.has(canonicalId)) {
    return { reason: 'not_in_scope', registryRow, pack: null };
  }
  if (scopeIds.size && !canonicalId && symbolCandidates.length && !symbolCandidates.some((candidate) => scopeIds.has(candidate.canonical_id))) {
    return { reason: 'not_in_scope', registryRow: null, pack: null };
  }
  if (!registryRow && !canonicalId) return { reason: 'canonical_absent', registryRow: null, pack: null };
  if (providerNoData.ids.has(canonicalId) || providerNoData.symbols.has(symbol)) {
    return { reason: 'provider_no_data', registryRow, pack: null };
  }

  const metadataBars = Number(row.bars_count || registryRow?.bars_count || 0);
  if (metadataBars > 0 && metadataBars < MIN_BARS) {
    return { reason: 'low_bars', registryRow, pack: null };
  }

  const pack = await inspectPack(row, registryRow);
  if (pack.status === 'pack_missing') return { reason: 'pack_missing', registryRow, pack };
  if (pack.status === 'canonical_absent') return { reason: 'canonical_absent', registryRow, pack };
  if (pack.bars_count < MIN_BARS) return { reason: 'bars_lt60', registryRow, pack };

  const expectedDate = isoDate(row.expected_date || registryRow?.last_trade_date);
  const lag = tradingDaysBetween(pack.latest_date, expectedDate);
  if (lag != null && lag > staleTradingDays) {
    return { reason: 'stale_pack', registryRow, pack: { ...pack, stale_lag_trading_days: lag } };
  }
  return { reason: 'resolver_bug', registryRow, pack };
}

async function main() {
  const outputPath = path.resolve(ROOT, arg('output', OUTPUT_PATH));
  const staleTradingDays = Math.max(0, Number(arg('stale-trading-days', process.env.RV_HIST_PROBS_STALE_PACK_TRADING_DAYS || 5)) || 5);
  const scopeIds = readScopeIds();
  const registry = readRegistryIndex();
  const providerNoData = providerNoDataSet();
  const inputs = collectNoDataInputs();
  const counts = {
    not_in_scope: 0,
    low_bars: 0,
    pack_missing: 0,
    canonical_absent: 0,
    bars_lt60: 0,
    stale_pack: 0,
    provider_no_data: 0,
    resolver_bug: 0,
  };
  const samples = [];
  for (const row of inputs) {
    const result = await classify(row, { scopeIds, registry, providerNoData, staleTradingDays });
    counts[result.reason] = (counts[result.reason] || 0) + 1;
    if (samples.length < 250) {
      samples.push({
        symbol: row.symbol || result.registryRow?.symbol || null,
        canonical_id: row.canonical_id || result.registryRow?.canonical_id || null,
        exchange: row.exchange || result.registryRow?.exchange || null,
        reason: result.reason,
        input_bars_count: row.bars_count || null,
        registry_bars_count: result.registryRow?.bars_count ?? null,
        history_pack: result.pack?.history_pack || row.history_pack || result.registryRow?.history_pack || null,
        pack_bars_count: result.pack?.bars_count ?? null,
        latest_date: result.pack?.latest_date || null,
        expected_date: row.expected_date || result.registryRow?.last_trade_date || null,
        source: row.source || null,
      });
    }
  }
  const report = {
    schema: 'rv.hist_probs_no_data_diagnostics.v1',
    generated_at: new Date().toISOString(),
    input_count: inputs.length,
    scope_ids_count: scopeIds.size,
    stale_pack_threshold_trading_days: staleTradingDays,
    counts,
    unclassified_count: 0,
    resolver_bug_count: counts.resolver_bug || 0,
    samples,
  };
  writeJsonAtomic(outputPath, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
