import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DEFAULT_BASE = 'mirrors/universe-v7';
const DEFAULT_DELTAS = 'mirrors/universe-v7/history-deltas';
const MAX_HISTORY_PACK_ROWS_CACHE = Math.max(0, Number(process.env.RV_HISTORY_PACK_ROWS_CACHE_MAX || '32'));
const historyPackRowsCache = new Map();

export function normalizeCanonicalId(value) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeBar(row) {
  const date = String(row?.date || row?.trading_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    ...row,
    date,
  };
}

export function mergeBars(existing = [], incoming = []) {
  const byDate = new Map();
  for (const row of existing) {
    const clean = sanitizeBar(row);
    if (clean) byDate.set(clean.date, clean);
  }
  for (const row of incoming) {
    const clean = sanitizeBar(row);
    if (clean) byDate.set(clean.date, clean);
  }
  return [...byDate.keys()].sort().map((date) => byDate.get(date));
}

async function readNdjsonGz(filePath) {
  try {
    const raw = await fs.readFile(filePath);
    const body = zlib.gunzipSync(raw).toString('utf8');
    return body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function baseCandidates(repoRoot, relPack, baseDir = DEFAULT_BASE) {
  const rel = String(relPack || '').replace(/^\/+/, '');
  const stripped = rel.startsWith('history/') ? rel.slice('history/'.length) : rel;
  return [
    path.join(repoRoot, baseDir, rel),
    path.join(repoRoot, baseDir, 'history', rel),
    path.join(repoRoot, baseDir, 'history', stripped),
    path.join(repoRoot, 'public/data/universe/v7', rel),
  ];
}

function deltaCandidates(repoRoot, relPack, deltasDir = DEFAULT_DELTAS) {
  const rel = String(relPack || '').replace(/^\/+/, '');
  const abs = path.join(repoRoot, deltasDir, rel);
  const dir = path.dirname(abs);
  const prefix = `${path.basename(abs)}.delta-`;
  try {
    return fsSync.readdirSync(dir)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.ndjson.gz'))
      .sort()
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function historyPackCacheKey(repoRoot, relPack, options, includeDeltas) {
  return [
    path.resolve(repoRoot || '.'),
    String(options.baseDir || DEFAULT_BASE),
    String(options.deltasDir || DEFAULT_DELTAS),
    String(relPack || '').replace(/^\/+/, ''),
    includeDeltas ? 'deltas=1' : 'deltas=0',
  ].join('|');
}

function readRowsCache(key) {
  if (!MAX_HISTORY_PACK_ROWS_CACHE || !historyPackRowsCache.has(key)) return null;
  const rows = historyPackRowsCache.get(key);
  historyPackRowsCache.delete(key);
  historyPackRowsCache.set(key, rows);
  return rows;
}

function writeRowsCache(key, rows) {
  if (!MAX_HISTORY_PACK_ROWS_CACHE) return;
  historyPackRowsCache.set(key, rows);
  while (historyPackRowsCache.size > MAX_HISTORY_PACK_ROWS_CACHE) {
    const oldest = historyPackRowsCache.keys().next().value;
    historyPackRowsCache.delete(oldest);
  }
}

export async function readHistoryPackRows(repoRoot, relPack, options = {}) {
  const includeDeltas = options.includeDeltas ?? process.env.RV_HISTORY_READ_DELTAS === '1';
  const cacheKey = historyPackCacheKey(repoRoot, relPack, options, includeDeltas);
  const cached = readRowsCache(cacheKey);
  if (cached) return cached;
  let rows = [];
  for (const candidate of baseCandidates(repoRoot, relPack, options.baseDir)) {
    rows = await readNdjsonGz(candidate);
    if (rows.length) break;
  }
  if (!includeDeltas) {
    writeRowsCache(cacheKey, rows);
    return rows;
  }

  const byId = new Map();
  for (const row of rows) {
    const canonicalId = normalizeCanonicalId(row?.canonical_id);
    if (!canonicalId) continue;
    byId.set(canonicalId, { ...row, canonical_id: canonicalId, bars: Array.isArray(row?.bars) ? row.bars : [] });
  }

  for (const deltaPath of deltaCandidates(repoRoot, relPack, options.deltasDir)) {
    const deltaRows = await readNdjsonGz(deltaPath);
    for (const row of deltaRows) {
      const canonicalId = normalizeCanonicalId(row?.canonical_id);
      if (!canonicalId) continue;
      const current = byId.get(canonicalId) || { canonical_id: canonicalId, bars: [] };
      byId.set(canonicalId, {
        ...current,
        ...row,
        canonical_id: canonicalId,
        bars: mergeBars(current.bars || [], Array.isArray(row?.bars) ? row.bars : []),
      });
    }
  }

  const mergedRows = [...byId.keys()].sort().map((canonicalId) => byId.get(canonicalId));
  writeRowsCache(cacheKey, mergedRows);
  return mergedRows;
}

export async function readHistoryPackIndex(repoRoot, relPack, options = {}) {
  const rows = await readHistoryPackRows(repoRoot, relPack, options);
  const index = new Map();
  for (const row of rows) {
    const canonicalId = normalizeCanonicalId(row?.canonical_id);
    if (canonicalId) index.set(canonicalId, row);
  }
  return index;
}
