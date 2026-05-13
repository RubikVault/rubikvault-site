#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_SCOPE = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DEFAULT_ROWS = path.join(ROOT, 'mirrors/universe-v7/ssot/assets.global.rows.json');
const DEFAULT_QUANTLAB_ROOT = path.join(ROOT, 'public/data/quantlab/stock-insights');
const DEFAULT_OUT_ROOT = path.join(ROOT, 'public/data/quantlab/model-coverage');
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
    quantlabRoot: path.resolve(ROOT, get('quantlab-root', DEFAULT_QUANTLAB_ROOT)),
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
    if (id) byId.set(id, row);
  }
  return byId;
}

function readQuantlabRows(root) {
  const byId = new Map();
  const byTicker = new Map();
  for (const cls of ['stocks', 'etfs']) {
    const dir = path.join(root, cls);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const doc = readJsonMaybe(path.join(dir, name));
      const entries = doc?.byTicker && typeof doc.byTicker === 'object' ? Object.entries(doc.byTicker) : [];
      for (const [ticker, row] of entries) {
        const id = norm(row?.assetId || row?.canonical_id || row?.asset_id);
        if (id) byId.set(id, row);
        const sym = norm(row?.ticker || ticker);
        if (sym) byTicker.set(sym, row);
      }
    }
  }
  return { byId, byTicker };
}

function compactQuantlab(row, { canonicalId, registryRow, targetMarketDate, metaAsOf }) {
  const assetClass = norm(registryRow?.type_norm || registryRow?.asset_class || registryRow?.type);
  const displayTicker = norm(registryRow?.symbol || canonicalId.split(':').pop());
  if (assetClass === 'INDEX') {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'not_applicable',
      as_of: targetMarketDate || null,
      reason: 'quantlab_model_stock_etf_only',
      source: 'quantlab_model_coverage',
    };
  }
  if (!['STOCK', 'ETF'].includes(assetClass)) {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'not_applicable',
      as_of: targetMarketDate || null,
      reason: 'asset_class_out_of_scope',
      source: 'quantlab_model_coverage',
    };
  }
  if (!row) {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'unavailable',
      as_of: metaAsOf || null,
      reason: 'quantlab_entry_missing',
      source: 'quantlab_stock_insights',
    };
  }
  const rowAsOf = dateOnly(row.asOfDate || row.as_of || metaAsOf);
  if (!rowAsOf || rowAsOf < targetMarketDate) {
    return {
      canonical_id: canonicalId,
      display_ticker: displayTicker,
      asset_class: assetClass,
      status: 'stale',
      as_of: rowAsOf,
      reason: 'quantlab_model_cutoff_stale',
      source: 'quantlab_stock_insights',
    };
  }
  return {
    canonical_id: canonicalId,
    display_ticker: displayTicker,
    asset_class: assetClass,
    status: 'ok',
    as_of: rowAsOf,
    reason: null,
    state: row.state?.label || null,
    tone: row.state?.tone || null,
    avg_top_percentile: Number.isFinite(Number(row.ranking?.avgTopPercentile)) ? Number(row.ranking.avgTopPercentile) : null,
    buy_experts: Number.isFinite(Number(row.consensus?.buyExperts)) ? Number(row.consensus.buyExperts) : null,
    avoid_experts: Number.isFinite(Number(row.consensus?.avoidExperts)) ? Number(row.consensus.avoidExperts) : null,
    source: 'quantlab_stock_insights',
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.targetMarketDate) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const generatedAt = new Date().toISOString();
  const scope = readScope(opts.scopePath);
  const rows = readRows(opts.rowsPath);
  const meta = readJsonMaybe(path.join(opts.quantlabRoot, 'latest.json')) || {};
  const metaAsOf = dateOnly(meta.asOfDate || meta.as_of || meta.target_market_date);
  const quantlab = readQuantlabRows(opts.quantlabRoot);
  const shards = new Map();
  const counts = { ok: 0, not_applicable: 0, stale: 0, unavailable: 0, error: 0 };
  for (const canonicalId of scope) {
    const registryRow = rows.get(canonicalId) || {};
    const symbol = norm(registryRow?.symbol || canonicalId.split(':').pop());
    const row = quantlab.byId.get(canonicalId) || quantlab.byTicker.get(symbol) || null;
    const item = compactQuantlab(row, { canonicalId, registryRow, targetMarketDate: opts.targetMarketDate, metaAsOf });
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
      schema: 'rv.quantlab_model_coverage_shard.v1',
      target_market_date: opts.targetMarketDate,
      generated_at: generatedAt,
      shard,
      by_asset: byAsset,
    });
    shardFiles.push(rel);
  }
  const latest = {
    schema: 'rv.quantlab_model_coverage_latest.v1',
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    scope_count: scope.length,
    counts,
    source: {
      path: path.relative(ROOT, path.join(opts.quantlabRoot, 'latest.json')).split(path.sep).join('/'),
      as_of: metaAsOf,
      stock_publish_generated_at: meta.generatedAt || meta.generated_at || null,
    },
    shard_count: shardFiles.length,
    shard_files: shardFiles,
  };
  writeJsonAtomic(path.join(opts.outRoot, 'latest.json'), latest);
  process.stdout.write(`${JSON.stringify({ ok: true, target_market_date: opts.targetMarketDate, scope_count: scope.length, counts })}\n`);
}

main();
