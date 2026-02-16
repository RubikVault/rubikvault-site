#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';

const INDEX_PROXIES = ['SPY', 'QQQ', 'DIA', 'IWM'];
const SECTOR_ETFS = ['XLK', 'XLF', 'XLE', 'XLY', 'XLI', 'XLP', 'XLV', 'XLU', 'XLB', 'XLRE', 'XLC'];
const SECTOR_META = {
  XLK: { display_name: 'Technology', labels: ['Technology'], order: 1, color: '#0ea5e9' },
  XLF: { display_name: 'Financials', labels: ['Financial Services', 'Financial'], order: 2, color: '#22c55e' },
  XLV: { display_name: 'Health Care', labels: ['Healthcare', 'Health Care'], order: 3, color: '#ef4444' },
  XLE: { display_name: 'Energy', labels: ['Energy'], order: 4, color: '#f59e0b' },
  XLI: { display_name: 'Industrials', labels: ['Industrials', 'Industrial'], order: 5, color: '#64748b' },
  XLY: { display_name: 'Consumer Discretionary', labels: ['Consumer Cyclical', 'Consumer Discretionary'], order: 6, color: '#a855f7' },
  XLP: { display_name: 'Consumer Staples', labels: ['Consumer Defensive', 'Consumer Staples'], order: 7, color: '#84cc16' },
  XLU: { display_name: 'Utilities', labels: ['Utilities'], order: 8, color: '#06b6d4' },
  XLB: { display_name: 'Materials', labels: ['Basic Materials', 'Materials'], order: 9, color: '#b45309' },
  XLRE: { display_name: 'Real Estate', labels: ['Real Estate'], order: 10, color: '#14b8a6' },
  XLC: { display_name: 'Communication Services', labels: ['Communication Services'], order: 11, color: '#f43f5e' }
};

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseNdjsonGz(buffer) {
  const text = zlib.gunzipSync(buffer).toString('utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeTicker(raw) {
  const value = String(raw || '').trim().toUpperCase();
  return /^[A-Z0-9.\-]{1,15}$/.test(value) ? value : '';
}

function metricsFromNdjsonRow(row) {
  if (!row || typeof row !== 'object') return null;
  const open = Number(row.open);
  const close = Number(row.close);
  if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) return null;
  return {
    close,
    open,
    volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : null,
    change_pct: Number((((close - open) / open) * 100).toFixed(4)),
    as_of: String(row.trading_date || row.date || '').slice(0, 10) || null
  };
}

async function collectProxyRows(symbols, ndjsonMap = new Map(), defaultAsOf = null) {
  const rows = [];
  for (const symbol of symbols) {
    const fromNdjson = metricsFromNdjsonRow(ndjsonMap.get(symbol));
    const metrics = fromNdjson;
    if (!metrics) {
      rows.push({
        symbol,
        close: null,
        open: null,
        volume: null,
        change_pct: null,
        as_of: defaultAsOf,
        unavailable: true
      });
      continue;
    }
    rows.push({ symbol, ...metrics, unavailable: false });
  }
  return rows;
}

function avg(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function buildSectorCounts(rows) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const sector = String(row?.sector || '').trim();
    if (!sector || sector.toLowerCase() === 'unknown') continue;
    counts.set(sector, Number(counts.get(sector) || 0) + 1);
  }
  return counts;
}

function enrichSectorRows(rows, sectorCounts) {
  return rows.map((row) => {
    const meta = SECTOR_META[row.symbol] || null;
    if (!meta) return row;
    const matched = (meta.labels || []).find((label) => sectorCounts.has(label)) || null;
    const displayName = matched || meta.display_name || row.symbol;
    return {
      ...row,
      sector: displayName,
      display_name: displayName,
      order: Number(meta.order || 999),
      ...(meta.color ? { color: meta.color } : {})
    };
  });
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const [healthDoc, moversDoc, sectorMapDoc, eodGz] = await Promise.all([
    readJsonSafe(path.join(rootDir, 'public/data/v3/pulse/market-health/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/v3/pulse/top-movers/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/v3/universe/sector-mapping/latest.json'), {}),
    fs.readFile(path.join(rootDir, 'public/data/v3/eod/US/latest.ndjson.gz')).catch(() => null)
  ]);

  const ndjsonRows = eodGz ? parseNdjsonGz(eodGz) : [];
  const ndjsonMap = new Map(
    ndjsonRows
      .map((row) => [normalizeTicker(row?.ticker || row?.symbol || ''), row])
      .filter(([ticker]) => ticker)
  );

  const defaultAsOf = String(runContext.generatedAt).slice(0, 10);
  const proxyRows = await collectProxyRows(INDEX_PROXIES, ndjsonMap, defaultAsOf);
  const rawSectorRows = await collectProxyRows(SECTOR_ETFS, ndjsonMap, defaultAsOf);
  const sectorCounts = buildSectorCounts(sectorMapDoc?.sectors || []);
  const sectorRows = enrichSectorRows(rawSectorRows, sectorCounts)
    .sort((a, b) => Number(b.change_pct || -999) - Number(a.change_pct || -999) || a.symbol.localeCompare(b.symbol));

  const movers = Array.isArray(moversDoc?.top_movers)
    ? moversDoc.top_movers.slice(0, 25).map((row) => ({
        ticker: normalizeTicker(row?.ticker || row?.symbol || ''),
        change_pct: Number(row?.change_pct ?? 0),
        close: Number(row?.close ?? 0),
        volume: Number(row?.volume ?? 0),
        name: typeof row?.name === 'string' ? row.name : null,
        sector: typeof row?.sector === 'string' ? row.sector : null,
        in_universe: Boolean(row?.in_universe),
        as_of: String(row?.as_of || defaultAsOf || '').slice(0, 10) || null,
        lineage: row?.lineage && typeof row.lineage === 'object' ? row.lineage : null
      }))
    : [];

  const cyclical = ['XLY', 'XLI', 'XLF'];
  const defensive = ['XLP', 'XLU', 'XLV'];
  const cyclicalAvg = avg(cyclical.map((sym) => sectorRows.find((r) => r.symbol === sym)?.change_pct));
  const defensiveAvg = avg(defensive.map((sym) => sectorRows.find((r) => r.symbol === sym)?.change_pct));

  const pulse = {
    risk_mode: Number.isFinite(cyclicalAvg) && Number.isFinite(defensiveAvg)
      ? (cyclicalAvg >= defensiveAvg ? 'risk-on' : 'risk-off')
      : 'unknown',
    breadth_up: Number(healthDoc?.breadth?.up ?? 0),
    breadth_down: Number(healthDoc?.breadth?.down ?? 0),
    average_change_pct: Number(healthDoc?.average_change_pct ?? 0),
    risk_on_off: Number.isFinite(cyclicalAvg) && Number.isFinite(defensiveAvg)
      ? Number((cyclicalAvg - defensiveAvg).toFixed(4))
      : null,
    symbols_covered: ndjsonRows.length || Number(healthDoc?.coverage?.symbols ?? 0)
  };

  const asOf = proxyRows.find((row) => row?.as_of)?.as_of || defaultAsOf;
  const doc = {
    meta: {
      schema_version: 'rv.derived.market.v1',
      generated_at: runContext.generatedAt,
      data_date: asOf,
      provider: 'derived-local',
      source_chain: [
        '/data/v3/pulse/market-health/latest.json',
        '/data/v3/pulse/top-movers/latest.json',
        '/data/v3/universe/sector-mapping/latest.json',
        '/data/v3/eod/US/latest.ndjson.gz'
      ],
      run_id: runContext.runId,
      commit: runContext.commit
    },
    data: {
      pulse,
      indices: proxyRows,
      sectors: sectorRows,
      movers
    }
  };

  await writeJsonArtifact(rootDir, 'public/data/v3/derived/market/latest.json', doc);
  console.log(`DP8 market-hub done indices=${proxyRows.length} sectors=${sectorRows.length} movers=${movers.length}`);
}

main().catch((error) => {
  console.error(`DP8_MARKET_FAILED:${error?.message || error}`);
  process.exitCode = 1;
});
