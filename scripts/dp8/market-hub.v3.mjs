#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';

const INDEX_PROXIES = ['SPY', 'QQQ', 'DIA', 'IWM'];
const SECTOR_ETFS = ['XLK', 'XLF', 'XLE', 'XLY', 'XLI', 'XLP', 'XLV', 'XLU', 'XLB', 'XLRE', 'XLC'];

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

function latestBarMetrics(doc) {
  const bars = Array.isArray(doc) ? doc : Array.isArray(doc?.bars) ? doc.bars : Array.isArray(doc?.data) ? doc.data : [];
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2];
  const curr = bars[bars.length - 1];
  const prevClose = Number(prev?.close ?? prev?.c);
  const close = Number(curr?.close ?? curr?.c);
  const open = Number(curr?.open ?? curr?.o);
  const volume = Number(curr?.volume ?? curr?.v);
  if (!Number.isFinite(prevClose) || !Number.isFinite(close) || prevClose === 0) return null;
  const changePct = ((close - prevClose) / prevClose) * 100;
  return {
    close,
    open: Number.isFinite(open) ? open : null,
    volume: Number.isFinite(volume) ? volume : null,
    change_pct: Number(changePct.toFixed(4)),
    as_of: String(curr?.date ?? curr?.d ?? '').slice(0, 10) || null
  };
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
    as_of: null
  };
}

async function collectProxyRows(rootDir, symbols, ndjsonMap = new Map(), defaultAsOf = null) {
  const rows = [];
  for (const symbol of symbols) {
    const file = path.join(rootDir, 'public/data/eod/bars', `${symbol}.json`);
    const doc = await readJsonSafe(file, null);
    const fromBars = doc ? latestBarMetrics(doc) : null;
    const fromNdjson = metricsFromNdjsonRow(ndjsonMap.get(symbol));
    const metrics = fromBars || fromNdjson;
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

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const [healthDoc, moversDoc, eodGz] = await Promise.all([
    readJsonSafe(path.join(rootDir, 'public/data/v3/pulse/market-health/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/v3/pulse/top-movers/latest.json'), {}),
    fs.readFile(path.join(rootDir, 'public/data/v3/eod/US/latest.ndjson.gz')).catch(() => null)
  ]);

  const ndjsonRows = eodGz ? parseNdjsonGz(eodGz) : [];
  const ndjsonMap = new Map(
    ndjsonRows
      .map((row) => [normalizeTicker(row?.ticker || row?.symbol || ''), row])
      .filter(([ticker]) => ticker)
  );

  const defaultAsOf = String(runContext.generatedAt).slice(0, 10);
  const proxyRows = await collectProxyRows(rootDir, INDEX_PROXIES, ndjsonMap, defaultAsOf);
  const sectorRows = await collectProxyRows(rootDir, SECTOR_ETFS, ndjsonMap, defaultAsOf);
  sectorRows.sort((a, b) => Number(b.change_pct || -999) - Number(a.change_pct || -999) || a.symbol.localeCompare(b.symbol));

  const movers = Array.isArray(moversDoc?.top_movers)
    ? moversDoc.top_movers.slice(0, 25).map((row) => ({
        ticker: normalizeTicker(row?.ticker || row?.symbol || ''),
        change_pct: Number(row?.change_pct ?? 0),
        close: Number(row?.close ?? 0),
        volume: Number(row?.volume ?? 0)
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
        '/data/v3/eod/US/latest.ndjson.gz',
        '/data/eod/bars/*.json'
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
