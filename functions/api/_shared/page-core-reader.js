import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { MAX_STALE_MS, evaluateFreshness } from './staleness-budgets.js';
import {
  PAGE_CORE_SCHEMA,
  aliasShardIndex,
  aliasShardName,
  isValidPageCoreAlias,
  normalizePageCoreAlias,
  pageShardIndex,
  pageShardName,
} from './page-core-contract.js';
import {
  normalizePageCoreOperationalState,
  pageCoreClaimsOperational,
  pageCoreStrictOperationalReasons,
} from './page-core-operational-contract.js';
export {
  normalizePageCoreOperationalState,
  pageCoreClaimsOperational,
  pageCoreReturnIntegrity,
  pageCoreStrictOperationalReasons,
} from './page-core-operational-contract.js';

const LATEST_CACHE_TTL_MS = 60_000;
const SHARD_CACHE_TTL_MS = 120_000;
const LOCAL_ROOT = (() => {
  const envRoot = String(process.env?.RV_REPO_ROOT || '').trim();
  if (envRoot) return envRoot;
  try {
    return process.cwd();
  } catch {
    return '.';
  }
})();
const ALIAS_MARKET_DATA_NAME_SIMILARITY_MIN = 0.8;
const MIN_PAGE_SHARD_COUNT = 256;

let latestCache = null;
const aliasShardCache = new Map();
const pageShardCache = new Map();

function nowMs() {
  return Date.now();
}

function isLocalDevRequest(request) {
  try {
    const { hostname } = new URL(request?.url || '');
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function resolveRootDir(options = {}) {
  if (options.rootDir) return options.rootDir;
  return isLocalDevRequest(options.request) ? LOCAL_ROOT : null;
}

function localPathFor(publicPath, rootDir = LOCAL_ROOT) {
  const clean = String(publicPath || '').split('?')[0];
  if (!clean.startsWith('/data/')) return null;
  return path.join(rootDir, 'public', clean.slice(1));
}

async function readLocalAsset(publicPath, rootDir) {
  const filePath = localPathFor(publicPath, rootDir);
  if (!filePath) return null;
  const buffer = await fs.readFile(filePath);
  if (filePath.endsWith('.gz')) return gunzipSync(buffer).toString('utf8');
  return buffer.toString('utf8');
}

async function fetchAssetText(publicPath, { request, env, fetchImpl = fetch, rootDir = null } = {}) {
  const localRoot = rootDir || (env?.ASSETS ? null : resolveRootDir({ request, rootDir }));
  if (localRoot) return readLocalAsset(publicPath, localRoot);
  const origin = request?.url ? new URL(request.url).origin : 'http://localhost';
  const url = new URL(publicPath, origin);
  const assetFetcher = env?.ASSETS || null;
  const response = assetFetcher && publicPath.startsWith('/data/')
    ? await assetFetcher.fetch(url.toString())
    : await fetchImpl(url.toString(), { cache: 'no-store' });
  if (!response?.ok) throw new Error(`PAGE_CORE_FETCH_FAILED:${publicPath}:${response?.status || 'unknown'}`);
  const isGzip = publicPath.endsWith('.gz') || String(response.headers?.get?.('content-encoding') || '').includes('gzip');
  if (!isGzip) return response.text();
  if (typeof DecompressionStream === 'function' && response.body) {
    const inflated = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(inflated).text();
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return gunzipSync(buffer).toString('utf8');
}

async function fetchAssetJson(publicPath, options) {
  const text = await fetchAssetText(publicPath, options);
  return JSON.parse(text);
}

function cacheGet(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry || (nowMs() - entry.at) > ttlMs) return null;
  return entry.value;
}

function cacheSet(cache, key, value, maxEntries = 16) {
  cache.set(key, { at: nowMs(), value });
  while (cache.size > maxEntries) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

function latestCacheGet() {
  if (!latestCache || (nowMs() - latestCache.at) > LATEST_CACHE_TTL_MS) return null;
  return latestCache.value;
}

function validateLatest(latest) {
  if (!latest || latest.schema !== 'rv.page_core_latest.v1') return 'PAGE_CORE_LATEST_MISSING';
  if (!latest.snapshot_path) return 'PAGE_CORE_SNAPSHOT_PATH_MISSING';
  if (!latest.snapshot_id) return 'PAGE_CORE_SNAPSHOT_ID_MISSING';
  if (!latest.alias_shard_count || Number(latest.alias_shard_count) !== 64) return 'PAGE_CORE_ALIAS_SHARD_COUNT_INVALID';
  if (!latest.page_shard_count || Number(latest.page_shard_count) < MIN_PAGE_SHARD_COUNT) return 'PAGE_CORE_PAGE_SHARD_COUNT_INVALID';
  return null;
}

function pageShardCountForLatest(latest) {
  const count = Number(latest?.page_shard_count);
  return Number.isInteger(count) && count >= MIN_PAGE_SHARD_COUNT ? count : PAGE_SHARD_COUNT;
}

async function loadLatest(options = {}) {
  const cached = latestCacheGet();
  if (cached) return cached;
  const latest = await fetchAssetJson('/data/page-core/latest.json', options);
  latestCache = { at: nowMs(), value: latest };
  return latest;
}

function shardPath(latest, type, shardName) {
  const base = String(latest?.snapshot_path || '').replace(/\/+$/, '');
  return `${base}/${type}/${shardName}`;
}

async function loadAliasShard(latest, index, options = {}) {
  const publicPath = shardPath(latest, 'alias-shards', aliasShardName(index));
  const cached = cacheGet(aliasShardCache, publicPath, SHARD_CACHE_TTL_MS);
  if (cached) return cached;
  const shard = await fetchAssetJson(publicPath, options);
  cacheSet(aliasShardCache, publicPath, shard || {});
  return shard || {};
}

async function loadPageShard(latest, index, options = {}) {
  const publicPath = shardPath(latest, 'page-shards', pageShardName(index));
  const cached = cacheGet(pageShardCache, publicPath, SHARD_CACHE_TTL_MS);
  if (cached) return cached;
  const shard = await fetchAssetJson(publicPath, options);
  cacheSet(pageShardCache, publicPath, shard || {});
  return shard || {};
}

function failure(code, message, details = {}) {
  return {
    ok: false,
    httpStatus: details.httpStatus || 200,
    code,
    message,
    run_id: details.run_id || null,
    canonical_id: details.canonical_id || null,
    freshness_status: details.freshness_status || 'error',
    pageCore: null,
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeNameForAliasBasis(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|nv|ag|se|holdings|holding|group|class|common|registered|shares|adr|sponsored)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value) {
  const text = normalizeNameForAliasBasis(value).replace(/\s+/g, '');
  const grams = new Set();
  for (let i = 0; i < text.length - 2; i += 1) grams.add(text.slice(i, i + 3));
  if (grams.size === 0 && text) grams.add(text);
  return grams;
}

function nameSimilarity(a, b) {
  const left = trigrams(a);
  const right = trigrams(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return intersection / Math.max(1, Math.min(left.size, right.size));
}

function aliasFallbackSourceAllowed(row, latest = null, freshnessStatus = null) {
  const reasons = pageCoreStrictOperationalReasons(row, { latest, freshnessStatus })
    .filter((reason) => reason !== 'ui_banner_not_operational');
  if (reasons.length === 0) return false;
  return reasons.every((reason) => (
    reason === 'bars_stale'
    || reason === 'freshness_stale'
    || reason === 'freshness_expired'
    || reason === 'primary_blocker:bars_stale'
  ));
}

export function pageCoreAliasMarketDataCompatible(sourceRow, candidateRow) {
  if (!sourceRow || !candidateRow || sourceRow === candidateRow) return false;
  if (sourceRow.canonical_asset_id === candidateRow.canonical_asset_id) return false;
  if (String(sourceRow.display_ticker || '') !== String(candidateRow.display_ticker || '')) return false;
  const sourceClass = String(sourceRow?.identity?.asset_class || '').toUpperCase();
  const candidateClass = String(candidateRow?.identity?.asset_class || '').toUpperCase();
  if (!sourceClass || sourceClass !== candidateClass) return false;
  const sourceCountry = String(sourceRow?.identity?.country || '').toUpperCase();
  const candidateCountry = String(candidateRow?.identity?.country || '').toUpperCase();
  if (!sourceCountry || sourceCountry !== candidateCountry) return false;
  return nameSimilarity(sourceRow?.identity?.name, candidateRow?.identity?.name) >= ALIAS_MARKET_DATA_NAME_SIMILARITY_MIN;
}

export function applyPageCoreAliasMarketDataFallback(sourceRow, candidateRow, { latest = null } = {}) {
  if (!aliasFallbackSourceAllowed(sourceRow, latest, sourceRow?.freshness?.status || null)) return null;
  if (!pageCoreAliasMarketDataCompatible(sourceRow, candidateRow)) return null;
  const candidate = normalizePageCoreOperationalState(candidateRow, {
    latest,
    freshnessStatus: candidateRow?.freshness?.status || null,
  });
  const candidateReasons = pageCoreStrictOperationalReasons(candidate, {
    latest,
    freshnessStatus: candidate?.freshness?.status || null,
  });
  if (candidateReasons.length > 0 || !pageCoreClaimsOperational(candidate)) return null;
  const basis = {
    source_canonical_id: candidate.canonical_asset_id || null,
    source_ticker: candidate.display_ticker || null,
    requested_canonical_id: sourceRow.canonical_asset_id || null,
    reason: 'stale_equivalent_alias_market_data_basis',
  };
  return normalizePageCoreOperationalState({
    ...candidate,
    canonical_asset_id: sourceRow.canonical_asset_id,
    display_ticker: sourceRow.display_ticker,
    provider_ticker: sourceRow.provider_ticker || sourceRow.display_ticker || candidate.provider_ticker || null,
    identity: {
      ...(candidate.identity || {}),
      ...(sourceRow.identity || {}),
    },
    module_links: {
      ...(candidate.module_links || {}),
      ...(sourceRow.module_links || {}),
    },
    meta: {
      ...(candidate.meta || {}),
      market_data_alias_basis: basis,
      warnings: unique([
        ...(Array.isArray(candidate?.meta?.warnings) ? candidate.meta.warnings : []),
        `market_data_alias_basis:${candidate.canonical_asset_id}`,
      ]),
    },
    status_contract: {
      ...(candidate.status_contract || {}),
      alias_market_data_basis: basis,
    },
  }, {
    latest,
    freshnessStatus: candidate?.freshness?.status || null,
  });
}

export function clearPageCoreReaderCache() {
  latestCache = null;
  aliasShardCache.clear();
  pageShardCache.clear();
}

export async function readPageCoreForTicker(rawTicker, options = {}) {
  const query = normalizePageCoreAlias(rawTicker);
  if (!isValidPageCoreAlias(query)) {
    return failure('INVALID_TICKER', 'Invalid or missing ticker parameter', { httpStatus: 400 });
  }
  try {
    const latest = await loadLatest(options);
    const latestError = validateLatest(latest);
    if (latestError) {
      return failure(latestError, 'Page-core latest pointer is missing or invalid', {
        run_id: latest?.run_id || null,
        freshness_status: 'error',
      });
    }
    const aliasShard = await loadAliasShard(latest, aliasShardIndex(query), options);
    const canonical = normalizePageCoreAlias(aliasShard?.[query]);
    if (!canonical) {
      return failure('INVALID_OR_UNMAPPED_TICKER', 'Ticker is not mapped in page-core alias shards', {
        run_id: latest.run_id,
        freshness_status: 'missing',
      });
    }
    const pageShardCount = pageShardCountForLatest(latest);
    const pageShard = await loadPageShard(latest, pageShardIndex(canonical, pageShardCount), options);
    const row = pageShard?.[canonical] || null;
    if (!row || row.schema_version !== PAGE_CORE_SCHEMA) {
      return failure('PAGE_CORE_NOT_FOUND', 'Mapped asset has no page-core row', {
        run_id: latest.run_id,
        canonical_id: canonical,
        freshness_status: 'missing',
      });
    }
    const freshness = evaluateFreshness(row.freshness, MAX_STALE_MS.page_core_daily, options.nowMs || Date.now());
    let pageCore = normalizePageCoreOperationalState(row, {
      latest,
      freshnessStatus: freshness.status,
    });
    if (pageCoreStrictOperationalReasons(pageCore, { latest, freshnessStatus: pageCore?.freshness?.status || freshness.status }).length > 0) {
      const displayAlias = normalizePageCoreAlias(row.display_ticker || '');
      if (displayAlias && displayAlias !== canonical) {
        const displayAliasShard = await loadAliasShard(latest, aliasShardIndex(displayAlias), options);
        const aliasCanonical = normalizePageCoreAlias(displayAliasShard?.[displayAlias]);
        if (aliasCanonical && aliasCanonical !== canonical) {
          const aliasPageShard = await loadPageShard(latest, pageShardIndex(aliasCanonical, pageShardCount), options);
          const aliasRow = aliasPageShard?.[aliasCanonical] || null;
          const aliasFallback = applyPageCoreAliasMarketDataFallback(row, aliasRow, { latest });
          if (aliasFallback) pageCore = aliasFallback;
        }
      }
    }
    return {
      ok: true,
      httpStatus: 200,
      run_id: latest.run_id,
      snapshot_id: latest.snapshot_id,
      canonical_id: canonical,
      freshness_status: freshness.status,
      pageCore,
      latest,
    };
  } catch (error) {
    return failure('PAGE_CORE_UNAVAILABLE', error instanceof Error ? error.message : 'Page-core unavailable', {
      httpStatus: 200,
      freshness_status: 'error',
    });
  }
}
