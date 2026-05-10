#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const SEARCH_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const GLOBAL_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const PAGE_CORE_LATEST_PATH = path.join(ROOT, 'public/data/page-core/candidates/latest.candidate.json');
const OUT_PATH = path.join(ROOT, 'public/data/universe/v7/reports/search_registry_sync_report.json');
const ALLOWED_TYPES = new Set(['STOCK', 'ETF', 'INDEX']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readGzipJson(filePath) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function readRegistryById() {
  const byId = new Map();
  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const canonicalId = normalize(row?.canonical_id);
      if (!canonicalId) continue;
      byId.set(canonicalId, row);
    } catch {
      // Malformed registry rows are caught by registry gates.
    }
  }
  return byId;
}

function compareSearchToRegistry(bySymbol, registryById) {
  const mismatches = [];
  let mismatchCount = 0;
  let checked = 0;
  let outOfScopeTypes = 0;
  for (const [symbol, searchRow] of Object.entries(bySymbol || {})) {
    const canonicalId = normalize(searchRow?.canonical_id);
    const typeNorm = normalize(searchRow?.type_norm);
    if (!ALLOWED_TYPES.has(typeNorm)) {
      outOfScopeTypes += 1;
      mismatchCount += 1;
      if (mismatches.length < 50) mismatches.push({ symbol, canonical_id: canonicalId, reason: 'search_type_out_of_scope', search_type_norm: typeNorm });
      continue;
    }
    const registryRow = registryById.get(canonicalId);
    if (!registryRow) {
      mismatchCount += 1;
      if (mismatches.length < 50) mismatches.push({ symbol, canonical_id: canonicalId, reason: 'missing_registry_row' });
      continue;
    }
    checked += 1;
    const checks = [
      ['canonical_id', normalize(searchRow?.canonical_id), normalize(registryRow?.canonical_id)],
      ['type_norm', normalize(searchRow?.type_norm), normalize(registryRow?.type_norm)],
      ['bars_count', num(searchRow?.bars_count), num(registryRow?.bars_count)],
      ['last_trade_date', String(searchRow?.last_trade_date || ''), String(registryRow?.last_trade_date || '')],
    ];
    const failed = checks.filter(([, a, b]) => a !== b);
    if (failed.length && mismatches.length < 50) {
      mismatches.push({
        symbol,
        canonical_id: canonicalId,
        reason: 'registry_field_mismatch',
        fields: Object.fromEntries(failed.map(([field, searchValue, registryValue]) => [field, { search: searchValue, registry: registryValue }])),
      });
    }
    if (failed.length) mismatchCount += 1;
  }
  return { checked, outOfScopeTypes, mismatchCount, mismatchExamples: mismatches };
}

function expectedSearchGuards(bySymbol, scope) {
  const ids = new Set((Array.isArray(scope?.canonical_ids) ? scope.canonical_ids : [])
    .map((id) => String(id || '').trim().toUpperCase())
    .filter(Boolean));
  const guards = [
    { symbol: 'SPY', canonical_id: 'US:SPY', rejects: ['BA:SPY'] },
    { symbol: 'QQQ', canonical_id: 'US:QQQ', rejects: ['NEO:QQQ'] },
    { symbol: '0050', canonical_id: 'TW:0050', rejects: ['KLSE:0050'] },
  ];
  const failures = [];
  for (const guard of guards) {
    if (!ids.has(guard.canonical_id)) continue;
    const actual = String(bySymbol?.[guard.symbol]?.canonical_id || '').trim().toUpperCase();
    if (actual !== guard.canonical_id || guard.rejects.includes(actual)) {
      failures.push({ symbol: guard.symbol, expected: guard.canonical_id, actual: actual || null, rejects: guard.rejects });
    }
  }
  return failures;
}

function main() {
  const search = readGzipJson(SEARCH_PATH);
  const registryById = readRegistryById();
  const scope = readJson(GLOBAL_SCOPE_PATH);
  const pageCoreLatest = fs.existsSync(PAGE_CORE_LATEST_PATH) ? readJson(PAGE_CORE_LATEST_PATH) : null;
  const searchGeneratedMs = Date.parse(search?.generated_at || '');
  const registryMtimeMs = fs.statSync(REGISTRY_PATH).mtimeMs;
  const searchFreshAgainstRegistry = Number.isFinite(searchGeneratedMs) && searchGeneratedMs >= registryMtimeMs;
  const bySymbol = search?.by_symbol && typeof search.by_symbol === 'object' ? search.by_symbol : {};
  const compare = compareSearchToRegistry(bySymbol, registryById);
  const guardFailures = expectedSearchGuards(bySymbol, scope);
  const scopeCount = Number(scope?.count ?? (Array.isArray(scope?.canonical_ids) ? scope.canonical_ids.length : 0));
  const pageCoreCount = pageCoreLatest ? Number(pageCoreLatest.asset_count || 0) : null;
  const transitionMode = process.env.RV_UNIVERSE_SCOPE_TRANSITION === '1';
  const pageCoreScopedCountOk = pageCoreCount == null
    || pageCoreCount === scopeCount
    || (transitionMode && pageCoreCount > scopeCount && scopeCount > 0);
  const ok = searchFreshAgainstRegistry
    && compare.outOfScopeTypes === 0
    && compare.mismatchCount === 0
    && guardFailures.length === 0
    && pageCoreScopedCountOk;
  const report = {
    schema: 'rv.search_registry_sync_report.v1',
    generated_at: new Date().toISOString(),
    status: ok ? 'PASS' : 'FAIL',
    search_generated_at: search?.generated_at || null,
    registry_mtime: new Date(registryMtimeMs).toISOString(),
    search_fresh_against_registry: searchFreshAgainstRegistry,
    search_exact_count: Object.keys(bySymbol).length,
    registry_count: registryById.size,
    scope_count: scopeCount,
    page_core_asset_count: pageCoreCount,
    page_core_scoped_count_ok: pageCoreScopedCountOk,
    transition_mode: transitionMode,
    search_guard_failures: guardFailures,
    ...compare,
  };
  writeJsonAtomic(OUT_PATH, report);
  console.log(JSON.stringify({ ok, out: path.relative(ROOT, OUT_PATH), status: report.status }, null, 2));
  if (!ok) process.exitCode = 1;
}

main();
