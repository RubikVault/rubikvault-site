#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const REPO_ROOT = process.cwd();
const REGISTRY_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const READ_MODELS_DIR = path.join(REPO_ROOT, 'public/data/universe/v7/read_models');
const OUT_DIR = path.join(REPO_ROOT, 'public/data/universe/v7/ssot');
const SCI_SNAPSHOT = path.join(REPO_ROOT, 'public/data/snapshots/stock-analysis.json');
const FC_LATEST = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const MP_INDEX = path.join(REPO_ROOT, 'public/data/marketphase/index.json');

function nowIso() {
  return new Date().toISOString();
}

async function writeJsonAtomic(absPath, data) {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, absPath);
}

async function readJsonMaybe(absPath) {
  try {
    const raw = await fsp.readFile(absPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function bySymbolThenId(a, b) {
  const s = String(a.symbol || '').localeCompare(String(b.symbol || ''));
  if (s !== 0) return s;
  return String(a.canonical_id || '').localeCompare(String(b.canonical_id || ''));
}

function qualityRank(value) {
  const q = String(value || '').trim().toLowerCase();
  if (q === 'backfill_real') return 3;
  if (q === 'daily_bulk_estimate') return 2;
  if (q === 'estimate') return 1;
  return 0;
}

function compareRowsForSymbolChoice(a, b) {
  // higher wins
  const qa = qualityRank(a?.quality_basis);
  const qb = qualityRank(b?.quality_basis);
  if (qa !== qb) return qa - qb;

  const ba = Number(a?.bars_count || 0);
  const bb = Number(b?.bars_count || 0);
  if (ba !== bb) return ba - bb;

  const da = String(a?.last_trade_date || '');
  const db = String(b?.last_trade_date || '');
  if (da !== db) return da.localeCompare(db);

  const sa = Number.isFinite(Number(a?.score_0_100)) ? Number(a.score_0_100) : -1;
  const sb = Number.isFinite(Number(b?.score_0_100)) ? Number(b.score_0_100) : -1;
  if (sa !== sb) return sa - sb;

  const va = Number(a?.avg_volume_30d || 0);
  const vb = Number(b?.avg_volume_30d || 0);
  if (va !== vb) return va - vb;

  return String(a?.canonical_id || '').localeCompare(String(b?.canonical_id || ''));
}

function eligibilityFromLayer(layer) {
  const normalized = String(layer || 'L4_DEAD').toUpperCase();
  return {
    analyzer: ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL'].includes(normalized),
    scientific: ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL'].includes(normalized),
    forecast: ['L0_LEGACY_CORE', 'L1_FULL'].includes(normalized),
    marketphase: ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL', 'L3_MINIMAL'].includes(normalized),
    elliott: ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL', 'L3_MINIMAL'].includes(normalized)
  };
}

async function readStockRows() {
  const rows = [];
  const stream = fs.createReadStream(REGISTRY_GZ).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const typeNorm = String(obj?.type_norm || '').toUpperCase();
    if (typeNorm !== 'STOCK') continue;
    const symbol = String(obj?.symbol || '').toUpperCase();
    const canonicalId = String(obj?.canonical_id || '');
    if (!symbol || !canonicalId) continue;
    const layer = String(obj?.layer || obj?.computed?.layer || 'L4_DEAD').toUpperCase();
    const score = Number(obj?.score_0_100 ?? obj?.computed?.score_0_100);
    const bars = Number(obj?.bars_count);
    const avgVol = Number(obj?.avg_volume_30d);
    rows.push({
      canonical_id: canonicalId,
      symbol,
      name: obj?.name || null,
      exchange: obj?.exchange || null,
      mic: obj?.mic || null,
      country: obj?.country || null,
      currency: obj?.currency || null,
      bars_count: Number.isFinite(bars) ? bars : 0,
      avg_volume_30d: Number.isFinite(avgVol) ? avgVol : 0,
      last_trade_date: obj?.last_trade_date || null,
      layer,
      score_0_100: Number.isFinite(score) ? score : null,
      quality_basis: obj?._quality_basis || null,
      eligibility: eligibilityFromLayer(layer)
    });
  }
  return rows.sort(bySymbolThenId);
}

function buildByFeature(rows) {
  const allSymbols = [...new Set(rows.map((row) => row.symbol).filter(Boolean))].sort();
  const out = {
    analyzer: [...allSymbols],
    scientific: [...allSymbols],
    forecast: [...allSymbols],
    marketphase: [...allSymbols],
    elliott: [...allSymbols]
  };
  return out;
}

function buildCanonicalByFeature(rows, byFeatureSymbols = {}) {
  const featureNames = ['analyzer', 'scientific', 'forecast', 'marketphase', 'elliott'];
  const out = {};
  for (const feature of featureNames) {
    const allowedSymbols = setFromArray(Array.isArray(byFeatureSymbols?.[feature]) ? byFeatureSymbols[feature] : []);
    const canonicalIds = [];
    for (const row of rows) {
      if (!row?.canonical_id) continue;
      if (allowedSymbols.size > 0 && !allowedSymbols.has(String(row.symbol || '').toUpperCase())) continue;
      canonicalIds.push(String(row.canonical_id));
    }
    out[feature] = [...new Set(canonicalIds)].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

async function readPageSymbols(dirName) {
  const dir = path.join(READ_MODELS_DIR, dirName);
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const pageFiles = entries
    .filter((ent) => ent.isFile() && /^page_\d+\.json\.gz$/.test(ent.name))
    .map((ent) => path.join(dir, ent.name))
    .sort();
  const symbols = [];
  for (const abs of pageFiles) {
    const gz = await fsp.readFile(abs);
    const raw = zlib.gunzipSync(gz).toString('utf8');
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch {
      continue;
    }
    const items = Array.isArray(doc?.items) ? doc.items : [];
    for (const item of items) {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (symbol) symbols.push(symbol);
    }
  }
  return [...new Set(symbols)].sort();
}

async function buildByFeatureFromReadModels(rows) {
  const fromLayers = buildByFeature(rows);
  const fallback = {
    analyzer: await readPageSymbols('scientific_pages'),
    scientific: await readPageSymbols('scientific_pages'),
    forecast: await readPageSymbols('forecast_pages'),
    marketphase: await readPageSymbols('marketphase_pages'),
    elliott: await readPageSymbols('marketphase_pages')
  };
  function mergeUnique(a = [], b = []) {
    return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].sort();
  }
  return {
    analyzer: mergeUnique(fromLayers.analyzer, fallback.analyzer),
    scientific: mergeUnique(fromLayers.scientific, fallback.scientific),
    forecast: mergeUnique(fromLayers.forecast, fallback.forecast),
    marketphase: mergeUnique(fromLayers.marketphase, fallback.marketphase),
    elliott: mergeUnique(fromLayers.elliott, fallback.elliott)
  };
}

function setFromArray(values = []) {
  const set = new Set();
  for (const value of values) {
    const sym = String(value || '').toUpperCase().trim();
    if (sym) set.add(sym);
  }
  return set;
}

async function readLiveFeatureSets() {
  const sciDoc = await readJsonMaybe(SCI_SNAPSHOT);
  const fcDoc = await readJsonMaybe(FC_LATEST);
  const mpDoc = await readJsonMaybe(MP_INDEX);

  const scientific = new Set();
  if (sciDoc && typeof sciDoc === 'object') {
    for (const key of Object.keys(sciDoc)) {
      if (String(key).startsWith('_')) continue;
      const sym = String(key || '').toUpperCase().trim();
      if (sym) scientific.add(sym);
    }
  }

  const forecast = new Set();
  const fcRows = Array.isArray(fcDoc?.data?.forecasts) ? fcDoc.data.forecasts : [];
  for (const row of fcRows) {
    const sym = String(row?.ticker || row?.symbol || '').toUpperCase().trim();
    if (sym) forecast.add(sym);
  }

  const marketphase = new Set();
  const mpRows = Array.isArray(mpDoc?.data?.symbols) ? mpDoc.data.symbols : [];
  for (const row of mpRows) {
    const sym = typeof row === 'string'
      ? String(row || '').toUpperCase().trim()
      : String(row?.symbol || '').toUpperCase().trim();
    if (sym) marketphase.add(sym);
  }

  return { scientific, forecast, marketphase };
}

function intersection(sets) {
  const validSets = sets.filter((s) => s instanceof Set && s.size > 0);
  if (!validSets.length) return new Set();
  const [first, ...rest] = validSets;
  const out = new Set();
  for (const value of first) {
    if (rest.every((s) => s.has(value))) out.add(value);
  }
  return out;
}

async function main() {
  const rawRows = await readStockRows();
  const bestByCanonical = new Map();
  for (const row of rawRows) {
    const cid = String(row?.canonical_id || '');
    if (!cid) continue;
    const prev = bestByCanonical.get(cid);
    if (!prev || compareRowsForSymbolChoice(row, prev) > 0) {
      bestByCanonical.set(cid, row);
    }
  }
  const canonicalRows = [...bestByCanonical.values()].sort(bySymbolThenId);
  const canonicalIds = canonicalRows.map((row) => String(row.canonical_id));

  const bestBySymbol = new Map();
  for (const row of rawRows) {
    const symbol = String(row?.symbol || '').toUpperCase();
    if (!symbol) continue;
    const prev = bestBySymbol.get(symbol);
    if (!prev || compareRowsForSymbolChoice(row, prev) > 0) {
      bestBySymbol.set(symbol, row);
    }
  }
  const rows = [...bestBySymbol.values()].sort(bySymbolThenId);
  const symbols = rows.map((r) => r.symbol);
  const rowBySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const byFeature = await buildByFeatureFromReadModels(rows);
  const byFeatureCanonical = buildCanonicalByFeature(canonicalRows, byFeature);
  const liveSets = await readLiveFeatureSets();
  const sharedLiveSymbols = intersection([
    setFromArray(rows.map((r) => r.symbol)),
    liveSets.scientific,
    liveSets.forecast,
    liveSets.marketphase
  ]);
  const sharedItems = [...sharedLiveSymbols]
    .map((sym) => rowBySymbol.get(sym))
    .filter(Boolean)
    .map((row) => ({
      symbol: row.symbol,
      ticker: row.symbol,
      name: row.name || null,
      canonical_id: row.canonical_id,
      exchange: row.exchange || null,
      layer: row.layer || null,
      score_0_100: row.score_0_100
    }))
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));

  const eligibleSets = {
    analyzer: setFromArray(byFeature.analyzer),
    scientific: setFromArray(byFeature.scientific),
    forecast: setFromArray(byFeature.forecast),
    marketphase: setFromArray(byFeature.marketphase),
    elliott: setFromArray(byFeature.elliott)
  };
  const eligibleSetsCanonical = {
    analyzer: setFromArray(byFeatureCanonical.analyzer),
    scientific: setFromArray(byFeatureCanonical.scientific),
    forecast: setFromArray(byFeatureCanonical.forecast),
    marketphase: setFromArray(byFeatureCanonical.marketphase),
    elliott: setFromArray(byFeatureCanonical.elliott)
  };
  const sharedEligibleSymbols = intersection([
    eligibleSets.analyzer,
    eligibleSets.scientific,
    eligibleSets.forecast,
    eligibleSets.marketphase,
    eligibleSets.elliott
  ]);
  const sharedLiveCanonicalIds = new Set(
    canonicalRows
      .filter((row) => sharedLiveSymbols.has(String(row.symbol || '').toUpperCase()))
      .map((row) => String(row.canonical_id))
  );

  const exchangeCounts = {};
  for (const row of rows) {
    const ex = String(row.exchange || 'UNKNOWN').toUpperCase();
    exchangeCounts[ex] = (exchangeCounts[ex] || 0) + 1;
  }

  await fsp.mkdir(OUT_DIR, { recursive: true });

  const manifest = {
    schema: 'rv_v7_stock_ssot_manifest_v1',
    generated_at: nowIso(),
    source: 'public/data/universe/v7/registry/registry.ndjson.gz',
    stocks_total: rows.length,
    stocks_canonical_total: canonicalRows.length,
    registry_stock_rows_total: rawRows.length,
    symbols_total: symbols.length,
    by_exchange: exchangeCounts,
    feature_eligible_counts: {
      analyzer: byFeature.analyzer.length,
      scientific: byFeature.scientific.length,
      forecast: byFeature.forecast.length,
      marketphase: byFeature.marketphase.length,
      elliott: byFeature.elliott.length
    },
    shared_live_features: {
      scientific_count: liveSets.scientific.size,
      forecast_count: liveSets.forecast.size,
      marketphase_count: liveSets.marketphase.size,
      shared_intersection_count: sharedItems.length
    },
    files: {
      rows: 'public/data/universe/v7/ssot/stocks.max.rows.json',
      symbols: 'public/data/universe/v7/ssot/stocks.max.symbols.json',
      canonical_rows: 'public/data/universe/v7/ssot/stocks.max.canonical.rows.json',
      canonical_ids: 'public/data/universe/v7/ssot/stocks.max.canonical.ids.json',
      by_feature: 'public/data/universe/v7/ssot/stocks.by_feature.json',
      by_feature_canonical: 'public/data/universe/v7/ssot/stocks.canonical.by_feature.json',
      shared_features: 'public/data/universe/v7/ssot/stocks.shared.features.json',
      feature_parity: 'public/data/universe/v7/ssot/stocks.feature.parity.json'
    },
    policy: {
      ssot_for_new_features: 'public/data/universe/v7/ssot/stocks.max.symbols.json',
      ssot_for_new_features_canonical: 'public/data/universe/v7/ssot/stocks.max.canonical.ids.json',
      feature_symbols_map: 'public/data/universe/v7/ssot/stocks.by_feature.json',
      feature_canonical_map: 'public/data/universe/v7/ssot/stocks.canonical.by_feature.json',
      shared_features_source: 'public/data/universe/v7/ssot/stocks.shared.features.json'
    }
  };

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.max.rows.json'), {
    schema: 'rv_v7_stock_ssot_rows_v1',
    generated_at: manifest.generated_at,
    count: rows.length,
    items: rows
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.max.symbols.json'), {
    schema: 'rv_v7_stock_ssot_symbols_v1',
    generated_at: manifest.generated_at,
    count: symbols.length,
    symbols
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.max.canonical.rows.json'), {
    schema: 'rv_v7_stock_ssot_canonical_rows_v1',
    generated_at: manifest.generated_at,
    count: canonicalRows.length,
    items: canonicalRows
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.max.canonical.ids.json'), {
    schema: 'rv_v7_stock_ssot_canonical_ids_v1',
    generated_at: manifest.generated_at,
    count: canonicalIds.length,
    canonical_ids: canonicalIds
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.by_feature.json'), {
    schema: 'rv_v7_stock_ssot_by_feature_v1',
    generated_at: manifest.generated_at,
    counts: manifest.feature_eligible_counts,
    symbols: byFeature
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.canonical.by_feature.json'), {
    schema: 'rv_v7_stock_ssot_by_feature_canonical_v1',
    generated_at: manifest.generated_at,
    counts: {
      analyzer: byFeatureCanonical.analyzer.length,
      scientific: byFeatureCanonical.scientific.length,
      forecast: byFeatureCanonical.forecast.length,
      marketphase: byFeatureCanonical.marketphase.length,
      elliott: byFeatureCanonical.elliott.length
    },
    canonical_ids: byFeatureCanonical
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.shared.features.json'), {
    schema: 'rv_v7_stock_ssot_shared_features_v1',
    generated_at: manifest.generated_at,
    source: {
      scientific: 'public/data/snapshots/stock-analysis.json',
      forecast: 'public/data/forecast/latest.json',
      marketphase: 'public/data/marketphase/index.json'
    },
    count: sharedItems.length,
    items: sharedItems
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'stocks.feature.parity.json'), {
    schema: 'rv_v7_stock_feature_parity_v1',
    generated_at: manifest.generated_at,
    feature_counts_eligible: {
      analyzer: byFeature.analyzer.length,
      scientific: byFeature.scientific.length,
      forecast: byFeature.forecast.length,
      marketphase: byFeature.marketphase.length,
      elliott: byFeature.elliott.length
    },
    feature_counts_live: {
      scientific: liveSets.scientific.size,
      forecast: liveSets.forecast.size,
      marketphase: liveSets.marketphase.size,
      elliott_proxy_marketphase: liveSets.marketphase.size
    },
    shared_eligible_intersection: {
      count: sharedEligibleSymbols.size,
      symbols: [...sharedEligibleSymbols].sort()
    },
    shared_live_intersection: {
      count: sharedItems.length,
      symbols: sharedItems.map((row) => row.symbol)
    },
    counts_on_shared_live: {
      analyzer: intersection([sharedLiveSymbols, eligibleSets.analyzer]).size,
      scientific: intersection([sharedLiveSymbols, eligibleSets.scientific]).size,
      forecast: intersection([sharedLiveSymbols, eligibleSets.forecast]).size,
      marketphase: intersection([sharedLiveSymbols, eligibleSets.marketphase]).size,
      elliott: intersection([sharedLiveSymbols, eligibleSets.elliott]).size
    },
    counts_on_shared_live_canonical: {
      analyzer: intersection([sharedLiveCanonicalIds, eligibleSetsCanonical.analyzer]).size,
      scientific: intersection([sharedLiveCanonicalIds, eligibleSetsCanonical.scientific]).size,
      forecast: intersection([sharedLiveCanonicalIds, eligibleSetsCanonical.forecast]).size,
      marketphase: intersection([sharedLiveCanonicalIds, eligibleSetsCanonical.marketphase]).size,
      elliott: intersection([sharedLiveCanonicalIds, eligibleSetsCanonical.elliott]).size
    },
    feature_counts_eligible_canonical: {
      analyzer: byFeatureCanonical.analyzer.length,
      scientific: byFeatureCanonical.scientific.length,
      forecast: byFeatureCanonical.forecast.length,
      marketphase: byFeatureCanonical.marketphase.length,
      elliott: byFeatureCanonical.elliott.length
    },
    parity_flags: {
      eligible_counts_equal:
        byFeature.analyzer.length === byFeature.scientific.length
        && byFeature.scientific.length === byFeature.forecast.length
        && byFeature.forecast.length === byFeature.marketphase.length
        && byFeature.marketphase.length === byFeature.elliott.length,
      shared_live_exists: sharedItems.length > 0
    }
  });

  await writeJsonAtomic(path.join(OUT_DIR, 'manifest.json'), manifest);

  await writeJsonAtomic(path.join(OUT_DIR, 'policy.json'), {
    schema: 'rv_v7_stock_ssot_policy_v1',
    generated_at: manifest.generated_at,
    default_symbol_source: manifest.files.symbols,
    default_canonical_source: manifest.files.canonical_ids,
    feature_symbol_source: manifest.files.by_feature,
    feature_canonical_source: manifest.files.by_feature_canonical,
    shared_feature_source: manifest.files.shared_features,
    feature_parity_source: manifest.files.feature_parity,
    eligibility_rules: {
      analyzer: 'L0_LEGACY_CORE|L1_FULL|L2_PARTIAL',
      scientific: 'L0_LEGACY_CORE|L1_FULL|L2_PARTIAL',
      forecast: 'L0_LEGACY_CORE|L1_FULL',
      marketphase: 'L0_LEGACY_CORE|L1_FULL|L2_PARTIAL|L3_MINIMAL',
      elliott: 'L0_LEGACY_CORE|L1_FULL|L2_PARTIAL|L3_MINIMAL'
    }
  });

  console.log(JSON.stringify({
    ok: true,
    out_dir: path.relative(REPO_ROOT, OUT_DIR),
    stocks_total: rows.length,
    feature_eligible_counts: manifest.feature_eligible_counts
  }, null, 2));
}

main().catch((error) => {
  console.error('[build-stock-ssot] failed:', error?.message || error);
  process.exit(1);
});
