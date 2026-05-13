#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_SCOPE = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DEFAULT_ROWS = path.join(ROOT, 'mirrors/universe-v7/ssot/assets.global.rows.json');
const DEFAULT_SOURCE = path.join(ROOT, 'public/data/snapshots/stock-analysis.json');
const DEFAULT_OUT_ROOT = path.join(ROOT, 'public/data/supermodules/scientific-per-asset');
const SHARD_COUNT = 32;

function parseArgs(argv) {
  const get = (name, fallback = null) => {
    const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
    if (inline) return inline.split('=').slice(1).join('=');
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] || fallback : fallback;
  };
  return {
    targetMarketDate: String(get('target-market-date', process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '') || '').slice(0, 10),
    scopePath: path.resolve(ROOT, get('scope-file', DEFAULT_SCOPE)),
    rowsPath: path.resolve(ROOT, get('rows-file', DEFAULT_ROWS)),
    sourcePath: path.resolve(ROOT, get('source', DEFAULT_SOURCE)),
    outRoot: path.resolve(ROOT, get('out-root', DEFAULT_OUT_ROOT)),
  };
}

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeGzipJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(doc), 'utf8'), { level: 6 }));
  fs.renameSync(tmp, filePath);
}

function norm(value) {
  return String(value || '').trim().toUpperCase();
}

function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function shardFor(canonicalId) {
  let hash = 0;
  for (const ch of String(canonicalId || '')) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  return String(hash % SHARD_COUNT).padStart(2, '0');
}

function readScope(scopePath) {
  const doc = readJsonMaybe(scopePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : Array.isArray(doc) ? doc : [];
  return ids.map(norm).filter(Boolean);
}

function readRows(rowsPath) {
  const doc = readJsonMaybe(rowsPath);
  const rows = Array.isArray(doc?.rows) ? doc.rows : Array.isArray(doc?.items) ? doc.items : Array.isArray(doc) ? doc : [];
  const byId = new Map();
  for (const row of rows) {
    const id = norm(row?.canonical_id || row?.asset_id);
    if (!id) continue;
    byId.set(id, row);
  }
  return byId;
}

function sourceFreshness(raw, targetMarketDate) {
  const generatedAt = raw?._meta?.generated_at || raw?.generated_at || null;
  const dependencyStatus = String(raw?._meta?.dependency_marketphase_deep_status || 'ok');
  const sourceTarget = dateOnly(raw?._meta?.target_market_date || raw?._meta?.as_of || raw?.target_market_date || raw?.as_of);
  const generatedDate = dateOnly(generatedAt);
  const fresh = Boolean(
    targetMarketDate
    && dependencyStatus === 'ok'
    && (
      sourceTarget === targetMarketDate
      || (!sourceTarget && generatedDate && generatedDate >= targetMarketDate)
    )
  );
  return {
    generated_at: generatedAt,
    source_target_market_date: sourceTarget,
    dependency_marketphase_deep_status: dependencyStatus,
    fresh,
  };
}

function lookupAnalysis(raw, row, canonicalId) {
  const symbol = norm(row?.symbol || canonicalId.split(':').pop());
  const candidates = [
    symbol,
    symbol.replace(/\.[A-Z]+$/, ''),
    canonicalId,
    canonicalId.split(':').pop(),
  ].filter(Boolean);
  for (const key of candidates) {
    if (raw?.[key] && typeof raw[key] === 'object') return raw[key];
  }
  return null;
}

function compactAnalysis(analysis, { canonicalId, row, targetMarketDate, sourceMeta }) {
  const assetClass = norm(row?.type_norm || row?.asset_class || row?.type);
  const displayTicker = norm(row?.symbol || canonicalId.split(':').pop());
  if (assetClass !== 'STOCK') {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'not_applicable',
      as_of: targetMarketDate || null,
      reason: 'scientific_model_stock_only',
      source: 'scientific_per_asset_projection',
    };
  }
  if (!sourceMeta.fresh) {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'stale',
      as_of: sourceMeta.source_target_market_date || dateOnly(sourceMeta.generated_at),
      reason: 'scientific_source_stale_or_unverified',
      source: 'stock-analysis.json',
    };
  }
  if (!analysis) {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'unavailable',
      as_of: targetMarketDate || null,
      reason: 'scientific_entry_missing',
      source: 'stock-analysis.json',
    };
  }
  const rawStatus = norm(analysis.status);
  if (rawStatus && rawStatus !== 'OK' && rawStatus !== 'READY') {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'unavailable',
      as_of: targetMarketDate || null,
      reason: String(analysis.reason || rawStatus || 'scientific_not_ready'),
      source: 'stock-analysis.json',
    };
  }
  return {
    canonical_id: canonicalId,
    display_ticker: displayTicker,
    asset_class: assetClass,
    status: 'ok',
    as_of: targetMarketDate || null,
    reason: null,
    score: Number.isFinite(Number(analysis.probability)) ? Number(analysis.probability) : null,
    setup: {
      fulfilled: Boolean(analysis.setup?.fulfilled),
      score: Number.isFinite(Number(analysis.setup?.score)) ? Number(analysis.setup.score) : null,
      conditions_met: analysis.setup?.conditions_met || null,
    },
    trigger: {
      fulfilled: Boolean(analysis.trigger?.fulfilled),
      score: Number.isFinite(Number(analysis.trigger?.score)) ? Number(analysis.trigger.score) : null,
      conditions_met: analysis.trigger?.conditions_met || null,
    },
    source: 'stock-analysis.json',
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.targetMarketDate) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const generatedAt = new Date().toISOString();
  const scope = readScope(opts.scopePath);
  const rows = readRows(opts.rowsPath);
  const raw = readJsonMaybe(opts.sourcePath) || {};
  const sourceMeta = sourceFreshness(raw, opts.targetMarketDate);
  const shards = new Map();
  const counts = { ok: 0, not_applicable: 0, stale: 0, unavailable: 0, error: 0 };
  for (const canonicalId of scope) {
    const row = rows.get(canonicalId) || {};
    const item = compactAnalysis(lookupAnalysis(raw, row, canonicalId), {
      canonicalId,
      row,
      targetMarketDate: opts.targetMarketDate,
      sourceMeta,
    });
    counts[item.status] = (counts[item.status] || 0) + 1;
    const shard = shardFor(canonicalId);
    if (!shards.has(shard)) shards.set(shard, {});
    shards.get(shard)[canonicalId] = item;
  }
  fs.rmSync(path.join(opts.outRoot, 'shards'), { recursive: true, force: true });
  const shardFiles = [];
  for (const [shard, byAsset] of Array.from(shards.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const rel = `shards/${shard}.json.gz`;
    writeGzipJsonAtomic(path.join(opts.outRoot, rel), {
      schema: 'rv.scientific_per_asset_shard.v1',
      target_market_date: opts.targetMarketDate,
      generated_at: generatedAt,
      shard,
      by_asset: byAsset,
    });
    shardFiles.push(rel);
  }
  const latest = {
    schema: 'rv.scientific_per_asset_latest.v1',
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    scope_count: scope.length,
    counts,
    source: {
      path: path.relative(ROOT, opts.sourcePath).split(path.sep).join('/'),
      ...sourceMeta,
    },
    shard_count: shardFiles.length,
    shard_files: shardFiles,
  };
  writeJsonAtomic(path.join(opts.outRoot, 'latest.json'), latest);
  process.stdout.write(`${JSON.stringify({ ok: true, target_market_date: opts.targetMarketDate, scope_count: scope.length, counts })}\n`);
}

main();
