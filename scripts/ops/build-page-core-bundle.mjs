#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  ALIAS_SHARD_COUNT,
  PAGE_CORE_HARD_BYTES,
  PAGE_CORE_SCHEMA,
  PAGE_CORE_TARGET_BYTES,
  PAGE_SHARD_COUNT,
  aliasShardIndex,
  aliasShardName,
  buildPageCoreSnapshotId,
  normalizeIsoDate,
  normalizePageCoreAlias,
  pageShardIndex,
  pageShardName,
  sha256Prefix,
  stableStringify,
} from '../lib/page-core-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DEFAULT_PAGE_CORE_ROOT = path.join(ROOT, 'public/data/page-core');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const SYMBOL_LOOKUP_PATH = path.join(ROOT, 'public/data/symbol-resolve.v1.lookup.json');
const SEARCH_EXACT_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
const DAILY_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.us_eu.daily_eval.canonical.ids.json');
const COMPAT_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
const OPERABILITY_PATH = path.join(ROOT, 'public/data/ops/stock-analyzer-operability-summary-latest.json');
const OPERABILITY_FULL_PATH = path.join(ROOT, 'public/data/ops/stock-analyzer-operability-latest.json');
const DECISIONS_LATEST_PATH = path.join(ROOT, 'public/data/decisions/latest.json');
const PAGE_CORE_SCHEMA_PATH = path.join(ROOT, 'schemas/stock-analyzer/page-core.v1.schema.json');
const PROTECTED_ALIASES = new Map([
  ['AAPL', 'US:AAPL'],
  ['MSFT', 'US:MSFT'],
  ['F', 'US:F'],
  ['V', 'US:V'],
  ['TSLA', 'US:TSLA'],
  ['SPY', 'US:SPY'],
  ['QQQ', 'US:QQQ'],
  ['BRK-B', 'US:BRK-B'],
  ['BRK.B', 'US:BRK.B'],
  ['BF-B', 'US:BF-B'],
  ['BF.B', 'US:BF.B'],
]);
const ALIAS_SHARD_MAX_BYTES = 512 * 1024;
const PAGE_SHARD_MAX_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const get = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || null;
  return {
    targetMarketDate: normalizeIsoDate(get('target-market-date') || process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || new Date().toISOString().slice(0, 10)),
    runId: get('run-id') || process.env.RV_RUN_ID || process.env.RUN_ID || `page-core-${new Date().toISOString().replace(/[:.]/g, '')}`,
    manifestSeed: get('manifest-seed') || process.env.RV_MANIFEST_SEED || '',
    pageCoreRoot: path.resolve(ROOT, get('page-core-root') || DEFAULT_PAGE_CORE_ROOT),
    replace: argv.includes('--replace'),
    promote: argv.includes('--promote'),
    dryRun: argv.includes('--dry-run'),
    maxAssets: Number.isFinite(Number(get('max-assets'))) ? Number(get('max-assets')) : null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonMaybe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function readGzipText(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
}

function readScopeIds() {
  const scopePath = fs.existsSync(DAILY_SCOPE_PATH) ? DAILY_SCOPE_PATH : COMPAT_SCOPE_PATH;
  const doc = readJsonMaybe(scopePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map((id) => normalizePageCoreAlias(id)).filter(Boolean));
}

function readOperabilityIds() {
  const doc = readJsonMaybe(OPERABILITY_FULL_PATH) || readJsonMaybe(OPERABILITY_PATH);
  const records = Array.isArray(doc?.records) ? doc.records : [];
  return new Set(records.map((row) => normalizePageCoreAlias(row?.canonical_id)).filter(Boolean));
}

function readRegistryRows() {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  const rows = [];
  const text = readGzipText(REGISTRY_PATH);
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const id = normalizePageCoreAlias(row?.canonical_id);
      const assetClass = normalizePageCoreAlias(row?.type_norm || row?.asset_class || row?.type);
      if (!id || !['STOCK', 'ETF', 'INDEX'].includes(assetClass)) continue;
      rows.push(row);
    } catch {
      // Skip malformed registry rows; bundle validation catches missing protected IDs.
    }
  }
  return rows;
}

function readSearchExact() {
  if (!fs.existsSync(SEARCH_EXACT_PATH)) return { bySymbol: {}, canonicalIds: new Set() };
  const text = readGzipText(SEARCH_EXACT_PATH);
  try {
    const doc = JSON.parse(text);
    const bySymbol = doc?.by_symbol && typeof doc.by_symbol === 'object' ? doc.by_symbol : {};
    const canonicalIds = new Set(Object.values(bySymbol).map((row) => normalizePageCoreAlias(row?.canonical_id)).filter(Boolean));
    return { bySymbol, canonicalIds };
  } catch {
    const bySymbol = {};
    const canonicalIds = new Set();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const alias = normalizePageCoreAlias(row?.symbol || row?.ticker || row?.key);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (alias && canonical) bySymbol[alias] = row;
        if (canonical) canonicalIds.add(canonical);
      } catch {
        // Best effort only.
      }
    }
    return { bySymbol, canonicalIds };
  }
}

function readSymbolLookup() {
  const doc = readJsonMaybe(SYMBOL_LOOKUP_PATH);
  return doc?.exact && typeof doc.exact === 'object' ? doc.exact : {};
}

function maybeCanonicalFromLookup(value) {
  if (Array.isArray(value)) return normalizePageCoreAlias(value[4]);
  if (value && typeof value === 'object') {
    return normalizePageCoreAlias(value.canonical_id || value.canonicalId);
  }
  if (typeof value === 'string') return normalizePageCoreAlias(value);
  return '';
}

function readDecisionRows() {
  const latest = readJsonMaybe(DECISIONS_LATEST_PATH);
  const snapshotPath = latest?.snapshot_path ? path.join(ROOT, 'public', latest.snapshot_path.replace(/^\/+/, '')) : null;
  const out = new Map();
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return out;
  for (const name of fs.readdirSync(snapshotPath)) {
    if (!/^part-\d{3}\.ndjson\.gz$/.test(name)) continue;
    const text = readGzipText(path.join(snapshotPath, name));
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (canonical) out.set(canonical, row);
      } catch {
        // Keep bundle build tolerant; decision data is enrichment.
      }
    }
  }
  return out;
}

function addAlias(aliasMap, collisions, alias, canonical, { authoritative = false } = {}) {
  const key = normalizePageCoreAlias(alias);
  const value = normalizePageCoreAlias(canonical);
  if (!key || !value) return;
  const protectedTarget = PROTECTED_ALIASES.get(key);
  if (protectedTarget && protectedTarget !== value) {
    throw new Error(`PROTECTED_ALIAS_COLLISION:${key}:${value}:expected:${protectedTarget}`);
  }
  const existing = aliasMap.get(key);
  if (!existing) {
    aliasMap.set(key, { canonical: value, authoritative });
    return;
  }
  if (existing.canonical === value) {
    existing.authoritative = existing.authoritative || authoritative;
    return;
  }
  if (authoritative && !existing.authoritative) {
    aliasMap.set(key, { canonical: value, authoritative: true });
    collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'authoritative_override' });
    return;
  }
  if (existing.authoritative && !authoritative) {
    collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'authoritative_kept' });
    return;
  }
  aliasMap.delete(key);
  collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'omitted_ambiguous' });
}

function buildAliasMap({ lookupExact, searchExact, registryRows, scopeIds }) {
  const aliasMap = new Map();
  const collisions = [];

  for (const [alias, value] of Object.entries(lookupExact)) {
    const canonical = maybeCanonicalFromLookup(value);
    if (!canonical) continue;
    scopeIds.add(canonical);
    addAlias(aliasMap, collisions, alias, canonical, { authoritative: true });
  }

  for (const [alias, row] of Object.entries(searchExact.bySymbol || {})) {
    const canonical = normalizePageCoreAlias(row?.canonical_id);
    if (!canonical) continue;
    scopeIds.add(canonical);
    addAlias(aliasMap, collisions, alias, canonical);
  }

  const symbolOwners = new Map();
  for (const row of registryRows) {
    const canonical = normalizePageCoreAlias(row?.canonical_id);
    const symbol = normalizePageCoreAlias(row?.symbol);
    if (!canonical || !symbol) continue;
    const prev = symbolOwners.get(symbol);
    if (!prev) symbolOwners.set(symbol, canonical);
    else if (prev !== canonical) symbolOwners.set(symbol, null);
  }
  for (const [symbol, canonical] of symbolOwners.entries()) {
    if (canonical) addAlias(aliasMap, collisions, symbol, canonical);
  }

  for (const canonical of scopeIds) {
    addAlias(aliasMap, collisions, canonical, canonical, { authoritative: true });
  }

  for (const [alias, expected] of PROTECTED_ALIASES.entries()) {
    const actual = aliasMap.get(alias)?.canonical || null;
    if (actual && actual !== expected) throw new Error(`PROTECTED_ALIAS_MISMATCH:${alias}:${actual}:expected:${expected}`);
  }

  return {
    aliases: Object.fromEntries(Array.from(aliasMap.entries()).map(([key, entry]) => [key, entry.canonical]).sort(([a], [b]) => a.localeCompare(b))),
    collisions,
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lastTwo(values) {
  if (!Array.isArray(values) || values.length === 0) return [null, null];
  const last = numberOrNull(values[values.length - 1]);
  const prev = values.length > 1 ? numberOrNull(values[values.length - 2]) : null;
  return [last, prev];
}

function confidenceBucket(score) {
  const n = numberOrNull(score);
  if (n == null) return null;
  if (n >= 85) return 'high';
  if (n >= 65) return 'medium';
  if (n >= 45) return 'low';
  return 'very_low';
}

function buildPageCoreRow({ canonicalId, registryRow, decisionRow, lookupValue, targetMarketDate, generatedAt, runId, snapshotId }) {
  const display = normalizePageCoreAlias(registryRow?.symbol || (Array.isArray(lookupValue) ? lookupValue[0] : null) || canonicalId.split(':').pop());
  const name = registryRow?.name || (Array.isArray(lookupValue) ? lookupValue[1] : null) || display;
  const assetClass = normalizePageCoreAlias(registryRow?.type_norm || registryRow?.asset_class || (Array.isArray(lookupValue) ? lookupValue[5] : null) || 'UNKNOWN');
  const [lastClose, prevClose] = lastTwo(registryRow?._tmp_recent_closes);
  const dailyChangeAbs = lastClose != null && prevClose != null ? Number((lastClose - prevClose).toFixed(6)) : null;
  const dailyChangePct = dailyChangeAbs != null && prevClose ? Number(((dailyChangeAbs / prevClose) * 100).toFixed(6)) : null;
  const qualityStatus = decisionRow?.pipeline_status || (registryRow ? 'DEGRADED' : 'MISSING_DATA');
  const blockingReasons = Array.isArray(decisionRow?.blocking_reasons)
    ? decisionRow.blocking_reasons
    : registryRow ? [] : ['registry_row_missing'];
  const warnings = Array.isArray(decisionRow?.warnings) ? decisionRow.warnings.slice(0, 8) : [];
  if (!registryRow) warnings.push('registry_row_missing');
  if (!decisionRow) warnings.push('decision_bundle_missing');
  const asOf = registryRow?.last_trade_date || decisionRow?.target_market_date || targetMarketDate || null;
  const staleAfter = asOf ? new Date(Date.parse(`${asOf}T00:00:00Z`) + 48 * 60 * 60 * 1000).toISOString() : null;
  const row = {
    ok: true,
    schema_version: PAGE_CORE_SCHEMA,
    run_id: runId,
    snapshot_id: snapshotId,
    canonical_asset_id: canonicalId,
    display_ticker: display,
    provider_ticker: registryRow?.provider_symbol || null,
    freshness: {
      status: asOf ? 'fresh' : 'missing',
      as_of: asOf,
      generated_at: generatedAt,
      stale_after: staleAfter,
    },
    identity: {
      name,
      country: registryRow?.country || (Array.isArray(lookupValue) ? lookupValue[3] : null) || null,
      exchange: registryRow?.exchange || (Array.isArray(lookupValue) ? lookupValue[2] : null) || null,
      sector: null,
      industry: null,
      asset_class: assetClass,
    },
    summary_min: {
      last_close: lastClose,
      daily_change_pct: dailyChangePct,
      daily_change_abs: dailyChangeAbs,
      market_cap: null,
      decision_verdict: decisionRow?.verdict || (registryRow ? 'WAIT' : 'WAIT_PIPELINE_INCOMPLETE'),
      decision_confidence_bucket: confidenceBucket(registryRow?.computed?.score_0_100 || decisionRow?.risk_assessment?.score),
      learning_status: null,
      quality_status: qualityStatus,
      governance_status: decisionRow ? 'available' : 'unavailable',
    },
    governance_summary: {
      status: decisionRow ? String(decisionRow.pipeline_status || 'available').toLowerCase() : 'unavailable',
      evaluation_role: decisionRow?.evaluation_role || null,
      learning_gate_status: null,
      blocking_reasons: blockingReasons,
      warnings,
    },
    coverage: {
      bars: numberOrNull(registryRow?.bars_count),
      derived_daily: Boolean(decisionRow),
      governance: Boolean(decisionRow),
      fundamentals: false,
      forecast: false,
      ui_renderable: true,
    },
    module_links: {
      historical: `/api/v2/stocks/${encodeURIComponent(display)}/historical`,
      fundamentals: `/api/fundamentals?ticker=${encodeURIComponent(display)}`,
      forecast: null,
      quote: `/api/v2/quote/${encodeURIComponent(display)}`,
    },
    meta: {
      source: 'page-core-builder',
      render_contract: 'critical_page_contract',
      warnings,
    },
  };
  const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  if (bytes > PAGE_CORE_TARGET_BYTES) row.meta.warnings = Array.from(new Set([...row.meta.warnings, 'row_over_target_size']));
  const hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  if (hardBytes > PAGE_CORE_HARD_BYTES) throw new Error(`PAGE_CORE_ROW_TOO_LARGE:${canonicalId}:${hardBytes}`);
  return row;
}

function basicValidateRow(row) {
  const required = ['ok', 'schema_version', 'run_id', 'snapshot_id', 'canonical_asset_id', 'display_ticker', 'freshness', 'identity', 'summary_min', 'governance_summary', 'coverage', 'module_links', 'meta'];
  return required.every((key) => row[key] !== undefined) && row.schema_version === PAGE_CORE_SCHEMA;
}

function buildSchemaValidator() {
  const schema = readJson(PAGE_CORE_SCHEMA_PATH);
  const ajv = new Ajv2020({ strict: false, allErrors: false });
  return ajv.compile(schema);
}

function ensureEmptyDir(dirPath, replace) {
  if (fs.existsSync(dirPath)) {
    if (!replace) throw new Error(`OUTPUT_EXISTS:${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeGzipJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(payload);
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 6 });
  fs.writeFileSync(filePath, gz);
  return { bytes: gz.length, hash: sha256Prefix(gz) };
}

function buildBundle(opts) {
  const generatedAt = new Date().toISOString();
  const scopeIds = readScopeIds();
  for (const canonical of readOperabilityIds()) scopeIds.add(canonical);
  const registryRows = readRegistryRows();
  const registryById = new Map(registryRows.map((row) => [normalizePageCoreAlias(row.canonical_id), row]));
  const searchExact = readSearchExact();
  const lookupExact = readSymbolLookup();
  for (const canonical of searchExact.canonicalIds) scopeIds.add(canonical);
  for (const row of registryRows) scopeIds.add(normalizePageCoreAlias(row.canonical_id));
  const decisions = readDecisionRows();
  const { aliases, collisions } = buildAliasMap({ lookupExact, searchExact, registryRows, scopeIds });
  const snapshotId = buildPageCoreSnapshotId({
    runId: opts.runId,
    targetMarketDate: opts.targetMarketDate,
    manifestSeed: `${opts.manifestSeed}|${Object.keys(aliases).length}|${scopeIds.size}`,
  });
  let canonicalIds = Array.from(scopeIds).filter(Boolean).sort();
  if (opts.maxAssets) canonicalIds = canonicalIds.slice(0, opts.maxAssets);

  const rows = [];
  const lookupByCanonical = new Map();
  for (const value of Object.values(lookupExact)) {
    const canonical = maybeCanonicalFromLookup(value);
    if (canonical) lookupByCanonical.set(canonical, value);
  }
  for (const canonicalId of canonicalIds) {
    const row = buildPageCoreRow({
      canonicalId,
      registryRow: registryById.get(canonicalId) || null,
      decisionRow: decisions.get(canonicalId) || null,
      lookupValue: lookupByCanonical.get(canonicalId) || null,
      targetMarketDate: opts.targetMarketDate,
      generatedAt,
      runId: opts.runId,
      snapshotId,
    });
    rows.push(row);
  }

  const validateSchema = buildSchemaValidator();
  const invalid = [];
  const validRows = rows.filter((row) => {
    const ok = basicValidateRow(row) && validateSchema(row);
    if (!ok && invalid.length < 5) invalid.push({ canonical_id: row?.canonical_asset_id || null, errors: validateSchema.errors || [] });
    return ok;
  }).length;
  const schemaValidRate = rows.length ? validRows / rows.length : 0;
  if (schemaValidRate < 0.999) throw new Error(`PAGE_CORE_SCHEMA_VALID_RATE_LOW:${schemaValidRate}:${JSON.stringify(invalid)}`);

  const aliasShards = Array.from({ length: ALIAS_SHARD_COUNT }, () => ({}));
  for (const [alias, canonical] of Object.entries(aliases)) {
    aliasShards[aliasShardIndex(alias)][alias] = canonical;
  }

  const pageShards = Array.from({ length: PAGE_SHARD_COUNT }, () => ({}));
  for (const row of rows) {
    pageShards[pageShardIndex(row.canonical_asset_id)][row.canonical_asset_id] = row;
  }

  const rowBytes = rows.map((row) => Buffer.byteLength(JSON.stringify(row), 'utf8'));
  const overTarget = rowBytes.filter((value) => value > PAGE_CORE_TARGET_BYTES).length;
  const overHard = rowBytes.filter((value) => value > PAGE_CORE_HARD_BYTES).length;
  if (overHard > 0) throw new Error(`PAGE_CORE_HARD_SIZE_VIOLATION:${overHard}`);

  const manifest = {
    schema: 'rv.page_core_manifest.v1',
    schema_version: '1.0',
    status: 'STAGED',
    run_id: opts.runId,
    snapshot_id: snapshotId,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    schema_version_payload: PAGE_CORE_SCHEMA,
    alias_shard_count: ALIAS_SHARD_COUNT,
    page_shard_count: PAGE_SHARD_COUNT,
    asset_count: rows.length,
    alias_count: Object.keys(aliases).length,
    alias_collision_count: collisions.filter((item) => item.resolution === 'omitted_ambiguous').length,
    row_size: {
      target_bytes: PAGE_CORE_TARGET_BYTES,
      hard_bytes: PAGE_CORE_HARD_BYTES,
      max_bytes: Math.max(...rowBytes, 0),
      over_target_count: overTarget,
      over_hard_count: overHard,
    },
    validation: {
      ok: schemaValidRate >= 0.999 && overHard === 0,
      schema_valid_rate: schemaValidRate,
      protected_aliases: Object.fromEntries(Array.from(PROTECTED_ALIASES.entries()).map(([alias, expected]) => [alias, aliases[alias] || null])),
    },
    paths: {
      latest_candidate: '/data/page-core/candidates/latest.candidate.json',
      snapshot_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}`,
      manifest_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/manifest.json`,
      alias_shards_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/alias-shards`,
      page_shards_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/page-shards`,
    },
  };

  const pointer = {
    schema: 'rv.page_core_latest.v1',
    schema_version: '1.0',
    status: opts.promote ? 'ACTIVE' : 'STAGED',
    run_id: opts.runId,
    snapshot_id: snapshotId,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    valid_until: new Date(Date.parse(generatedAt) + 48 * 60 * 60 * 1000).toISOString(),
    snapshot_path: manifest.paths.snapshot_path,
    manifest_path: manifest.paths.manifest_path,
    schema_version_payload: PAGE_CORE_SCHEMA,
    alias_shard_count: ALIAS_SHARD_COUNT,
    page_shard_count: PAGE_SHARD_COUNT,
    asset_count: rows.length,
    alias_count: Object.keys(aliases).length,
  };

  return { snapshotId, manifest, pointer, aliasShards, pageShards, rows, collisions };
}

function writeBundle(opts, bundle) {
  const snapshotDir = path.join(opts.pageCoreRoot, 'snapshots', opts.targetMarketDate, bundle.snapshotId);
  ensureEmptyDir(snapshotDir, opts.replace);
  const aliasDir = path.join(snapshotDir, 'alias-shards');
  const pageDir = path.join(snapshotDir, 'page-shards');
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.mkdirSync(pageDir, { recursive: true });

  const aliasFiles = [];
  for (let i = 0; i < ALIAS_SHARD_COUNT; i += 1) {
    const file = path.join(aliasDir, aliasShardName(i));
    const stats = writeGzipJson(file, bundle.aliasShards[i]);
    if (stats.bytes > ALIAS_SHARD_MAX_BYTES) throw new Error(`PAGE_CORE_ALIAS_SHARD_TOO_LARGE:${i}:${stats.bytes}`);
    aliasFiles.push({ shard: i, ...stats });
  }
  const pageFiles = [];
  for (let i = 0; i < PAGE_SHARD_COUNT; i += 1) {
    const file = path.join(pageDir, pageShardName(i));
    const stats = writeGzipJson(file, bundle.pageShards[i]);
    if (stats.bytes > PAGE_SHARD_MAX_BYTES) throw new Error(`PAGE_CORE_PAGE_SHARD_TOO_LARGE:${i}:${stats.bytes}`);
    pageFiles.push({ shard: i, ...stats });
  }

  const manifest = {
    ...bundle.manifest,
    alias_files: aliasFiles,
    page_files: pageFiles,
    bundle_hash: sha256Prefix(stableStringify({
      pointer: bundle.pointer,
      alias_files: aliasFiles,
      page_files: pageFiles,
    })),
  };
  writeJsonAtomic(path.join(snapshotDir, 'manifest.json'), manifest);
  writeJsonAtomic(path.join(opts.pageCoreRoot, 'candidates/latest.candidate.json'), {
    ...bundle.pointer,
    status: 'STAGED',
    bundle_hash: manifest.bundle_hash,
  });
  if (opts.promote) {
    writeJsonAtomic(path.join(opts.pageCoreRoot, 'latest.json'), {
      ...bundle.pointer,
      status: 'ACTIVE',
      bundle_hash: manifest.bundle_hash,
    });
  }
  return manifest;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.targetMarketDate) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const bundle = buildBundle(opts);
  if (opts.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      snapshot_id: bundle.snapshotId,
      asset_count: bundle.rows.length,
      alias_count: Object.keys(bundle.aliasShards.reduce((acc, shard) => Object.assign(acc, shard), {})).length,
      collisions: bundle.collisions.length,
      validation: bundle.manifest.validation,
    }, null, 2));
    return;
  }
  const manifest = writeBundle(opts, bundle);
  console.log(JSON.stringify({
    ok: true,
    snapshot_id: bundle.snapshotId,
    promoted: opts.promote,
    snapshot_path: manifest.paths.snapshot_path,
    asset_count: manifest.asset_count,
    alias_count: manifest.alias_count,
    alias_collision_count: manifest.alias_collision_count,
    max_row_bytes: manifest.row_size.max_bytes,
    bundle_hash: manifest.bundle_hash,
  }, null, 2));
}

main();
