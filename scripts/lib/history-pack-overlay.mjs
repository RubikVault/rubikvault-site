import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DEFAULT_BASE = 'mirrors/universe-v7';
const DEFAULT_DELTAS = 'mirrors/universe-v7/history-deltas';

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

export async function readHistoryPackRows(repoRoot, relPack, options = {}) {
  const includeDeltas = options.includeDeltas ?? process.env.RV_HISTORY_READ_DELTAS === '1';
  let rows = [];
  for (const candidate of baseCandidates(repoRoot, relPack, options.baseDir)) {
    rows = await readNdjsonGz(candidate);
    if (rows.length) break;
  }
  if (!includeDeltas) return rows;

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

  return [...byId.keys()].sort().map((canonicalId) => byId.get(canonicalId));
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
