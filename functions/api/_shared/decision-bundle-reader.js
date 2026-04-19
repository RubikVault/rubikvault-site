import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const CACHE_TTL_MS = 60_000;
const PART_CACHE_TTL_MS = 120_000;
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
let indexCache = null;
const partCache = new Map();

function nowMs() {
  return Date.now();
}

function normalizeCanonical(value) {
  return String(value || '').trim().toUpperCase();
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Prefix(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function syntheticDecision(ticker, reasonCode, details = {}) {
  const symbol = normalizeCanonical(ticker).split(':').pop() || normalizeCanonical(ticker) || null;
  return {
    schema: 'rv.asset_daily_decision.v1',
    schema_version: '1.0',
    run_id: null,
    snapshot_id: null,
    target_market_date: null,
    generated_at: new Date().toISOString(),
    canonical_id: normalizeCanonical(ticker) || symbol,
    symbol,
    asset_class: 'UNKNOWN',
    tradability: false,
    evaluation_role: 'unknown',
    coverage_class: reasonCode === 'asset_missing' ? 'unclassified_missing' : 'unclassified_missing',
    pipeline_status: 'FAILED',
    verdict: 'WAIT_PIPELINE_INCOMPLETE',
    reason_codes: [reasonCode],
    blocking_reasons: [reasonCode],
    warnings: [],
    risk_assessment: {
      level: 'UNKNOWN',
      score: null,
      reasoning: 'Daily decision bundle lookup did not return a valid asset decision.',
    },
    model_coverage: {},
    data_freshness: {},
    input_fingerprints: {},
    lookup_error: details,
  };
}

function readinessFrom(decision, latest, source = 'decision_bundle') {
  const blocking = [
    ...(Array.isArray(latest?.blocking_reasons) ? latest.blocking_reasons : []),
    ...(Array.isArray(decision?.blocking_reasons) ? decision.blocking_reasons : []),
  ].filter(Boolean);
  const warnings = [
    ...(Array.isArray(latest?.warnings) ? latest.warnings : []),
    ...(Array.isArray(decision?.warnings) ? decision.warnings : []),
  ].filter(Boolean);
  const decisionStatus = String(decision?.pipeline_status || '').toUpperCase();
  const bundleStatus = String(latest?.status || '').toUpperCase();
  const status = blocking.length > 0 || decisionStatus === 'FAILED' || bundleStatus === 'FAILED'
    ? 'FAILED'
    : decisionStatus === 'DEGRADED' || bundleStatus === 'DEGRADED' || warnings.length > 0
      ? 'DEGRADED'
      : 'OK';
  return {
    status,
    source,
    decision_bundle_status: bundleStatus || null,
    snapshot_id: latest?.snapshot_id || null,
    target_market_date: latest?.target_market_date || decision?.target_market_date || null,
    blocking_reasons: [...new Set(blocking)],
    warnings: [...new Set(warnings)],
  };
}

function localPathFor(publicPath, rootDir = LOCAL_ROOT) {
  const clean = String(publicPath || '').split('?')[0];
  if (!clean.startsWith('/data/')) return null;
  return path.join(rootDir, 'public', clean.slice(1));
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

async function readLocalAsset(publicPath, rootDir) {
  const filePath = localPathFor(publicPath, rootDir);
  if (!filePath) return null;
  const buffer = await fs.readFile(filePath);
  if (filePath.endsWith('.gz')) return gunzipSync(buffer).toString('utf8');
  return buffer.toString('utf8');
}

async function fetchAssetText(publicPath, { request, env, fetchImpl = fetch, rootDir = null } = {}) {
  const localRoot = rootDir || resolveRootDir({ request, rootDir });
  if (localRoot) return readLocalAsset(publicPath, localRoot);
  const origin = request?.url ? new URL(request.url).origin : 'http://localhost';
  const url = new URL(publicPath, origin);
  const assetFetcher = env?.ASSETS || null;
  const response = assetFetcher && publicPath.startsWith('/data/')
    ? await assetFetcher.fetch(url.toString())
    : await fetchImpl(url.toString(), { cache: 'no-store' });
  if (!response?.ok) throw new Error(`DECISION_BUNDLE_FETCH_FAILED:${publicPath}:${response?.status || 'unknown'}`);
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

function cacheGet(cache, ttlMs) {
  if (!cache || (nowMs() - cache.at) > ttlMs) return null;
  return cache.value;
}

function resolvePartPath(latest, part) {
  const base = String(latest?.snapshot_path || '').replace(/\/+$/, '');
  return `${base}/${part}`;
}

function validateLatest(latest, now = new Date()) {
  if (!latest || latest.schema !== 'rv.decision_bundle_latest.v1') return 'bundle_missing';
  if (latest.valid_until && Date.parse(latest.valid_until) < now.getTime()) return 'bundle_stale';
  if (!latest.index_path) return 'index_missing';
  return null;
}

async function loadLatest(options) {
  const cached = cacheGet(latestCache, CACHE_TTL_MS);
  if (cached) return cached;
  const latest = await fetchAssetJson('/data/decisions/latest.json', options);
  latestCache = { at: nowMs(), value: latest };
  return latest;
}

async function loadIndex(latest, options) {
  const cacheKey = latest?.index_path || null;
  const cached = cacheGet(indexCache, CACHE_TTL_MS);
  if (cached && cached.cacheKey === cacheKey) return cached.index;
  const index = await fetchAssetJson(latest.index_path, options);
  indexCache = { at: nowMs(), value: { cacheKey, index } };
  return index;
}

async function loadPartRows(latest, part, options) {
  const partPath = resolvePartPath(latest, part);
  const cached = partCache.get(partPath);
  if (cached && (nowMs() - cached.at) <= PART_CACHE_TTL_MS) return cached.rows;
  const text = await fetchAssetText(partPath, options);
  const rows = text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
  partCache.set(partPath, { at: nowMs(), rows });
  if (partCache.size > 16) {
    const firstKey = partCache.keys().next().value;
    partCache.delete(firstKey);
  }
  return rows;
}

function resolveIndexEntry(index, tickerOrCanonical) {
  const key = normalizeCanonical(tickerOrCanonical);
  if (index?.assets?.[key]) return { canonicalId: key, entry: index.assets[key] };
  const symbol = key.includes(':') ? key.split(':').pop() : key;
  const candidates = Array.isArray(index?.symbols?.[symbol]) ? index.symbols[symbol] : [];
  for (const canonicalId of candidates) {
    if (index.assets?.[canonicalId]) return { canonicalId, entry: index.assets[canonicalId] };
  }
  return { canonicalId: key, entry: null };
}

export async function readDecisionForTicker(tickerOrCanonical, options = {}) {
  try {
    const latest = await loadLatest(options);
    const latestError = validateLatest(latest, options.now || new Date());
    if (latestError) {
      const decision = syntheticDecision(tickerOrCanonical, latestError);
      return { ok: false, decision, latest, analysis_readiness: readinessFrom(decision, latest) };
    }
    const index = await loadIndex(latest, options);
    if (!index || index.schema !== 'rv.decision_bundle_index.v1') {
      const decision = syntheticDecision(tickerOrCanonical, 'index_missing');
      return { ok: false, decision, latest, analysis_readiness: readinessFrom(decision, latest) };
    }
    const { canonicalId, entry } = resolveIndexEntry(index, tickerOrCanonical);
    if (!entry) {
      const decision = syntheticDecision(tickerOrCanonical, 'asset_missing');
      return { ok: false, decision, latest, analysis_readiness: readinessFrom(decision, latest) };
    }
    const rows = await loadPartRows(latest, entry.part, options);
    const decision = rows.find((row) => normalizeCanonical(row?.canonical_id) === canonicalId) || null;
    if (!decision) {
      const synthetic = syntheticDecision(tickerOrCanonical, 'asset_missing', { canonical_id: canonicalId, part: entry.part });
      return { ok: false, decision: synthetic, latest, analysis_readiness: readinessFrom(synthetic, latest) };
    }
    const hash = sha256Prefix(stableStringify(decision));
    if (entry.decision_hash && hash !== entry.decision_hash) {
      const synthetic = syntheticDecision(tickerOrCanonical, 'bundle_hash_mismatch', { expected: entry.decision_hash, actual: hash });
      return { ok: false, decision: synthetic, latest, analysis_readiness: readinessFrom(synthetic, latest) };
    }
    return { ok: true, decision, latest, analysis_readiness: readinessFrom(decision, latest) };
  } catch (error) {
    const reason = /part-\d+\.ndjson\.gz/.test(String(error?.message || '')) ? 'part_missing' : 'bundle_missing';
    const decision = syntheticDecision(tickerOrCanonical, reason, { message: error?.message || String(error) });
    return { ok: false, decision, latest: null, analysis_readiness: readinessFrom(decision, null) };
  }
}

export function clearDecisionBundleReaderCache() {
  latestCache = null;
  indexCache = null;
  partCache.clear();
}
