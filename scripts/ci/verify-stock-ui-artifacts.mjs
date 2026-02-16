#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const MOVERS_PRICE_TOLERANCE = Number(process.env.RV_MOVERS_PRICE_TOLERANCE || 1e-6);
const MIN_CORRELATIONS_COVERAGE = Number(process.env.RV_MIN_CORRELATIONS_COVERAGE || 0);
const MIN_CORRELATIONS_COVERAGE_RATIO = Number(process.env.RV_MIN_CORRELATIONS_COVERAGE_RATIO || 1);
const MIN_PEERS_COVERAGE_RATIO = Number(process.env.RV_MIN_PEERS_COVERAGE_RATIO || 0.95);
const SAMPLE_LIMIT = Number(process.env.RV_UI_COVERAGE_SAMPLE_LIMIT || 20);

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function readUniverseSet(relPath = 'public/data/universe/all.json') {
  const loaded = readJson(relPath);
  if (!loaded.ok) return { ok: false, errors: loaded.errors, set: new Set() };
  if (!Array.isArray(loaded.doc)) return { ok: false, errors: [`invalid universe array: ${relPath}`], set: new Set() };
  const set = new Set();
  for (const row of loaded.doc) {
    const ticker = normalizeTicker(typeof row === 'string' ? row : row?.ticker || row?.symbol);
    if (ticker) set.add(ticker);
  }
  return { ok: true, errors: [], set };
}

function readAdjustedSeriesSet(relDir = 'public/data/v3/series/adjusted') {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return { ok: false, errors: [`missing directory: ${relDir}`], set: new Set() };
  if (!fs.statSync(abs).isDirectory()) return { ok: false, errors: [`not a directory: ${relDir}`], set: new Set() };
  try {
    const names = fs.readdirSync(abs);
    const set = new Set();
    for (const name of names) {
      const m = /^US__(.+)\.ndjson\.gz$/i.exec(String(name || '').trim());
      if (!m) continue;
      const ticker = normalizeTicker(m[1]);
      if (ticker) set.add(ticker);
    }
    return { ok: true, errors: [], set };
  } catch (error) {
    return { ok: false, errors: [`failed to read ${relDir}: ${error.message}`], set: new Set() };
  }
}

function readJson(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return { ok: false, errors: [`missing file: ${relPath}`], doc: null };
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return { ok: false, errors: [`not a file: ${relPath}`], doc: null };
  if (stat.size <= 0) return { ok: false, errors: [`empty file: ${relPath}`], doc: null };
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    return { ok: true, errors: [], doc: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${relPath} (${error.message})`], doc: null };
  }
}

function readNdjsonGz(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return { ok: false, errors: [`missing file: ${relPath}`], rows: [] };
  try {
    const gz = fs.readFileSync(abs);
    const text = zlib.gunzipSync(gz).toString('utf8');
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { ok: true, errors: [], rows };
  } catch (error) {
    return { ok: false, errors: [`invalid NDJSON GZ: ${relPath} (${error.message})`], rows: [] };
  }
}

function validateMeta(doc, relPath) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return [`invalid document: ${relPath}`];
  const meta = doc.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push(`${relPath}: missing meta`);
    return errors;
  }
  if (!meta.generated_at) errors.push(`${relPath}: meta.generated_at missing`);
  if (!meta.schema_version) errors.push(`${relPath}: meta.schema_version missing`);
  if (!meta.provider) errors.push(`${relPath}: meta.provider missing`);
  return errors;
}

function validateBenchmarks(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const map = doc?.data?.benchmarks;
  if (!map || typeof map !== 'object') {
    errors.push(`${relPath}: data.benchmarks missing`);
    return errors;
  }
  for (const [symbol, row] of Object.entries(map)) {
    if (!row || typeof row !== 'object') {
      errors.push(`${relPath}: ${symbol} is not an object`);
      continue;
    }
    const returns = row.returns;
    if (!returns || typeof returns !== 'object') {
      errors.push(`${relPath}: ${symbol} missing returns`);
      continue;
    }
    for (const key of ['d1', 'ytd', 'y1', 'y5']) {
      const value = returns[key];
      if (value == null) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) errors.push(`${relPath}: ${symbol}.returns.${key} must be finite or null`);
    }
  }
  return errors;
}

function validatePeers(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const peers = doc?.data?.peers;
  if (!peers || typeof peers !== 'object') {
    errors.push(`${relPath}: data.peers missing`);
    return errors;
  }

  const keys = Object.keys(peers);
  if (keys.length < 100) {
    errors.push(`${relPath}: expected at least 100 peer mappings, got ${keys.length}`);
  }

  for (const [ticker, list] of Object.entries(peers)) {
    if (!Array.isArray(list)) {
      errors.push(`${relPath}: ${ticker} peers is not an array`);
      continue;
    }
    if (list.length > 8) errors.push(`${relPath}: ${ticker} peers length > 8 (${list.length})`);
    for (const symbol of list) {
      if (typeof symbol !== 'string' || !symbol.trim()) {
        errors.push(`${relPath}: ${ticker} contains invalid peer symbol`);
      }
    }
  }

  if (universeSet.size > 0) {
    const peerTickerSet = new Set(keys.map((ticker) => normalizeTicker(ticker)).filter(Boolean));
    const inUniverse = [...peerTickerSet].filter((ticker) => universeSet.has(ticker)).length;
    const ratio = inUniverse / universeSet.size;
    if (ratio < MIN_PEERS_COVERAGE_RATIO) {
      const missing = [...universeSet].filter((ticker) => !peerTickerSet.has(ticker)).sort().slice(0, SAMPLE_LIMIT);
      errors.push(`${relPath}: peers coverage ${(ratio * 100).toFixed(2)}% below minimum ${(MIN_PEERS_COVERAGE_RATIO * 100).toFixed(2)}% (sample missing=${missing.join(',')})`);
    }
  }

  return errors;
}

function validateCorrelations(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const correlations = doc?.data?.correlations;
  if (!correlations || typeof correlations !== 'object') {
    errors.push(`${relPath}: data.correlations missing`);
    return errors;
  }

  for (const [ticker, row] of Object.entries(correlations)) {
    if (!row || typeof row !== 'object') {
      errors.push(`${relPath}: ${ticker} row invalid`);
      continue;
    }
    if (!Number.isFinite(Number(row.window))) errors.push(`${relPath}: ${ticker} missing numeric window`);
    const items = row.items;
    if (!Array.isArray(items)) {
      errors.push(`${relPath}: ${ticker} items is not an array`);
      continue;
    }
    for (const item of items) {
      const corr = Number(item?.corr);
      if (!Number.isFinite(corr) || corr < -1 || corr > 1) {
        errors.push(`${relPath}: ${ticker} correlation out of range`);
      }
      if (typeof item?.symbol !== 'string' || !item.symbol.trim()) {
        errors.push(`${relPath}: ${ticker} correlation symbol missing`);
      }
    }
  }

  const coverage = Object.keys(correlations).length;
  const byAbsolute = Math.max(0, MIN_CORRELATIONS_COVERAGE);
  const correlationBase = adjustedSeriesSet.size > 0 ? adjustedSeriesSet.size : universeSet.size;
  const byRatio = correlationBase > 0 ? Math.ceil(correlationBase * Math.max(0, MIN_CORRELATIONS_COVERAGE_RATIO)) : 0;
  const required = Math.max(byAbsolute, byRatio);
  if (coverage < required) {
    errors.push(`${relPath}: correlations coverage ${coverage} below minimum ${required} (base=${correlationBase})`);
  }

  return errors;
}

function validateMovers(doc, relPath) {
  const errors = [];
  const meta = doc?.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push(`${relPath}: missing meta`);
  } else {
    if (!meta.generated_at) errors.push(`${relPath}: meta.generated_at missing`);
    if (!meta.schema && !meta.schema_version) errors.push(`${relPath}: meta.schema/schema_version missing`);
  }
  const movers = Array.isArray(doc?.top_movers) ? doc.top_movers : [];
  if (!Array.isArray(doc?.top_movers)) {
    errors.push(`${relPath}: top_movers missing`);
    return errors;
  }
  if (movers.length === 0) {
    errors.push(`${relPath}: top_movers must be non-empty`);
    return errors;
  }

  for (const row of movers) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol);
    if (!ticker) {
      errors.push(`${relPath}: mover ticker missing`);
      continue;
    }
    if (typeof row?.name !== 'string' || !row.name.trim()) errors.push(`${relPath}: ${ticker} missing name`);
    if (typeof row?.sector !== 'string' || !row.sector.trim()) errors.push(`${relPath}: ${ticker} missing sector`);
    if (typeof row?.in_universe !== 'boolean') errors.push(`${relPath}: ${ticker} missing boolean in_universe`);
    if (typeof row?.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.as_of)) errors.push(`${relPath}: ${ticker} missing valid as_of`);
    if (!row?.lineage || typeof row.lineage !== 'object') errors.push(`${relPath}: ${ticker} missing lineage`);
  }

  return errors;
}

function validateMarket(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const data = doc?.data;
  if (!data || typeof data !== 'object') {
    errors.push(`${relPath}: data missing`);
    return errors;
  }
  if (!Array.isArray(data.indices)) errors.push(`${relPath}: data.indices missing`);
  if (!Array.isArray(data.sectors)) errors.push(`${relPath}: data.sectors missing`);
  if (!Array.isArray(data.movers)) errors.push(`${relPath}: data.movers missing`);
  return errors;
}

function detectPriceSourceKind(value) {
  const src = String(value || '');
  if (!src) return null;
  if (src.includes('/data/eod/bars/') || src.includes('/data/eod/bars*.') || src.includes('public/data/eod/bars/')) return 'legacy-bars';
  if (src.includes('/data/eod/batches/') || src.includes('public/data/eod/batches/')) return 'legacy-batches';
  if (src.includes('/mirrors/market-health.json') || src.includes('public/mirrors/market-health.json')) return 'mirror-market-health';
  if (src.includes('/data/v3/eod/US/latest.ndjson.gz') || src.includes('public/data/v3/eod/US/latest.ndjson.gz')) return 'v3-canonical';
  if (src.includes('/data/v3/series/adjusted/') || src.includes('public/data/v3/series/adjusted/')) return 'v3-canonical';
  return null;
}

function collectPriceSourceKinds(doc) {
  const chain = Array.isArray(doc?.meta?.source_chain) ? doc.meta.source_chain : [];
  const kinds = new Set();
  for (const entry of chain) {
    const kind = detectPriceSourceKind(entry);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

const checks = [
  {
    relPath: 'public/data/ui/benchmarks/latest.json',
    label: 'benchmarks',
    validate: validateBenchmarks
  },
  {
    relPath: 'public/data/ui/peers/latest.json',
    label: 'peers',
    validate: validatePeers
  },
  {
    relPath: 'public/data/ui/correlations/latest.json',
    label: 'correlations',
    validate: validateCorrelations
  },
  {
    relPath: 'public/data/v3/pulse/top-movers/latest.json',
    label: 'movers',
    validate: validateMovers
  },
  {
    relPath: 'public/data/v3/derived/market/latest.json',
    label: 'market',
    validate: validateMarket
  }
];

const failures = [];
const globalPriceSourceKinds = new Set();
const universeLoaded = readUniverseSet();
const universeSet = universeLoaded.set;
if (!universeLoaded.ok) {
  for (const err of universeLoaded.errors) failures.push(err);
}
const adjustedSeriesLoaded = readAdjustedSeriesSet();
const adjustedSeriesSet = adjustedSeriesLoaded.set;
if (!adjustedSeriesLoaded.ok) {
  for (const err of adjustedSeriesLoaded.errors) failures.push(err);
}
let moversDoc = null;
for (const check of checks) {
  const loaded = readJson(check.relPath);
  if (!loaded.ok) {
    console.log(`❌ ${check.label}: ${check.relPath}`);
    for (const err of loaded.errors) {
      failures.push(err);
      console.log(`   - ${err}`);
    }
    continue;
  }

  const errs = check.validate(loaded.doc, check.relPath);
  if (errs.length) {
    console.log(`❌ ${check.label}: ${check.relPath}`);
    for (const err of errs) {
      failures.push(err);
      console.log(`   - ${err}`);
    }
    continue;
  }

  const kinds = collectPriceSourceKinds(loaded.doc);
  for (const kind of kinds) globalPriceSourceKinds.add(kind);
  if (check.label === 'movers') moversDoc = loaded.doc;

  console.log(`✅ ${check.label}: ${check.relPath}`);
}

if (moversDoc && typeof moversDoc === 'object') {
  const eodLoaded = readNdjsonGz('public/data/v3/eod/US/latest.ndjson.gz');
  if (!eodLoaded.ok) {
    for (const err of eodLoaded.errors) failures.push(err);
  } else {
    const closeByTicker = new Map();
    for (const row of eodLoaded.rows) {
      const ticker = String(row?.ticker || row?.symbol || '').toUpperCase();
      const close = Number(row?.close);
      if (!ticker || !Number.isFinite(close)) continue;
      closeByTicker.set(ticker, close);
    }
    const movers = Array.isArray(moversDoc?.top_movers) ? moversDoc.top_movers : [];
    for (const row of movers) {
      const ticker = normalizeTicker(row?.ticker || row?.symbol);
      const moverClose = Number(row?.close);
      const canonicalClose = closeByTicker.get(ticker);
      if (!ticker || !Number.isFinite(moverClose)) {
        failures.push(`movers consistency: invalid mover row for ticker=${ticker || 'unknown'}`);
        continue;
      }
      if (!Number.isFinite(canonicalClose)) {
        failures.push(`movers consistency: ${ticker} missing in canonical latest.ndjson.gz`);
        continue;
      }
      if (Math.abs(moverClose - canonicalClose) > MOVERS_PRICE_TOLERANCE) {
        failures.push(`movers consistency: ${ticker} close mismatch mover=${moverClose} canonical=${canonicalClose}`);
      }
    }
  }
}

const forbiddenKinds = ['legacy-bars', 'legacy-batches', 'mirror-market-health'];
for (const kind of forbiddenKinds) {
  if (globalPriceSourceKinds.has(kind)) {
    failures.push(`forbidden price source detected: ${kind}`);
  }
}

if (globalPriceSourceKinds.has('v3-canonical') && globalPriceSourceKinds.size > 1) {
  failures.push(`multiple price source families detected: ${[...globalPriceSourceKinds].sort().join(', ')}`);
}

if (!globalPriceSourceKinds.has('v3-canonical')) {
  failures.push('canonical v3 price source not detected in source_chain');
}

if (failures.length) {
  console.error('\nStock UI artifact verification failed.');
  process.exit(1);
}

console.log('\n✅ Stock UI artifact verification passed.');
