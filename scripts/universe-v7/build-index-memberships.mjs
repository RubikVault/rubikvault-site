#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/data/universe/v7/index-memberships');
const SEARCH_EXACT_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');

const INDEX_DEFS = [
  {
    id: 'sp500',
    label: 'S&P 500',
    input: 'public/data/universe/sp500.json',
    source_kind: 'official_or_provider_snapshot',
    source_url: 'https://www.spglobal.com/spdji/en/indices/equity/sp-500/',
    expected_min: 490,
    expected_max: 510,
  },
  {
    id: 'nasdaq100',
    label: 'Nasdaq-100',
    input: 'public/data/universe/nasdaq100.json',
    source_kind: 'official_or_provider_snapshot',
    source_url: 'https://www.nasdaq.com/market-activity/quotes/nasdaq-ndx-index',
    expected_min: 95,
    expected_max: 105,
  },
  {
    id: 'dowjones',
    label: 'Dow Jones Industrial Average',
    input: 'public/data/universe/dowjones.json',
    source_kind: 'official_or_provider_snapshot',
    source_url: 'https://www.spglobal.com/spdji/en/indices/equity/dow-jones-industrial-average/',
    expected_min: 30,
    expected_max: 30,
  },
  {
    id: 'russell2000',
    label: 'Russell 2000',
    input: 'public/data/universe/russell2000.json',
    source_kind: 'proxy_iwm_holdings_or_provider_snapshot',
    source_url: 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf',
    expected_min: 1500,
    expected_max: 2500,
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), 'utf8'));
}

function readSearchExact() {
  try {
    const raw = zlib.gunzipSync(fs.readFileSync(SEARCH_EXACT_PATH)).toString('utf8');
    const doc = JSON.parse(raw);
    return doc?.by_symbol && typeof doc.by_symbol === 'object' ? doc.by_symbol : {};
  } catch {
    return {};
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeTicker(raw) {
  return String(raw || '').trim().toUpperCase();
}

function normalizeRows(doc) {
  const rows = Array.isArray(doc) ? doc : (Array.isArray(doc?.symbols) ? doc.symbols : []);
  const map = new Map();
  for (const row of rows) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol || row?.s || row);
    if (!ticker) continue;
    const name = String(row?.name || row?.n || ticker).trim();
    map.set(ticker, { ticker, name: name || ticker });
  }
  return Array.from(map.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function assertNoSyntheticRows(def, rows) {
  const synthetic = rows.filter((row) => /^Company\s+[A-Z0-9.\-]+$/i.test(row.name || ''));
  if (synthetic.length) {
    throw new Error(`INDEX_SYNTHETIC_ROWS:${def.id}:${synthetic.slice(0, 10).map((row) => row.ticker).join(',')}`);
  }
}

function buildMembership(def, bySymbol, generatedAt) {
  const inputAbs = path.join(ROOT, def.input);
  const raw = fs.readFileSync(inputAbs, 'utf8');
  const rows = normalizeRows(JSON.parse(raw));
  assertNoSyntheticRows(def, rows);
  if (rows.length < def.expected_min || rows.length > def.expected_max) {
    throw new Error(`INDEX_COUNT_OUT_OF_RANGE:${def.id}:${rows.length}:expected:${def.expected_min}-${def.expected_max}`);
  }
  const constituents = rows.map((row) => {
    const resolved = bySymbol[row.ticker] || null;
    return {
      ticker: row.ticker,
      name: row.name,
      canonical_id: resolved?.canonical_id || null,
      type_norm: resolved?.type_norm || null,
    };
  });
  const unmatched = constituents.filter((row) => !row.canonical_id).map((row) => row.ticker);
  if (unmatched.length) throw new Error(`INDEX_UNMATCHED_SYMBOLS:${def.id}:${unmatched.slice(0, 25).join(',')}`);
  return {
    schema: 'rv.index_membership.v1',
    generated_at: generatedAt,
    index_id: def.id,
    label: def.label,
    source_kind: def.source_kind,
    source_url: def.source_url,
    source_input_path: def.input,
    source_sha256: sha256(raw),
    expected_min: def.expected_min,
    expected_max: def.expected_max,
    count: constituents.length,
    unmatched_count: unmatched.length,
    unmatched,
    constituents,
  };
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function main() {
  const scopeMode = (process.env.RV_UNIVERSE_SCOPE_MODE || 'global_registry').trim().toLowerCase();
  if (scopeMode === 'index_core') {
    console.log('[build-index-memberships] skipped: index_core mode writes memberships in builder');
    return;
  }
  const generatedAt = new Date().toISOString();
  const bySymbol = readSearchExact();
  const memberships = INDEX_DEFS.map((def) => buildMembership(def, bySymbol, generatedAt));
  for (const doc of memberships) {
    writeJsonAtomic(path.join(OUT_DIR, `${doc.index_id}.json`), doc);
  }
  writeJsonAtomic(path.join(OUT_DIR, 'manifest.json'), {
    schema: 'rv.index_memberships_manifest.v1',
    generated_at: generatedAt,
    count: memberships.length,
    indexes: memberships.map((doc) => ({
      index_id: doc.index_id,
      label: doc.label,
      count: doc.count,
      unmatched_count: doc.unmatched_count,
      path: `/data/universe/v7/index-memberships/${doc.index_id}.json`,
      source_kind: doc.source_kind,
      source_url: doc.source_url,
    })),
  });
  console.log(`[build-index-memberships] wrote ${memberships.length} index membership files`);
}

main();
