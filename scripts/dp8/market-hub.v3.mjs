#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';
import { promoteToLastGood } from '../lib/v3/artifact-contract.mjs';
import { fetchEodBars } from '../lib/v3/eodhd-fetch.mjs';

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

const EODHD_BASE = 'https://eodhd.com/api';

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

async function fetchEodhdEod(symbol, date, apiKey) {
  // Query last 5 trading days to handle weekends/holidays
  const d = new Date(date);
  d.setDate(d.getDate() - 5);
  const fromDate = d.toISOString().slice(0, 10);
  const bars = await fetchEodBars(symbol, fromDate, date, apiKey);
  if (!bars || bars.length === 0) return null;
  const bar = bars[bars.length - 1];
  return {
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume) || null,
    date: String(bar.date || '').slice(0, 10)
  };
}

async function loadEtfProxyCache(rootDir) {
  return readJsonSafe(path.join(rootDir, 'public/data/v3/eod/US/etf-proxies.json'), {});
}

async function saveEtfProxyCache(rootDir, cache) {
  const outPath = path.join(rootDir, 'public/data/v3/eod/US/etf-proxies.json');
  await fs.writeFile(outPath, JSON.stringify(cache, null, 2), 'utf8');
}

async function collectProxyRows(symbols, ndjsonMap, defaultAsOf, apiKey, proxyCache) {
  const rows = [];
  const runDate = new Date(`${defaultAsOf}T00:00:00Z`);
  for (const symbol of symbols) {
    const fromNdjson = metricsFromNdjsonRow(ndjsonMap.get(symbol));
    if (fromNdjson) {
      rows.push({ symbol, ...fromNdjson, unavailable: false, source: 'ndjson' });
      continue;
    }

    // Use persisted ETF cache (same-day preferred, <=7d stale accepted).
    const cached = proxyCache[symbol];
    const cacheDate = String(cached?.date || '').slice(0, 10);
    const cacheTs = cacheDate ? new Date(`${cacheDate}T00:00:00Z`) : null;
    const cacheAgeDays = cacheTs && Number.isFinite(cacheTs.getTime()) && Number.isFinite(runDate.getTime())
      ? Math.max(0, Math.round((runDate - cacheTs) / 86400000))
      : null;

    if (cacheDate === defaultAsOf && cached?.close) {
      const metrics = metricsFromNdjsonRow({
        open: cached.open, close: cached.close, volume: cached.volume,
        trading_date: cached.date
      });
      if (metrics) {
        rows.push({ symbol, ...metrics, unavailable: false, source: 'eodhd-cached' });
        continue;
      }
    }

    if (cached?.close && Number.isFinite(cacheAgeDays) && cacheAgeDays <= 7) {
      const metrics = metricsFromNdjsonRow({
        open: cached.open, close: cached.close, volume: cached.volume,
        trading_date: cached.date
      });
      if (metrics) {
        rows.push({
          symbol,
          ...metrics,
          unavailable: false,
          source: 'eodhd-cached-stale',
          stale_days: cacheAgeDays
        });
        continue;
      }
    }

    // Try EODHD direct fetch for ETFs not in NDJSON/cache.
    if (apiKey) {

      const bar = await fetchEodhdEod(`${symbol}.US`, defaultAsOf, apiKey);
      if (bar && Number.isFinite(bar.close) && bar.close > 0) {
        proxyCache[symbol] = bar;
        const metrics = metricsFromNdjsonRow({
          open: bar.open, close: bar.close, volume: bar.volume,
          trading_date: bar.date
        });
        if (metrics) {
          rows.push({ symbol, ...metrics, unavailable: false, source: 'eodhd-direct' });
          continue;
        }
      }
    }

    rows.push({
      symbol, close: null, open: null, volume: null, change_pct: null,
      as_of: null, unavailable: true, source: 'unavailable'
    });
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
  const apiKey = process.env.EODHD_API_TOKEN || (process.env.EODHD_API_KEY?.length > 10 ? process.env.EODHD_API_KEY : '') || '';

  const [healthDoc, moversDoc, sectorMapDoc, eodGz, proxyCache, bootstrapDoc] = await Promise.all([
    readJsonSafe(path.join(rootDir, 'public/data/v3/pulse/market-health/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/v3/pulse/top-movers/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/v3/universe/sector-mapping/latest.json'), {}),
    fs.readFile(path.join(rootDir, 'public/data/v3/eod/US/latest.ndjson.gz')).catch(() => null),
    loadEtfProxyCache(rootDir),
    readJsonSafe(path.join(rootDir, 'config/sector-bootstrap.json'), {})
  ]);

  const ndjsonRows = eodGz ? parseNdjsonGz(eodGz) : [];
  const ndjsonMap = new Map(
    ndjsonRows
      .map((row) => [normalizeTicker(row?.ticker || row?.symbol || ''), row])
      .filter(([ticker]) => ticker)
  );

  // Derive data date from actual NDJSON data, NOT from build time.
  // Only fall back to build date if no real data date is available.
  const ndjsonDataDate = ndjsonRows.length > 0
    ? ndjsonRows.reduce((latest, row) => {
        const d = String(row?.trading_date || row?.date || '').slice(0, 10);
        return d > latest ? d : latest;
      }, '')
    : '';
  const buildDate = String(runContext.generatedAt).slice(0, 10);
  const defaultAsOf = ndjsonDataDate || buildDate;
  const proxyRows = await collectProxyRows(INDEX_PROXIES, ndjsonMap, defaultAsOf, apiKey, proxyCache);
  const rawSectorRows = await collectProxyRows(SECTOR_ETFS, ndjsonMap, defaultAsOf, apiKey, proxyCache);

  // Save proxy cache for next run
  if (apiKey) {
    await saveEtfProxyCache(rootDir, proxyCache).catch(() => {});
  }

  const sectorCounts = buildSectorCounts(sectorMapDoc?.sectors || []);
  const sectorRows = enrichSectorRows(rawSectorRows, sectorCounts)
    .sort((a, b) => Number(b.change_pct || -999) - Number(a.change_pct || -999) || a.symbol.localeCompare(b.symbol));

  // Enrich movers with bootstrap sectors when sector-mapping shows "Unknown"
  const bootstrapSectors = bootstrapDoc?.sectors || {};
  const movers = Array.isArray(moversDoc?.top_movers)
    ? moversDoc.top_movers.slice(0, 25).map((row) => {
        const ticker = normalizeTicker(row?.ticker || row?.symbol || '');
        let sector = typeof row?.sector === 'string' ? row.sector : null;
        if (!sector || sector === 'Unknown') {
          sector = bootstrapSectors[ticker] || 'Unknown';
        }
        return {
          ticker,
          change_pct: Number(row?.change_pct ?? 0),
          close: Number(row?.close ?? 0),
          volume: Number(row?.volume ?? 0),
          name: typeof row?.name === 'string' ? row.name : null,
          sector,
          in_universe: Boolean(row?.in_universe),
          as_of: String(row?.as_of || defaultAsOf || '').slice(0, 10) || null,
          lineage: row?.lineage && typeof row.lineage === 'object' ? row.lineage : null
        };
      })
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

  // data_date = actual market data date from available rows (never build time)
  const dataDate = proxyRows.find((row) => row?.as_of && !row.unavailable)?.as_of
    || rawSectorRows.find((row) => row?.as_of && !row.unavailable)?.as_of
    || defaultAsOf;
  const etfSources = [...proxyRows, ...rawSectorRows].map((r) => r.source).filter(Boolean);
  const doc = {
    meta: {
      schema_version: 'rv.derived.market.v1',
      generated_at: runContext.generatedAt,
      data_date: dataDate,
      provider: 'derived-local',
      source_chain: [
        '/data/v3/pulse/market-health/latest.json',
        '/data/v3/pulse/top-movers/latest.json',
        '/data/v3/universe/sector-mapping/latest.json',
        '/data/v3/eod/US/latest.ndjson.gz',
        '/data/v3/eod/US/etf-proxies.json'
      ],
      etf_sources: [...new Set(etfSources)],
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
  // Promote to last-known-good on successful build
  const available = [...proxyRows, ...rawSectorRows].filter((r) => !r.unavailable).length;
  const total = proxyRows.length + rawSectorRows.length;
  if (available > 0) {
    await promoteToLastGood(rootDir, 'public/data/v3/derived/market/latest.json', 'public/data/v3/derived/market/latest.last-good.json');
  }
  console.log(`DP8 market-hub done indices=${proxyRows.length} sectors=${sectorRows.length} movers=${movers.length} etf_available=${available}/${total}`);
}

main().catch((error) => {
  console.error(`DP8_MARKET_FAILED:${error?.message || error}`);
  process.exitCode = 1;
});
