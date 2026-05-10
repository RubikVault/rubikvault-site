#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { comparePreferredUniverseRows, isAllowedWebUniverseRecord } from '../../public/js/universe-ssot.js';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const OUT_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');

function argValue(name, fallback = '') {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] || fallback : fallback;
}

function normalizeTicker(raw) {
  return String(raw || '').trim().toUpperCase();
}

function toSafeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function qualityBasisRank(value) {
  const q = String(value || '').toLowerCase();
  if (q === 'backfill_real') return 3;
  if (q === 'daily_bulk_estimate') return 2;
  if (q === 'estimate') return 1;
  return 0;
}

function toDateScore(raw) {
  const date = String(raw || '').slice(0, 10);
  if (!date) return 0;
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : 0;
}

function layerRankForSearch(rawLayer) {
  const layer = String(rawLayer || '').toUpperCase();
  if (layer === 'L0_LEGACY_CORE') return 5;
  if (layer === 'L1_FULL') return 4;
  if (layer === 'L2_PARTIAL') return 3;
  if (layer === 'L3_MINIMAL') return 2;
  return 1;
}

function compareGlobalBestSearchCandidate(a, b) {
  const lr = layerRankForSearch(a?.layer) - layerRankForSearch(b?.layer);
  if (lr !== 0) return lr;
  const q = qualityBasisRank(a?.quality_basis) - qualityBasisRank(b?.quality_basis);
  if (q !== 0) return q;
  const d = toDateScore(a?.last_trade_date) - toDateScore(b?.last_trade_date);
  if (d !== 0) return d;
  const bars = toSafeNum(a?.bars_count, 0) - toSafeNum(b?.bars_count, 0);
  if (bars !== 0) return bars;
  const score = toSafeNum(a?.score_0_100, 0) - toSafeNum(b?.score_0_100, 0);
  if (score !== 0) return score;
  const vol = toSafeNum(a?.avg_volume_30d, 0) - toSafeNum(b?.avg_volume_30d, 0);
  if (vol !== 0) return vol;
  const ac = String(a?.canonical_id || '');
  const bc = String(b?.canonical_id || '');
  if (ac === bc) return 0;
  return ac < bc ? 1 : -1;
}

function readScopeSet(scopeFile) {
  if (!scopeFile) return null;
  const doc = JSON.parse(fs.readFileSync(path.resolve(ROOT, scopeFile), 'utf8'));
  const ids = Array.isArray(doc) ? doc : (doc.canonical_ids || doc.ids || []);
  return new Set(ids.map((id) => String(id || '').trim().toUpperCase()).filter(Boolean));
}

function readRegistryRows(scopeSet = null) {
  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const canonicalId = String(row?.canonical_id || '').trim().toUpperCase();
      if (scopeSet && !scopeSet.has(canonicalId)) continue;
      if (isAllowedWebUniverseRecord(row)) rows.push(row);
    } catch {
      // Registry validator owns malformed-row reporting.
    }
  }
  return rows;
}

function writeGzipJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(doc)), { level: 6 }));
  fs.renameSync(tmp, filePath);
}

function main() {
  const scopeFile = argValue('--scope-file', '');
  const scopeSet = readScopeSet(scopeFile);
  const bySymbolBest = new Map();
  for (const row of readRegistryRows(scopeSet)) {
    const symbol = normalizeTicker(row?.symbol);
    if (!symbol) continue;
    const candidate = {
      canonical_id: row.canonical_id,
      symbol,
      exchange: row.exchange || null,
      country: row.country || null,
      currency: row.currency || null,
      name: row.name || null,
      type_norm: row.type_norm,
      layer: row.computed?.layer || null,
      score_0_100: toSafeNum(row?.computed?.score_0_100, 0),
      bars_count: toSafeNum(row?.bars_count, 0),
      avg_volume_30d: toSafeNum(row?.avg_volume_30d, 0),
      last_trade_date: row?.last_trade_date || null,
      quality_basis: row?._quality_basis || null,
    };
    const current = bySymbolBest.get(symbol);
    if (!current) {
      bySymbolBest.set(symbol, { best: candidate, variants_count: 1 });
      continue;
    }
    current.variants_count += 1;
    const preferred = comparePreferredUniverseRows(candidate, current.best);
    if (preferred > 0 || (preferred === 0 && compareGlobalBestSearchCandidate(candidate, current.best) > 0)) current.best = candidate;
  }

  const bySymbol = {};
  const byPrefix1 = {};
  const symbols = Array.from(bySymbolBest.keys()).sort((a, b) => a.localeCompare(b));
  for (const symbol of symbols) {
    const entry = bySymbolBest.get(symbol);
    bySymbol[symbol] = { ...entry.best, variants_count: entry.variants_count };
    const p1 = symbol.charAt(0).toLowerCase() || '_';
    if (!byPrefix1[p1]) byPrefix1[p1] = [];
    byPrefix1[p1].push(symbol);
  }

  writeGzipJsonAtomic(OUT_PATH, {
    schema: 'rv_v7_search_exact_index_v1',
    generated_at: new Date().toISOString(),
    scope_mode: scopeSet ? 'scoped' : 'global_registry',
    scope_file: scopeFile || null,
    count: symbols.length,
    by_symbol: bySymbol,
    by_prefix_1: byPrefix1,
  });
  console.log(`[rebuild-search-exact-from-registry] wrote ${path.relative(ROOT, OUT_PATH)} count=${symbols.length}`);
}

main();
