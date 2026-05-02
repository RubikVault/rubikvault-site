#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createGunzip, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_MANIFEST = path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.json');
const DEFAULT_OUT_DIR = path.join(ROOT, 'public/data/eod/history/shards');
const DEFAULT_PACK_ROOTS = [
  process.env.RV_HISTORY_PACK_ROOT,
  process.env.RV_HISTORY_PACK_ROOT ? path.join(process.env.RV_HISTORY_PACK_ROOT, 'history') : '',
  path.join(ROOT, 'mirrors/universe-v7/history'),
  path.join(ROOT, 'mirrors/universe-v7/history/history'),
  path.join(ROOT, 'public/data/eod/history/packs'),
  '/volume1/homes/neoboy/QuantLabHot/storage/universe-v7-history',
  '/volume1/homes/neoboy/QuantLabHot/storage/universe-v7-history/history',
].filter(Boolean);
const BENCHMARK_SYMBOLS = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO']);

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const args = process.argv.slice(2);
  const index = args.findIndex((arg) => arg === name || arg.startsWith(prefix));
  if (index < 0) return fallback;
  const hit = args[index];
  if (hit === name) return args[index + 1] ?? true;
  return hit.slice(prefix.length);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function shardKey(symbol) {
  const clean = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  const first = clean.charAt(0);
  return /^[A-Z0-9]$/.test(first) ? first : '_';
}

function roundNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function compactBar(row) {
  const date = String(row?.date || row?.trading_date || '').slice(0, 10);
  const close = roundNumber(row?.close ?? row?.adjusted_close ?? row?.adj_close);
  if (!date || close == null) return null;
  const open = roundNumber(row?.open) ?? close;
  const high = roundNumber(row?.high) ?? close;
  const low = roundNumber(row?.low) ?? close;
  const adjClose = roundNumber(row?.adjusted_close ?? row?.adj_close ?? row?.adjClose) ?? close;
  const volumeRaw = Number(row?.volume);
  const volume = Number.isFinite(volumeRaw) ? Math.round(volumeRaw) : 0;
  return [date, open, high, low, close, adjClose, volume];
}

function compactBars(rows, limit) {
  if (!Array.isArray(rows)) return [];
  const seen = new Map();
  for (const row of rows) {
    const compact = compactBar(row);
    if (!compact) continue;
    seen.set(compact[0], compact);
  }
  return [...seen.values()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .slice(-limit);
}

function resolvePackPath(packPath, roots) {
  const rawPackPath = String(packPath || '').trim();
  const variants = [
    rawPackPath,
    rawPackPath.replace(/^history\//, ''),
    rawPackPath.startsWith('history/') ? '' : path.join('history', rawPackPath),
  ].filter(Boolean);
  for (const root of roots) {
    for (const variant of variants) {
      const candidate = path.join(root, variant);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function readPackRows(filePath, onRow) {
  const stream = fs.createReadStream(filePath).pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      await onRow(JSON.parse(line));
    } catch {
      // Bad pack rows are ignored; missing assets are counted in summary.
    }
  }
}

function writeGzipJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, gzipSync(Buffer.from(JSON.stringify(value))));
  fs.renameSync(tmp, filePath);
}

function removeStaleGzipShards(outDir, activeKeys) {
  if (!fs.existsSync(outDir)) return;
  for (const name of fs.readdirSync(outDir)) {
    if (!/^[A-Z0-9_]\.json\.gz$/.test(name)) continue;
    const key = name.slice(0, -'.json.gz'.length);
    if (!activeKeys.has(key)) fs.rmSync(path.join(outDir, name), { force: true });
  }
}

async function main() {
  const manifestPath = path.resolve(String(argValue('--manifest', DEFAULT_MANIFEST)));
  const outDir = path.resolve(String(argValue('--out-dir', DEFAULT_OUT_DIR)));
  const targetMarketDate = String(argValue('--target-market-date', process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '') || '').slice(0, 10) || null;
  const tailBars = Math.max(60, Number.parseInt(String(argValue('--tail-bars', process.env.RV_PUBLIC_HISTORY_TAIL_BARS || '120')), 10) || 120);
  const benchmarkTailBars = Math.max(tailBars, Number.parseInt(String(argValue('--benchmark-tail-bars', process.env.RV_PUBLIC_HISTORY_BENCHMARK_TAIL_BARS || '260')), 10) || 260);
  const maxAssets = Number.parseInt(String(argValue('--max-assets', '0')), 10) || 0;
  const extraRoots = String(argValue('--pack-root', '') || '').split(',').map((item) => item.trim()).filter(Boolean);
  const packRoots = [...extraRoots, ...DEFAULT_PACK_ROOTS];
  const manifest = readJson(manifestPath);
  const byCanonical = manifest?.by_canonical_id && typeof manifest.by_canonical_id === 'object'
    ? manifest.by_canonical_id
    : {};

  const wantedByPack = new Map();
  let wantedAssets = 0;
  for (const [canonicalId, entry] of Object.entries(byCanonical)) {
    if (maxAssets > 0 && wantedAssets >= maxAssets) break;
    const symbol = String(entry?.symbol || canonicalId.split(':').pop() || '').trim().toUpperCase();
    const pack = String(entry?.pack || '').trim();
    if (!symbol || !pack) continue;
    if (!wantedByPack.has(pack)) wantedByPack.set(pack, new Map());
    wantedByPack.get(pack).set(String(canonicalId).toUpperCase(), {
      symbol,
      limit: BENCHMARK_SYMBOLS.has(symbol) ? benchmarkTailBars : tailBars,
    });
    wantedAssets += 1;
  }

  const shards = new Map();
  const summary = {
    schema: 'rv.public_history_shards.v1',
    generated_at: new Date().toISOString(),
    target_market_date: targetMarketDate,
    manifest: path.relative(ROOT, manifestPath).split(path.sep).join('/'),
    tail_bars: tailBars,
    benchmark_tail_bars: benchmarkTailBars,
    wanted_assets: wantedAssets,
    packed_assets: 0,
    missing_pack_files: 0,
    missing_rows: 0,
    shards: {},
  };

  let processedPacks = 0;
  for (const [pack, wanted] of wantedByPack.entries()) {
    processedPacks += 1;
    if (processedPacks % 250 === 0) {
      console.log(`[public-history-shards] packs=${processedPacks}/${wantedByPack.size} assets=${summary.packed_assets}`);
    }
    const filePath = resolvePackPath(pack, packRoots);
    if (!filePath) {
      summary.missing_pack_files += 1;
      summary.missing_rows += wanted.size;
      continue;
    }
    const remaining = new Map(wanted);
    await readPackRows(filePath, (row) => {
      const canonicalId = String(row?.canonical_id || '').trim().toUpperCase();
      const target = remaining.get(canonicalId);
      if (!target) return;
      const bars = compactBars(row?.bars || [], target.limit);
      if (bars.length >= 60) {
        const key = shardKey(target.symbol);
        if (!shards.has(key)) shards.set(key, {});
        shards.get(key)[target.symbol] = bars;
        summary.packed_assets += 1;
      } else {
        summary.missing_rows += 1;
      }
      remaining.delete(canonicalId);
    });
    summary.missing_rows += remaining.size;
  }

  const activeShardKeys = new Set(shards.keys());
  fs.mkdirSync(outDir, { recursive: true });
  removeStaleGzipShards(outDir, activeShardKeys);
  for (const [key, doc] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const outPath = path.join(outDir, `${key}.json.gz`);
    writeGzipJsonAtomic(outPath, doc);
    const stat = fs.statSync(outPath);
    summary.shards[key] = { assets: Object.keys(doc).length, bytes: stat.size };
  }
  const shardValues = Object.values(summary.shards);
  summary.shard_count = shardValues.length;
  summary.max_bytes = shardValues.reduce((max, row) => Math.max(max, Number(row.bytes) || 0), 0);
  summary.packed_ratio = summary.wanted_assets > 0 ? Number((summary.packed_assets / summary.wanted_assets).toFixed(4)) : 0;
  fs.writeFileSync(path.join(outDir, 'manifest.public-history-shards.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[public-history-shards] packed=${summary.packed_assets}/${summary.wanted_assets} shards=${Object.keys(summary.shards).length} missing_pack_files=${summary.missing_pack_files} missing_rows=${summary.missing_rows}`);
  if (summary.packed_assets < Math.floor(summary.wanted_assets * 0.9)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[public-history-shards] failed: ${error?.stack || error?.message || error}`);
  process.exitCode = 1;
});
