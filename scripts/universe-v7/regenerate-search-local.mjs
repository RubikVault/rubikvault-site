import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { comparePreferredUniverseRows, isAllowedWebUniverseRecord } from '../../public/js/universe-ssot.js';

function toSafeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function rankScore(rec) {
  const elig = toSafeNum(rec.computed?.score_0_100, 0) / 100;
  const layer = String(rec.computed?.layer || '').toUpperCase();
  const layerBoost = layer === 'L1_FULL' ? 0.15 : layer === 'L2_PARTIAL' ? 0.07 : 0;

  const avg30 = Math.max(1, toSafeNum(rec.avg_volume_30d, 1));
  const price = toSafeNum(rec._tmp_recent_closes?.[0], 1);
  const dollarVol = avg30 * price;

  const v = Math.min(1.0, Math.log10(dollarVol) / 10);
  const usBoost = String(rec.exchange || '').toUpperCase() === 'US' ? 0.2 : 0;

  return 0.25 * elig + 0.4 * v + layerBoost + usBoost;
}

async function writeJsonGz(filePath, data) {
  const json = JSON.stringify(data);
  const compressed = zlib.gzipSync(json);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, compressed);
  console.log(`Wrote ${filePath} (${compressed.length} bytes)`);
}

function readJsonGz(path) {
  try {
    const data = fs.readFileSync(path);
    const text = zlib.gunzipSync(data).toString('utf8');
    return JSON.parse(text);
  } catch (e) { return null; }
}

function buildPrefixBuckets(ranked, countPerBucket, maxDepth) {
  const buckets = {};
  for (const row of ranked) {
    const symbolClean = (row.symbol || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const nameWords = (row.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 0);

    const prefixes = new Set();
    // Symbol prefixes
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (symbolClean.length >= depth) prefixes.add(symbolClean.slice(0, depth));
    }
    // Name word prefixes
    for (const word of nameWords) {
      const cleanWord = word.replace(/[^a-z0-9]/g, '');
      for (let depth = 1; depth <= maxDepth; depth++) {
        if (cleanWord.length >= depth) prefixes.add(cleanWord.slice(0, depth));
      }
    }

    for (const prefix of prefixes) {
      if (!buckets[prefix]) buckets[prefix] = [];
      if (buckets[prefix].length < countPerBucket) {
        buckets[prefix].push({
          canonical_id: row.canonical_id,
          symbol: row.symbol,
          name: row.name || null,
          type_norm: row.type_norm,
          layer: row.computed?.layer,
          score_0_100: row.computed?.score_0_100,
          bars_count: toSafeNum(row?.bars_count, 0),
          avg_volume_30d: row.avg_volume_30d,
          last_trade_date: row?.last_trade_date || null,
          quality_basis: row?._quality_basis || null
        });
      }
    }
  }
  return buckets;
}

async function run() {
  const snapshotPath = 'public/data/universe/v7/registry/registry.snapshot.json.gz';
  const snapshot = readJsonGz(snapshotPath);
  if (!snapshot) {
    console.error('Snapshot not found');
    process.exit(1);
  }

  console.log(`Processing ${snapshot.records.length} records...`);

  const ranked = snapshot.records.map(r => ({
    ...r,
    _rank_score: rankScore(r)
  }))
    .filter((row) => isAllowedWebUniverseRecord(row))
    .sort((a, b) => b._rank_score - a._rank_score);

  const topK = ranked.slice(0, 30000).map(row => ({
    canonical_id: row.canonical_id,
    symbol: row.symbol,
    name: row.name || null,
    type_norm: row.type_norm,
    layer: row.computed?.layer,
    score_0_100: row.computed?.score_0_100,
    bars_count: toSafeNum(row?.bars_count, 0),
    avg_volume_30d: row.avg_volume_30d || 0,
    last_trade_date: row?.last_trade_date || null,
    quality_basis: row?._quality_basis || null
  }));

  const searchDir = 'public/data/universe/v7/search';
  const now = new Date().toISOString();

  await writeJsonGz(path.join(searchDir, 'search_global_top_30000.json.gz'), {
    schema: 'rv_v7_search_top_v1',
    generated_at: now,
    items: topK
  });

  await writeJsonGz(path.join(searchDir, 'search_global_top_10000.json.gz'), {
    schema: 'rv_v7_search_top_v1',
    generated_at: now,
    items: topK.slice(0, 10000)
  });

  await writeJsonGz(path.join(searchDir, 'search_global_top_2000.json.gz'), {
    schema: 'rv_v7_search_top_v1',
    generated_at: now,
    items: topK.slice(0, 2000)
  });

  const buckets = buildPrefixBuckets(ranked, 1000, 3);
  const bucketDir = path.join(searchDir, 'buckets');
  for (const [prefix, items] of Object.entries(buckets)) {
    await writeJsonGz(path.join(bucketDir, `${prefix}.json.gz`), {
      schema: 'rv_v7_search_bucket_v1',
      generated_at: now,
      items
    });
  }

  const manifest = {
    schema: 'rv_v7_search_manifest_v1',
    generated_at: now,
    buckets: Object.fromEntries(Object.keys(buckets).map(k => [k, true]))
  };
  fs.writeFileSync(path.join(searchDir, 'search_index_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Wrote manifest');

  const bySymbolBest = new Map();
  for (const row of ranked) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    const candidate = {
      canonical_id: row.canonical_id,
      symbol,
      exchange: row.exchange || null,
      name: row.name || null,
      type_norm: row.type_norm,
      layer: row.computed?.layer || null,
      score_0_100: row.computed?.score_0_100,
      bars_count: toSafeNum(row?.bars_count, 0),
      avg_volume_30d: row.avg_volume_30d || 0,
      last_trade_date: row?.last_trade_date || null,
      quality_basis: row?._quality_basis || null
    };
    const current = bySymbolBest.get(symbol);
    if (!current) {
      bySymbolBest.set(symbol, { best: candidate, variants_count: 1 });
      continue;
    }
    current.variants_count += 1;
    if (comparePreferredUniverseRows(candidate, current.best) > 0) current.best = candidate;
  }

  const bySymbolDoc = {};
  const byPrefix1 = {};
  const exactSymbols = [...bySymbolBest.keys()].sort((a, b) => a.localeCompare(b));
  for (const symbol of exactSymbols) {
    const entry = bySymbolBest.get(symbol);
    bySymbolDoc[symbol] = {
      ...entry.best,
      variants_count: entry.variants_count
    };
    const prefix = symbol.charAt(0).toLowerCase() || '_';
    if (!byPrefix1[prefix]) byPrefix1[prefix] = [];
    byPrefix1[prefix].push(symbol);
  }

  await writeJsonGz(path.join(searchDir, 'search_exact_by_symbol.json.gz'), {
    schema: 'rv_v7_search_exact_index_v1',
    generated_at: now,
    count: exactSymbols.length,
    by_symbol: bySymbolDoc,
    by_prefix_1: byPrefix1
  });
}

run().catch(console.error);
