import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { writeJsonAtomic } from '../lib/fs-atomic.mjs';

export const ROOT_DIR = process.cwd();
const gzipNdjsonCache = new Map();
const eodLatestCache = new Map();
const adjustedSeriesCache = new Map();

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

export async function readJson(relPath, fallback = null) {
  const abs = path.join(ROOT_DIR, relPath);
  try {
    const raw = await fs.readFile(abs, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseNdjson(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function readGzipNdjson(relPath, fallback = null) {
  if (gzipNdjsonCache.has(relPath)) return gzipNdjsonCache.get(relPath);
  const abs = path.join(ROOT_DIR, relPath);
  try {
    const gz = await fs.readFile(abs);
    const rows = parseNdjson(zlib.gunzipSync(gz).toString('utf8'));
    gzipNdjsonCache.set(relPath, rows);
    return rows;
  } catch {
    gzipNdjsonCache.set(relPath, fallback);
    return fallback;
  }
}

export async function writeJson(relPath, doc) {
  const abs = path.join(ROOT_DIR, relPath);
  await writeJsonAtomic(abs, doc);
  return relPath;
}

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function loadEodLatestMap(relPath = 'public/data/v3/eod/US/latest.ndjson.gz') {
  if (eodLatestCache.has(relPath)) return eodLatestCache.get(relPath);
  const rows = await readGzipNdjson(relPath, []);
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol || row?.canonical_id?.split(':')?.[1] || '');
    if (!ticker) continue;
    const date = String(row?.trading_date || row?.date || '').slice(0, 10);
    const close = toFinite(row?.close ?? row?.adjusted_close ?? row?.adj_close);
    if (!date || close == null) continue;
    map.set(ticker, {
      ticker,
      date,
      open: toFinite(row?.open),
      high: toFinite(row?.high),
      low: toFinite(row?.low),
      close,
      volume: toFinite(row?.volume)
    });
  }
  eodLatestCache.set(relPath, map);
  return map;
}

export async function loadAdjustedSeries(ticker, exchange = 'US') {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return [];
  const key = `${exchange}__${symbol}`;
  if (adjustedSeriesCache.has(key)) return adjustedSeriesCache.get(key);
  const relPath = `public/data/v3/series/adjusted/${key}.ndjson.gz`;
  const rows = await readGzipNdjson(relPath, []);
  const out = Array.isArray(rows)
    ? rows
      .map((row) => {
        const date = String(row?.trading_date || row?.date || '').slice(0, 10);
        const close = toFinite(row?.adjusted_close ?? row?.adj_close ?? row?.close);
        if (!date || close == null) return null;
        return {
          date,
          open: toFinite(row?.open),
          high: toFinite(row?.high),
          low: toFinite(row?.low),
          close,
          volume: toFinite(row?.volume)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  adjustedSeriesCache.set(key, out);
  return out;
}

export function normalizeBars(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const date = String(row.date || '').slice(0, 10);
    const close = Number(row.close);
    if (!date || !Number.isFinite(close)) continue;
    out.push({
      date,
      open: Number.isFinite(Number(row.open)) ? Number(row.open) : null,
      high: Number.isFinite(Number(row.high)) ? Number(row.high) : null,
      low: Number.isFinite(Number(row.low)) ? Number(row.low) : null,
      close,
      volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : null
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function computeReturnsFromBars(rows) {
  const bars = normalizeBars(rows);
  if (!bars.length) {
    return { as_of: null, d1: null, ytd: null, y1: null, y5: null };
  }

  const latest = bars[bars.length - 1];
  const byOffset = (offset) => {
    if (bars.length <= offset) return null;
    const ref = bars[bars.length - 1 - offset];
    if (!ref || !Number.isFinite(ref.close) || ref.close === 0) return null;
    return (latest.close - ref.close) / ref.close;
  };

  const latestYear = Number(String(latest.date).slice(0, 4));
  let ytd = null;
  for (let i = 0; i < bars.length; i += 1) {
    const row = bars[i];
    if (Number(String(row.date).slice(0, 4)) !== latestYear) continue;
    if (!Number.isFinite(row.close) || row.close === 0) continue;
    ytd = (latest.close - row.close) / row.close;
    break;
  }

  return {
    as_of: latest.date,
    d1: byOffset(1),
    ytd,
    y1: byOffset(252),
    y5: byOffset(1260)
  };
}

export function averageVolume20(rows) {
  const bars = normalizeBars(rows);
  if (!bars.length) return null;
  const slice = bars.length > 20 ? bars.slice(bars.length - 20) : bars;
  const vols = slice.map((row) => Number(row.volume)).filter((v) => Number.isFinite(v) && v >= 0);
  if (!vols.length) return null;
  const sum = vols.reduce((acc, v) => acc + v, 0);
  return sum / vols.length;
}

export async function loadUniverse(relPath = 'public/data/universe/all.json') {
  const rows = await readJson(relPath, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({ ticker: normalizeTicker(row?.ticker || row?.symbol), name: String(row?.name || '').trim() }))
    .filter((row) => row.ticker)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export async function loadIndexUniverseMap() {
  const defs = [
    ['nasdaq100', 'public/data/universe/nasdaq100.json'],
    ['sp500', 'public/data/universe/sp500.json'],
    ['dowjones', 'public/data/universe/dowjones.json'],
    ['russell2000', 'public/data/universe/russell2000.json']
  ];
  const out = new Map();
  for (const [name, rel] of defs) {
    const rows = await readJson(rel, []);
    const set = new Set();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const ticker = normalizeTicker(row?.ticker || row?.symbol || row);
        if (ticker) set.add(ticker);
      }
    }
    out.set(name, set);
  }
  return out;
}

export function getPrimaryIndex(ticker, indexMap) {
  if (!(indexMap instanceof Map)) return 'all';
  if (indexMap.get('nasdaq100')?.has(ticker)) return 'nasdaq100';
  if (indexMap.get('dowjones')?.has(ticker)) return 'dowjones';
  if (indexMap.get('sp500')?.has(ticker)) return 'sp500';
  if (indexMap.get('russell2000')?.has(ticker)) return 'russell2000';
  return 'all';
}

export function pearsonCorrelation(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys)) return null;
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i += 1) {
    const x = Number(xs[i]);
    const y = Number(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }

  const num = n * sumXY - sumX * sumY;
  const denA = n * sumXX - sumX * sumX;
  const denB = n * sumYY - sumY * sumY;
  if (denA <= 0 || denB <= 0) return null;

  return num / Math.sqrt(denA * denB);
}

export function buildReturnSeries(rows) {
  const bars = normalizeBars(rows);
  const out = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if (!prev || !curr || !Number.isFinite(prev.close) || !Number.isFinite(curr.close) || prev.close === 0) continue;
    out.push({ date: curr.date, ret: (curr.close - prev.close) / prev.close });
  }
  return out;
}

export function overlapReturnSeries(aRows, bRows, window = 90) {
  const aSeries = buildReturnSeries(aRows);
  const bSeries = buildReturnSeries(bRows);
  if (!aSeries.length || !bSeries.length) return { a: [], b: [] };

  const bMap = new Map(bSeries.map((row) => [row.date, row.ret]));
  const points = [];
  for (const row of aSeries) {
    if (!bMap.has(row.date)) continue;
    points.push({ date: row.date, a: row.ret, b: bMap.get(row.date) });
  }
  points.sort((x, y) => x.date.localeCompare(y.date));
  const tail = points.length > window ? points.slice(points.length - window) : points;

  return {
    a: tail.map((row) => row.a),
    b: tail.map((row) => row.b)
  };
}
