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
  if (!latest.page_shard_count || Number(latest.page_shard_count) !== 256) return 'PAGE_CORE_PAGE_SHARD_COUNT_INVALID';
  return null;
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
    const pageShard = await loadPageShard(latest, pageShardIndex(canonical), options);
    const row = pageShard?.[canonical] || null;
    if (!row || row.schema_version !== PAGE_CORE_SCHEMA) {
      return failure('PAGE_CORE_NOT_FOUND', 'Mapped asset has no page-core row', {
        run_id: latest.run_id,
        canonical_id: canonical,
        freshness_status: 'missing',
      });
    }
    const freshness = evaluateFreshness(row.freshness, MAX_STALE_MS.page_core_daily, options.nowMs || Date.now());
    return {
      ok: true,
      httpStatus: 200,
      run_id: latest.run_id,
      snapshot_id: latest.snapshot_id,
      canonical_id: canonical,
      freshness_status: freshness.status,
      pageCore: row,
      latest,
    };
  } catch (error) {
    return failure('PAGE_CORE_UNAVAILABLE', error instanceof Error ? error.message : 'Page-core unavailable', {
      httpStatus: 200,
      freshness_status: 'error',
    });
  }
}
