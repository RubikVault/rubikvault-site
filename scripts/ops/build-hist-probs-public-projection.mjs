#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_INPUT_DIR = path.join(ROOT, 'public/data/hist-probs');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'public/data/hist-probs-public');
const DEFAULT_SCOPE_FILE = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const SYMBOL_RESOLVE_PATH = path.join(ROOT, 'public/data/symbol-resolve.v1.json');
const SEARCH_EXACT_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
const SCOPE_ROWS_PATH = path.join(ROOT, 'mirrors/universe-v7/ssot/assets.global.rows.json');

function parseArgs(argv) {
  const options = {
    inputDir: process.env.RV_HIST_PROBS_INPUT_DIR || DEFAULT_INPUT_DIR,
    outputDir: process.env.RV_HIST_PROBS_PUBLIC_DIR || DEFAULT_OUTPUT_DIR,
    shardCount: Math.max(1, Number(process.env.RV_HIST_PROBS_PUBLIC_SHARDS || 256)),
    maxEvents: Math.max(1, Number(process.env.RV_HIST_PROBS_PUBLIC_MAX_EVENTS || 12)),
    maxProfiles: Math.max(0, Number(process.env.RV_HIST_PROBS_PUBLIC_MAX_PROFILES || 0)),
    scopeFile: process.env.RV_HIST_PROBS_SCOPE_FILE
      || (String(process.env.RV_UNIVERSE_SCOPE_MODE || '').trim().toLowerCase() === 'index_core' ? DEFAULT_SCOPE_FILE : ''),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--input-dir' && next) {
      options.inputDir = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--input-dir=')) {
      options.inputDir = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--output-dir' && next) {
      options.outputDir = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg.startsWith('--shards=')) {
      options.shardCount = Math.max(1, Number(arg.split('=')[1]) || options.shardCount);
    } else if (arg.startsWith('--max-events=')) {
      options.maxEvents = Math.max(1, Number(arg.split('=')[1]) || options.maxEvents);
    } else if (arg.startsWith('--max-profiles=')) {
      options.maxProfiles = Math.max(0, Number(arg.split('=')[1]) || 0);
    } else if (arg === '--scope-file' && next) {
      options.scopeFile = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--scope-file=')) {
      options.scopeFile = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--no-scope') {
      options.scopeFile = '';
    }
  }
  return options;
}

function shardIndex(key, count) {
  const hash = createHash('sha256').update(String(key || '').toUpperCase()).digest();
  return hash.readUInt32BE(0) % count;
}

function shardName(index) {
  return `${String(index).padStart(3, '0')}.json`;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(doc)}\n`, 'utf8');
}

function readJsonMaybeGzip(filePath) {
  try {
    const body = fs.readFileSync(filePath);
    const text = filePath.endsWith('.gz') ? gunzipSync(body).toString('utf8') : body.toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCanonicalId(value) {
  return normalizeKey(value);
}

function addScopeKey(keys, value) {
  const key = normalizeKey(value);
  if (!isSymbolAlias(key)) return;
  keys.add(key);
  if (key.includes(':')) keys.add(key.split(':').pop());
}

function isSymbolAlias(value) {
  const normalized = normalizeKey(value);
  return Boolean(normalized)
    && normalized.length <= 30
    && /^[A-Z0-9.\-:^]+$/.test(normalized)
    && !/\s/.test(normalized);
}

function addAlias(map, owner, alias) {
  const normalizedOwner = normalizeKey(owner);
  const normalizedAlias = normalizeKey(alias);
  if (!normalizedOwner || !isSymbolAlias(normalizedAlias)) return;
  if (!map.has(normalizedOwner)) map.set(normalizedOwner, new Set());
  map.get(normalizedOwner).add(normalizedAlias);
}

function buildAliasCandidates() {
  const map = new Map();
  const symbolResolve = readJsonMaybeGzip(SYMBOL_RESOLVE_PATH);
  for (const row of Array.isArray(symbolResolve?.entries) ? symbolResolve.entries : []) {
    const ticker = normalizeKey(row?.ticker || row?.symbol);
    if (!ticker) continue;
    addAlias(map, ticker, ticker);
    addAlias(map, ticker, row?.canonical_id);
    addAlias(map, ticker, row?.exchange && ticker ? `${row.exchange}:${ticker}` : null);
    addAlias(map, ticker, row?.exchange && ticker ? `${ticker}.${row.exchange}` : null);
    for (const alias of Array.isArray(row?.aliases) ? row.aliases : []) addAlias(map, ticker, alias);
  }

  const exact = readJsonMaybeGzip(SEARCH_EXACT_PATH);
  for (const row of Object.values(exact?.by_symbol || {})) {
    const ticker = normalizeKey(row?.symbol);
    if (!ticker) continue;
    addAlias(map, ticker, ticker);
    addAlias(map, ticker, row?.canonical_id);
    addAlias(map, ticker, row?.exchange && ticker ? `${row.exchange}:${ticker}` : null);
    addAlias(map, ticker, row?.exchange && ticker ? `${ticker}.${row.exchange}` : null);
  }
  return map;
}

function readScopeCanonicalIds(scopeFile) {
  if (!scopeFile) return null;
  const doc = readJson(scopeFile);
  const ids = Array.isArray(doc?.canonical_ids)
    ? doc.canonical_ids
    : Array.isArray(doc?.ids)
      ? doc.ids
      : Array.isArray(doc?.entries)
        ? doc.entries.map((entry) => entry?.canonical_id || entry?.id)
        : [];
  return new Set(ids.map(normalizeCanonicalId).filter(Boolean));
}

function rowsFromDoc(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc?.rows)) return doc.rows;
  if (Array.isArray(doc?.assets)) return doc.assets;
  if (Array.isArray(doc?.entries)) return doc.entries;
  return [];
}

function addScopedRowKeys(keys, canonicalIds, row) {
  const canonicalId = normalizeCanonicalId(row?.canonical_id || row?.id);
  if (!canonicalIds.has(canonicalId)) return;
  const symbol = row?.symbol || row?.ticker || row?.code || row?.display_symbol;
  const exchange = row?.exchange || row?.exchange_code || row?.mic;
  addScopeKey(keys, canonicalId);
  addScopeKey(keys, symbol);
  addScopeKey(keys, exchange && symbol ? `${exchange}:${symbol}` : null);
  addScopeKey(keys, exchange && symbol ? `${symbol}.${exchange}` : null);
}

function buildScopeInfo(scopeFile) {
  if (!scopeFile) return null;
  const canonicalIds = readScopeCanonicalIds(scopeFile);
  if (!canonicalIds?.size) {
    throw new Error(`scope file has no canonical ids: ${scopeFile}`);
  }
  const keys = new Set();
  for (const canonicalId of canonicalIds) addScopeKey(keys, canonicalId);

  const exact = readJsonMaybeGzip(SEARCH_EXACT_PATH);
  const exactRows = Array.isArray(exact?.rows)
    ? exact.rows
    : Object.values(exact?.by_symbol || {});
  for (const row of exactRows) addScopedRowKeys(keys, canonicalIds, row);

  const rowsDoc = readJson(SCOPE_ROWS_PATH);
  for (const row of rowsFromDoc(rowsDoc)) addScopedRowKeys(keys, canonicalIds, row);

  return {
    file: scopeFile,
    canonicalIds,
    keys,
  };
}

function compactHorizon(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['n', 'win_rate', 'avg_return', 'mae', 'mfe', 'max_drawdown']) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) out[key] = Number(number.toFixed(key === 'n' ? 0 : 6));
  }
  return Object.keys(out).length ? out : null;
}

function eventScore(event) {
  if (!event || typeof event !== 'object') return 0;
  return Number(event.h20d?.n || 0) * 4
    + Number(event.h60d?.n || 0) * 2
    + Number(event.h5d?.n || 0)
    + Number(event.h120d?.n || 0);
}

function compactProfile(doc, tickerFromFile, maxEvents) {
  const ticker = String(doc?.ticker || tickerFromFile || '').trim().toUpperCase();
  if (!ticker || !doc?.events || typeof doc.events !== 'object') return null;
  const events = {};
  const selected = Object.entries(doc.events)
    .filter(([, value]) => value && typeof value === 'object')
    .sort((left, right) => eventScore(right[1]) - eventScore(left[1]))
    .slice(0, maxEvents);
  for (const [eventName, eventValue] of selected) {
    const compact = {};
    for (const horizon of ['h5d', 'h20d', 'h60d', 'h120d']) {
      const horizonValue = compactHorizon(eventValue[horizon]);
      if (horizonValue) compact[horizon] = horizonValue;
    }
    if (Object.keys(compact).length) events[eventName] = compact;
  }
  if (!Object.keys(events).length) return null;
  return {
    ticker,
    latest_date: doc.latest_date || doc.as_of || null,
    computed_at: doc.computed_at || null,
    bars_count: Number.isFinite(Number(doc.bars_count)) ? Number(doc.bars_count) : null,
    events,
    source: 'hist_probs_public_projection',
  };
}

function profileRank(profile) {
  return [
    normalizeKey(profile?.latest_date),
    Number(profile?.bars_count || 0),
    Object.keys(profile?.events || {}).length,
  ];
}

function shouldReplaceProfile(previous, next) {
  if (!previous) return true;
  const left = profileRank(previous);
  const right = profileRank(next);
  for (let i = 0; i < left.length; i += 1) {
    if (right[i] !== left[i]) return right[i] > left[i];
  }
  return false;
}

function listProfileFiles(inputDir) {
  if (!fs.existsSync(inputDir)) return [];
  const files = [];
  const stack = [inputDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const base = path.basename(entry.name, '.json').toLowerCase();
        if (!['run-summary', 'status-summary', 'regime-daily'].includes(base)) files.push(full);
      }
    }
  }
  return files;
}

function main() {
  const options = parseArgs(process.argv);
  const generatedAt = new Date().toISOString();
  const files = listProfileFiles(options.inputDir);
  const scopeInfo = buildScopeInfo(options.scopeFile);
  const shards = Array.from({ length: options.shardCount }, () => ({}));
  const aliasCandidates = buildAliasCandidates();
  const profiles = new Map();
  const aliasOwners = new Map();
  let read = 0;
  let skipped = 0;
  let duplicateProfiles = 0;
  let skippedOutOfScope = 0;
  for (const filePath of files) {
    if (options.maxProfiles > 0 && profiles.size >= options.maxProfiles) break;
    const ticker = path.basename(filePath, '.json');
    if (scopeInfo && !scopeInfo.keys.has(normalizeKey(ticker))) {
      skippedOutOfScope += 1;
      continue;
    }
    read += 1;
    const doc = readJson(filePath);
    const compact = compactProfile(doc, ticker, options.maxEvents);
    if (!compact) {
      skipped += 1;
      continue;
    }
    const profileKey = normalizeKey(compact.ticker);
    if (profiles.has(profileKey)) duplicateProfiles += 1;
    if (shouldReplaceProfile(profiles.get(profileKey), compact)) profiles.set(profileKey, compact);
  }
  const profileList = [...profiles.values()];
  for (const compact of profileList) {
    const aliases = new Set([compact.ticker, ...(aliasCandidates.get(normalizeKey(compact.ticker)) || [])]);
    for (const alias of aliases) {
      const key = normalizeKey(alias);
      if (!isSymbolAlias(key)) continue;
      const owner = aliasOwners.get(key);
      if (!owner) aliasOwners.set(key, compact.ticker);
      else if (owner !== compact.ticker) aliasOwners.set(key, null);
    }
  }

  let written = 0;
  let aliasWritten = 0;
  for (const compact of profileList) {
    const aliases = new Set([compact.ticker, ...(aliasCandidates.get(normalizeKey(compact.ticker)) || [])]);
    for (const alias of aliases) {
      const key = normalizeKey(alias);
      if (!isSymbolAlias(key) || aliasOwners.get(key) !== compact.ticker) continue;
      const index = shardIndex(key, options.shardCount);
      const payload = key === compact.ticker
        ? compact
        : { ...compact, canonical_for_alias: compact.ticker, alias_key: key };
      shards[index][key] = payload;
      written += 1;
      if (key !== compact.ticker) aliasWritten += 1;
    }
  }

  fs.rmSync(options.outputDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(options.outputDir, 'shards'), { recursive: true });
  const shardStats = [];
  for (let i = 0; i < shards.length; i += 1) {
    const rel = `shards/${shardName(i)}`;
    const full = path.join(options.outputDir, rel);
    writeJson(full, shards[i]);
    shardStats.push({ shard: rel, rows: Object.keys(shards[i]).length, bytes: fs.statSync(full).size });
  }
  const latest = {
    schema: 'rv.hist_probs_public_latest.v1',
    generated_at: generatedAt,
    shard_count: options.shardCount,
    max_events_per_profile: options.maxEvents,
    profile_count: profileList.length,
    runtime_key_count: written,
    alias_key_count: aliasWritten,
    skipped_count: skipped,
    duplicate_profile_count: duplicateProfiles,
    skipped_out_of_scope_count: skippedOutOfScope,
    scope_file: scopeInfo ? path.relative(ROOT, scopeInfo.file).split(path.sep).join('/') : null,
    scope_canonical_id_count: scopeInfo?.canonicalIds.size || null,
    scope_key_count: scopeInfo?.keys.size || null,
    source: 'public/data/hist-probs',
    shards_path: 'shards',
  };
  writeJson(path.join(options.outputDir, 'latest.json'), latest);
  writeJson(path.join(options.outputDir, 'manifest.json'), {
    schema: 'rv.hist_probs_public_manifest.v1',
    generated_at: generatedAt,
    input_files_read: read,
    alias_sources: [
      path.relative(ROOT, SYMBOL_RESOLVE_PATH).split(path.sep).join('/'),
      path.relative(ROOT, SEARCH_EXACT_PATH).split(path.sep).join('/'),
    ],
    ...latest,
    shard_stats: shardStats,
  });
  console.log(JSON.stringify({
    ok: true,
    output: path.relative(ROOT, options.outputDir),
    profiles: profileList.length,
    runtime_keys: written,
    alias_keys: aliasWritten,
    skipped,
    duplicate_profiles: duplicateProfiles,
    skipped_out_of_scope: skippedOutOfScope,
    scope_canonical_ids: scopeInfo?.canonicalIds.size || null,
    shards: options.shardCount,
    max_shard_bytes: Math.max(0, ...shardStats.map((item) => item.bytes)),
  }));
}

main();
