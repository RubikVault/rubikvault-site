#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const CONFIG_PATH = path.join(ROOT, 'public/data/universe/v7/config/index-core.v1.json');
const PUBLIC_SSOT_DIR = path.join(ROOT, 'public/data/universe/v7/ssot');
const MIRROR_SSOT_DIR = path.join(ROOT, 'mirrors/universe-v7/ssot');
const CACHE_DIR = path.join(ROOT, 'mirrors/universe-v7/index-core-cache');
const SNAPSHOT_DIR = path.join(ROOT, 'mirrors/universe-v7/index-core-snapshots');
const BACKUP_DIR = path.join(ROOT, 'mirrors/universe-v7/scope-backups');
const DRY_RUN_DIR = path.join(ROOT, 'mirrors/universe-v7/dry-run/index-core');
const MEMBERSHIP_DIR = path.join(ROOT, 'public/data/universe/v7/index-memberships');
const REPORT_DIR = path.join(ROOT, 'public/data/universe/v7/reports');
const FIXTURE_DIR = path.join(ROOT, 'tests/fixtures/index-core');
const MAX_SNAPSHOT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const LIVE_MIN_RATIO = 0.8;

function argValue(argv, name, fallback = '') {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || fallback : fallback;
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run'),
    noLive: argv.includes('--no-live') || process.env.RV_INDEX_CORE_NO_LIVE === '1',
    envFile: argValue(argv, '--env-file', process.env.RV_EODHD_ENV_FILE || '.env.local'),
    argv,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeStamp(iso = nowIso()) {
  return iso.replace(/[:.]/g, '-');
}

function readEnvFile(filePath) {
  const out = {};
  if (!filePath || !fsSync.existsSync(filePath)) return out;
  for (const raw of fsSync.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function resolveToken(envFile) {
  const envValues = readEnvFile(path.isAbsolute(envFile) ? envFile : path.join(ROOT, envFile));
  return process.env.EODHD_API_TOKEN
    || process.env.EODHD_API_KEY
    || envValues.EODHD_API_TOKEN
    || envValues.EODHD_API_KEY
    || '';
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonMaybe(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, doc) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function readRegistryRows() {
  const text = zlib.gunzipSync(fsSync.readFileSync(REGISTRY_PATH)).toString('utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function registryEntry(row) {
  const recentCloses = Array.isArray(row._tmp_recent_closes) ? row._tmp_recent_closes : [];
  const recentClose = toNum(
    row.last_close
    || row.close
    || row.adjusted_close
    || row.price
    || recentCloses[recentCloses.length - 1],
  );
  return {
    canonical_id: normalize(row.canonical_id),
    symbol: normalize(row.symbol),
    provider_symbol: row.provider_symbol || null,
    name: row.name || null,
    type_norm: normalize(row.type_norm),
    exchange: normalize(row.exchange) || null,
    mic: row.mic || null,
    country: row.country || null,
    currency: row.currency || null,
    isin: row.isin || row.identifiers?.isin || null,
    bars_count: toNum(row.bars_count),
    avg_volume_30d: toNum(row.avg_volume_30d),
    recent_close: recentClose,
    market_cap: toNum(row.market_cap || row.marketCapitalization || row.fundamentals?.market_cap),
    score_0_100: toNum(row?.computed?.score_0_100 || row.score_0_100),
    last_trade_date: row.last_trade_date || null,
    history_pack: row?.pointers?.history_pack || row?.history_pack || null,
  };
}

function buildRegistryIndex(rows) {
  const byCanonical = new Map();
  const bySymbolExchange = new Map();
  const bySymbol = new Map();
  for (const raw of rows) {
    const row = registryEntry(raw);
    if (!row.canonical_id || !row.symbol) continue;
    byCanonical.set(row.canonical_id, row);
    if (row.exchange) bySymbolExchange.set(`${row.symbol}|${row.exchange}`, row);
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }
  return { byCanonical, bySymbolExchange, bySymbol };
}

function symbolVariants(rawSymbol, region) {
  const symbol = normalize(rawSymbol)
    .replace(/\s+/g, '')
    .replace(/\.(US|INDX)$/i, '');
  if (!symbol) return [];
  const variants = new Set([symbol]);
  if (symbol.includes('.')) variants.add(symbol.split('.')[0]);
  const regionSuffix = {
    US: 'US',
    UK: 'LSE',
    DE: 'XETR',
    FR: 'PA',
    EU: '',
    CH: 'SW',
    ES: 'MC',
    JP: 'TYO',
    HK: 'HK',
    CN: 'SHE',
    AU: 'AU',
    IN: 'NSE',
    KR: 'KO',
  }[region] || '';
  if (regionSuffix) {
    variants.add(`${symbol}.${regionSuffix}`);
    variants.add(`${symbol}-${regionSuffix}`);
  }
  return [...variants].filter(Boolean);
}

function regionRank(row, region) {
  const expectedRegion = normalize(region);
  const ex = normalize(row.exchange);
  const cidEx = normalize(row.canonical_id.split(':')[0]);
  const country = normalize(row.country);
  const anyEx = new Set([ex, cidEx].filter(Boolean));
  const hasEx = (...values) => values.some((value) => anyEx.has(value));
  if (expectedRegion === 'US' && hasEx('US')) return 10;
  if (expectedRegion === 'UK' && (hasEx('LSE', 'LON', 'XLON') || country === 'UK' || country === 'UNITED KINGDOM')) return 10;
  if (expectedRegion === 'DE' && (hasEx('XETR', 'XETRA', 'F', 'FWB') || country === 'GERMANY')) return 10;
  if (expectedRegion === 'FR' && (hasEx('PA', 'EPA') || country === 'FRANCE')) return 10;
  if (expectedRegion === 'EU' && ['AUSTRIA', 'BELGIUM', 'DENMARK', 'FINLAND', 'FRANCE', 'GERMANY', 'IRELAND', 'ITALY', 'NETHERLANDS', 'NORWAY', 'PORTUGAL', 'SPAIN', 'SWEDEN'].includes(country)) return 10;
  if (expectedRegion === 'CH' && (hasEx('SW', 'SIX') || country === 'SWITZERLAND')) return 10;
  if (expectedRegion === 'ES' && (hasEx('MC', 'BME') || country === 'SPAIN')) return 10;
  if (expectedRegion === 'JP' && (hasEx('TYO', 'TSE', 'JP') || country === 'JAPAN')) return 10;
  if (expectedRegion === 'HK' && (hasEx('HK', 'HKEX') || country === 'HONG KONG')) return 10;
  if (expectedRegion === 'CN' && (hasEx('SHE', 'SHG', 'SS', 'SZ') || country === 'CHINA')) return 10;
  if (expectedRegion === 'AU' && (hasEx('AU', 'ASX', 'AX') || country === 'AUSTRALIA')) return 10;
  if (expectedRegion === 'IN' && (hasEx('NSE', 'BSE', 'NSEI') || country === 'INDIA')) return 10;
  if (expectedRegion === 'KR' && (hasEx('KO', 'KQ', 'KRX', 'KOSDAQ') || country === 'KOREA' || country === 'SOUTH KOREA')) return 10;
  return 0;
}

function resolveComponent(component, def, registry) {
  const canonicalId = normalize(component.canonical_id || component.canonicalId || component.id || '');
  if (canonicalId) {
    const row = registry.byCanonical.get(canonicalId);
    if (row) return row;
  }
  const rawSymbol = component.symbol || component.Code || component.code || component.ticker || component.Ticker || component.Symbol || component.ExchangeCode || component._component_key || component.Name;
  const exchange = normalize(component.exchange || component.Exchange || component.exchange_code || component.ExchangeCode || '');
  const candidates = [];
  for (const symbol of symbolVariants(rawSymbol, def.region)) {
    if (exchange) candidates.push(registry.bySymbolExchange.get(`${symbol}|${exchange}`));
    const rows = registry.bySymbol.get(symbol) || [];
    candidates.push(...rows);
  }
  const clean = candidates.filter(Boolean);
  if (!clean.length) return null;
  const regionMatches = clean
    .map((row) => ({ row, rank: regionRank(row, def.region) }))
    .filter((item) => item.rank > 0);
  if (!regionMatches.length) return null;
  return regionMatches.sort((a, b) => {
    const rr = b.rank - a.rank;
    if (rr) return rr;
    const bars = toNum(b.row.bars_count) - toNum(a.row.bars_count);
    if (bars) return bars;
    return String(a.row.canonical_id).localeCompare(String(b.row.canonical_id));
  })[0].row;
}

function extractComponents(doc) {
  const candidates = [
    doc?.Components,
    doc?.components,
    doc?.General?.Components,
    doc?.ETF_Data?.Holdings,
    doc?.Holdings,
    doc?.Constituents,
    doc?.constituents,
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      return Object.entries(value).map(([key, item]) => (
        item && typeof item === 'object' && !Array.isArray(item)
          ? { ...item, _component_key: key }
          : { symbol: key, value: item }
      ));
    }
  }
  return [];
}

async function fetchJson(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, status: response.status, json: null, error: response.ok ? 'invalid_json' : `http_${response.status}` };
    }
    return { ok: response.ok, status: response.status, json, error: response.ok ? null : `http_${response.status}` };
  } catch (error) {
    return { ok: false, status: null, json: null, error: error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

async function assertBudget(token) {
  if (!token) return { checked: false, reason: 'missing_token' };
  const probe = await fetchJson(`https://eodhd.com/api/user?api_token=${encodeURIComponent(token)}&fmt=json`, 20000);
  if (!probe.ok) return { checked: false, reason: probe.error || 'provider_health_unavailable', status: probe.status };
  const doc = probe.json || {};
  const apiRequests = Number(doc.apiRequests || 0);
  const dailyRateLimit = Number(doc.dailyRateLimit || 0);
  const extraLimit = Number(doc.extraLimit || 0);
  const usedPct = dailyRateLimit > 0 ? apiRequests / dailyRateLimit : 0;
  if (usedPct >= 0.95) {
    const error = new Error(`eodhd_budget_used_pct_high:${usedPct.toFixed(4)}`);
    error.exitCode = 3;
    throw error;
  }
  return { checked: true, apiRequests, dailyRateLimit, extraLimit, used_pct: Number(usedPct.toFixed(6)) };
}

async function writeLastGoodSnapshot(def, components, generatedAt = nowIso()) {
  const dir = path.join(SNAPSHOT_DIR, def.id);
  await writeJsonAtomic(path.join(dir, 'latest.json'), {
    schema: 'rv.index_core_components_snapshot.v1',
    generated_at: generatedAt,
    index_id: def.id,
    eodhd: def.eodhd,
    source: 'live',
    count: components.length,
    components,
  });
}

async function loadLiveComponents(def, token, options = {}) {
  if (!token) return null;
  const url = `https://eodhd.com/api/fundamentals/${encodeURIComponent(def.eodhd)}?api_token=${encodeURIComponent(token)}&fmt=json`;
  const result = await fetchJson(url, 30000);
  if (!result.ok) return { ok: false, source: 'live', status: result.status, reason: result.error || 'live_fetch_failed', components: [] };
  if (!options.dryRun) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await writeJsonAtomic(path.join(CACHE_DIR, `${def.id}.json`), {
      schema: 'rv.index_core_live_cache.v1',
      generated_at: nowIso(),
      index_id: def.id,
      eodhd: def.eodhd,
      payload: result.json,
    });
  }
  const components = extractComponents(result.json);
  return { ok: true, source: 'live', status: result.status, components };
}

async function loadLatestSnapshot(def) {
  const latestPath = path.join(SNAPSHOT_DIR, def.id, 'latest.json');
  const doc = await readJsonMaybe(latestPath);
  if (!doc) return null;
  const generatedMs = Date.parse(doc.generated_at || doc.as_of || '');
  if (!Number.isFinite(generatedMs) || Date.now() - generatedMs > MAX_SNAPSHOT_AGE_MS) {
    return { ok: false, source: 'snapshot', reason: 'snapshot_stale', components: [] };
  }
  return { ok: true, source: 'snapshot', components: Array.isArray(doc.components) ? doc.components : extractComponents(doc.payload || doc) };
}

async function loadFixture(def) {
  const doc = await readJsonMaybe(path.join(FIXTURE_DIR, `${def.id}.json`));
  if (!doc) return null;
  return { ok: true, source: 'fixture', components: Array.isArray(doc.components) ? doc.components : extractComponents(doc) };
}

const EUROPE_COUNTRIES = new Set([
  'AUSTRIA', 'BELGIUM', 'DENMARK', 'FINLAND', 'FRANCE', 'GERMANY', 'IRELAND', 'ITALY',
  'NETHERLANDS', 'NORWAY', 'PORTUGAL', 'SPAIN', 'SWEDEN', 'SWITZERLAND', 'UK', 'UNITED KINGDOM',
]);
const ASIA_COUNTRIES = new Set([
  'JAPAN', 'CHINA', 'KOREA', 'SOUTH KOREA', 'TAIWAN', 'HONG KONG', 'INDIA', 'THAILAND',
  'INDONESIA', 'MALAYSIA', 'VIETNAM', 'PHILIPPINES', 'SINGAPORE',
]);
const ASIA_EXCHANGES = new Set(['SHE', 'SHG', 'KO', 'KQ', 'TW', 'TWO', 'BK', 'JK', 'KLSE', 'VN', 'PSE', 'TA', 'XNSA', 'XNAI', 'HK', 'TYO', 'TSE']);

function classifyScopeRegion(row) {
  const country = normalize(row.country);
  const exchange = normalize(row.exchange);
  if (country === 'USA' || exchange === 'US') return 'US';
  if (EUROPE_COUNTRIES.has(country)) return 'EU';
  if (ASIA_COUNTRIES.has(country) || ASIA_EXCHANGES.has(exchange)) return 'ASIA';
  if (country === 'AUSTRALIA' || exchange === 'AU') return 'ASIA';
  return null;
}

function registryProxyScore(row) {
  const marketCapScore = Math.log10(Math.max(0, toNum(row.market_cap)) + 1) * 1e12;
  const dollarVolume = toNum(row.avg_volume_30d) * Math.max(0.01, toNum(row.recent_close));
  const dollarVolumeScore = Math.log10(Math.max(0, dollarVolume) + 1) * 1e9;
  return marketCapScore
    + dollarVolumeScore
    + (Math.log10(Math.max(0, toNum(row.avg_volume_30d)) + 1) * 1e6)
    + (toNum(row.score_0_100) * 1e4)
    + toNum(row.bars_count);
}

function rankedStocks(rows) {
  return rows
    .filter((row) => row.type_norm === 'STOCK')
    .filter((row) => toNum(row.bars_count) >= 60)
    .filter((row) => !String(row.symbol || '').startsWith('^'))
    .sort((a, b) => {
      const score = registryProxyScore(b) - registryProxyScore(a);
      if (score) return score;
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    });
}

function regionRows(allRows, region) {
  const wanted = normalize(region);
  return allRows.filter((row) => regionRank(row, wanted) > 0);
}

function registryProxyRowsForIndex(def, registry) {
  const allRows = [...registry.byCanonical.values()];
  const id = normalize(def.id);
  const expectedMin = Math.max(1, toNum(def.expected_min));
  const targetById = {
    SP500: 503,
    NASDAQ100: 100,
    RUSSELL3000: 3000,
    DOWJONES: 30,
    FTSE100: 100,
    DAX40: 40,
    MDAX: 50,
    CAC40: 40,
    STOXX600: 600,
    SMI: 20,
    IBEX35: 35,
    NIKKEI225: 225,
    TOPIX: 1500,
    HSI: 75,
    CSI300: 300,
    ASX200: 200,
    NIFTY50: 50,
    KOSPI200: 200,
    TECDAX: 30,
    SDAX: 70,
  };
  const target = Math.max(expectedMin, targetById[id] || expectedMin);
  const us = () => rankedStocks(regionRows(allRows, 'US'));
  const asia = () => rankedStocks(allRows.filter((row) => ASIA_COUNTRIES.has(normalize(row.country)) || ASIA_EXCHANGES.has(normalize(row.exchange))));
  const selectors = {
    SP500: () => us().slice(0, 503),
    NASDAQ100: () => us().slice(0, 100),
    RUSSELL3000: () => us().slice(0, 3000),
    DOWJONES: () => us().slice(0, 30),
    FTSE100: () => rankedStocks(regionRows(allRows, 'UK')).slice(0, 100),
    DAX40: () => rankedStocks(regionRows(allRows, 'DE')).slice(0, 40),
    MDAX: () => rankedStocks(regionRows(allRows, 'DE')).slice(40, 90),
    CAC40: () => rankedStocks(regionRows(allRows, 'FR')).slice(0, 40),
    STOXX600: () => rankedStocks(allRows.filter((row) => EUROPE_COUNTRIES.has(normalize(row.country)))).slice(0, 600),
    SMI: () => rankedStocks(regionRows(allRows, 'CH')).slice(0, 20),
    IBEX35: () => rankedStocks(regionRows(allRows, 'ES')).slice(0, 35),
    NIKKEI225: () => {
      const japan = rankedStocks(regionRows(allRows, 'JP'));
      return (japan.length >= expectedMin * LIVE_MIN_RATIO ? japan : asia()).slice(0, 225);
    },
    TOPIX: () => {
      const japan = rankedStocks(regionRows(allRows, 'JP'));
      const source = japan.length >= expectedMin * LIVE_MIN_RATIO ? japan : asia().slice(225);
      return source.slice(0, 1500);
    },
    HSI: () => {
      const hongKong = rankedStocks(regionRows(allRows, 'HK'));
      return (hongKong.length >= expectedMin * LIVE_MIN_RATIO ? hongKong : asia()).slice(0, 75);
    },
    CSI300: () => rankedStocks(regionRows(allRows, 'CN')).slice(0, 300),
    ASX200: () => rankedStocks(regionRows(allRows, 'AU')).slice(0, 200),
    NIFTY50: () => rankedStocks(regionRows(allRows, 'IN')).slice(0, 50),
    KOSPI200: () => rankedStocks(regionRows(allRows, 'KR')).slice(0, 200),
    TECDAX: () => rankedStocks(regionRows(allRows, 'DE')).slice(40, 70),
    SDAX: () => rankedStocks(regionRows(allRows, 'DE')).slice(90, 160),
  };
  const rows = (selectors[id]?.() || rankedStocks(regionRows(allRows, def.region)).slice(0, target))
    .slice(0, target);
  if (!rows.length) return null;
  return {
    ok: true,
    source: 'registry_proxy',
    reason: 'provider_index_components_unavailable',
    components: rows.map((row) => ({
      canonical_id: row.canonical_id,
      symbol: row.symbol,
      exchange: row.exchange,
      name: row.name,
    })),
  };
}

async function loadComponents(def, token, options, registry) {
  const expectedMin = toNum(def.expected_min);
  const attempts = [];
  if (!options.noLive) {
    const live = await loadLiveComponents(def, token, options);
    if (live) attempts.push({ source: 'live', ok: live.ok, status: live.status || null, reason: live.reason || null, count: live.components?.length || 0 });
    if (live?.ok && live.components.length >= expectedMin * LIVE_MIN_RATIO) return live;
  }
  const snapshot = await loadLatestSnapshot(def);
  if (snapshot) attempts.push({ source: 'snapshot', ok: snapshot.ok, reason: snapshot.reason || null, count: snapshot.components?.length || 0 });
  if (snapshot?.ok) return snapshot;
  const fixture = await loadFixture(def);
  if (fixture) attempts.push({ source: 'fixture', ok: fixture.ok, count: fixture.components?.length || 0 });
  if (fixture?.ok) return fixture;
  const registryProxy = process.env.RV_INDEX_CORE_ALLOW_REGISTRY_PROXY === '0' ? null : registryProxyRowsForIndex(def, registry);
  if (registryProxy) attempts.push({ source: registryProxy.source, ok: true, reason: registryProxy.reason, count: registryProxy.components.length });
  if (registryProxy?.components?.length >= expectedMin * LIVE_MIN_RATIO) return registryProxy;
  if (def.required) {
    const error = new Error(`required_index_components_unavailable:${def.id}:${JSON.stringify(attempts)}`);
    error.exitCode = 4;
    throw error;
  }
  return { ok: false, source: 'skipped', components: [], reason: 'optional_components_unavailable', attempts };
}

function isBadEtfName(row, excludeKeywords) {
  const text = `${row.name || ''} ${row.symbol || ''}`.toLowerCase();
  return excludeKeywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function configuredRegionalMinimums(value, defaults = {}) {
  const source = value && typeof value === 'object' ? value : defaults;
  const out = {};
  for (const region of ['US', 'EU', 'ASIA']) {
    out[region] = Math.max(0, Number(source?.[region] || 0));
  }
  return out;
}

async function resolveEtfs(config, registry) {
  const fixture = await readJsonMaybe(path.join(FIXTURE_DIR, 'etfs-curated.json'));
  const items = Array.isArray(fixture) ? fixture : (Array.isArray(fixture?.items) ? fixture.items : []);
  const excludeKeywords = config.etfs?.exclude_keywords || [];
  const maxCount = Number(config.etfs?.max_count || 200);
  const regionalMinimums = configuredRegionalMinimums(config.etfs?.regional_minimums, { US: 3, EU: 3, ASIA: 3 });
  const out = [];
  const seen = new Set();
  const seenIsin = new Set();
  const addEtf = (row) => {
    if (!row || row.type_norm !== 'ETF') return false;
    if (isBadEtfName(row, excludeKeywords)) return false;
    if (row.isin && seenIsin.has(row.isin)) return false;
    if (seen.has(row.canonical_id)) return false;
    seen.add(row.canonical_id);
    if (row.isin) seenIsin.add(row.isin);
    out.push({ ...row, index_memberships: ['curated_etf'], scope_region: classifyScopeRegion(row) || 'GLOBAL_ETF' });
    return true;
  };
  const regionalCount = (region) => out.filter((row) => row.scope_region === region).length;
  for (const item of items) {
    let row = item.canonical_id ? registry.byCanonical.get(normalize(item.canonical_id)) : null;
    if (!row && item.symbol && item.exchange) row = registry.bySymbolExchange.get(`${normalize(item.symbol)}|${normalize(item.exchange)}`);
    if (!row && item.symbol) row = (registry.bySymbol.get(normalize(item.symbol)) || []).find((candidate) => candidate.type_norm === 'ETF') || null;
    addEtf(row);
  }
  const candidates = [...registry.byCanonical.values()]
    .filter((row) => row.type_norm === 'ETF')
    .filter((row) => toNum(row.bars_count) >= 60)
    .filter((row) => classifyScopeRegion(row))
    .filter((row) => !isBadEtfName(row, excludeKeywords))
    .sort((a, b) => {
      const score = registryProxyScore(b) - registryProxyScore(a);
      if (score) return score;
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    });
  for (const [region, minimum] of Object.entries(regionalMinimums)) {
    for (const row of candidates) {
      if (out.length >= maxCount || regionalCount(region) >= minimum) break;
      if (classifyScopeRegion(row) !== region) continue;
      addEtf(row);
    }
  }
  if (out.length < maxCount) {
    for (const row of candidates) {
      addEtf(row);
      if (out.length >= maxCount) break;
    }
  }
  return out;
}

async function resolveIndexAssets(config, registry) {
  const maxCount = Math.max(0, Number(config.index_assets?.max_count || 50));
  if (maxCount <= 0) return [];
  const regionalMinimums = configuredRegionalMinimums(config.index_assets?.regional_minimums, { US: 2, EU: 2, ASIA: 2 });
  const out = [];
  const seen = new Set();
  const candidates = [...registry.byCanonical.values()]
    .filter((row) => row.type_norm === 'INDEX')
    .sort((a, b) => {
      const score = registryProxyScore(b) - registryProxyScore(a);
      if (score) return score;
      const regionA = classifyScopeRegion(a) || '';
      const regionB = classifyScopeRegion(b) || '';
      if (regionA !== regionB) return regionA.localeCompare(regionB);
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    });
  const addIndex = (row) => {
    if (!row || seen.has(row.canonical_id) || out.length >= maxCount) return false;
    seen.add(row.canonical_id);
    out.push({
      ...row,
      index_memberships: ['registry_index_asset'],
      scope_region: classifyScopeRegion(row) || 'GLOBAL_INDEX',
    });
    return true;
  };
  const regionalCount = (region) => out.filter((row) => row.scope_region === region).length;
  for (const [region, minimum] of Object.entries(regionalMinimums)) {
    for (const row of candidates) {
      if (regionalCount(region) >= minimum || out.length >= maxCount) break;
      if (classifyScopeRegion(row) !== region) continue;
      addIndex(row);
    }
  }
  for (const row of candidates) {
    addIndex(row);
    if (out.length >= maxCount) break;
  }
  return out;
}

async function backupOutputs(generatedAt) {
  const dir = path.join(BACKUP_DIR, safeStamp(generatedAt));
  await fs.mkdir(dir, { recursive: true });
  const files = [
    path.join(PUBLIC_SSOT_DIR, 'assets.global.symbols.json'),
    path.join(PUBLIC_SSOT_DIR, 'assets.global.canonical.ids.json'),
    path.join(PUBLIC_SSOT_DIR, 'assets.global.scope.json'),
    path.join(MIRROR_SSOT_DIR, 'assets.global.rows.json'),
  ];
  for (const file of files) {
    if (!fsSync.existsSync(file)) continue;
    await fs.copyFile(file, path.join(dir, path.basename(file)));
  }
  return dir;
}

function countsForRows(rows, symbols) {
  const byType = {};
  const byRegion = {};
  const byRegionType = {};
  for (const row of rows) {
    const type = row.type_norm || 'UNKNOWN';
    const region = row.scope_region || 'UNKNOWN';
    byType[type] = (byType[type] || 0) + 1;
    byRegion[region] = (byRegion[region] || 0) + 1;
    byRegionType[region] ||= {};
    byRegionType[region][type] = (byRegionType[region][type] || 0) + 1;
  }
  return {
    total_assets: rows.length,
    total_symbols: symbols.length,
    duplicate_symbol_count: Math.max(0, rows.length - symbols.length),
    by_region: byRegion,
    by_type: byType,
    by_region_type: byRegionType,
  };
}

async function writeOutputs({ rows, memberships, report, generatedAt, dryRun }) {
  const scope = 'index_core';
  const symbols = [...new Set(rows.map((row) => row.symbol))].sort();
  const canonicalIds = rows.map((row) => row.canonical_id);
  const counts = countsForRows(rows, symbols);
  const rootDir = dryRun ? path.join(DRY_RUN_DIR, safeStamp(generatedAt)) : ROOT;
  const publicDir = dryRun ? path.join(rootDir, 'public/data/universe/v7/ssot') : PUBLIC_SSOT_DIR;
  const mirrorDir = dryRun ? path.join(rootDir, 'mirrors/universe-v7/ssot') : MIRROR_SSOT_DIR;
  const membershipDir = dryRun ? path.join(rootDir, 'public/data/universe/v7/index-memberships') : MEMBERSHIP_DIR;
  const reportDir = dryRun ? path.join(rootDir, 'public/data/universe/v7/reports') : REPORT_DIR;
  const source = 'public/data/universe/v7/config/index-core.v1.json';

  if (!dryRun) await backupOutputs(generatedAt);

  await writeJsonAtomic(path.join(publicDir, 'assets.global.symbols.json'), {
    schema: 'rv_v7_scope_symbols_v1',
    generated_at: generatedAt,
    scope,
    scope_mode: scope,
    source,
    count: symbols.length,
    counts,
    symbols,
  });
  await writeJsonAtomic(path.join(publicDir, 'assets.global.canonical.ids.json'), {
    schema: 'rv_v7_scope_canonical_ids_v1',
    generated_at: generatedAt,
    scope,
    scope_mode: scope,
    source,
    count: canonicalIds.length,
    counts,
    canonical_ids: canonicalIds,
  });
  await writeJsonAtomic(path.join(publicDir, 'assets.global.scope.json'), {
    schema: 'rv_v7_scope_manifest_v1',
    generated_at: generatedAt,
    scope,
    scope_mode: scope,
    source,
    counts,
    policy: {
      index_core_config: source,
      compatibility_outputs: true,
      rollback: 'set RV_UNIVERSE_SCOPE_MODE=global_registry',
    },
  });
  await writeJsonAtomic(path.join(mirrorDir, 'assets.global.rows.json'), {
    schema: 'rv_v7_scope_rows_v1',
    generated_at: generatedAt,
    scope,
    scope_mode: scope,
    count: rows.length,
    counts,
    items: rows,
  });
  await writeJsonAtomic(path.join(publicDir, 'assets.index_core.canonical.ids.json'), {
    schema: 'rv_v7_scope_canonical_ids_v1',
    generated_at: generatedAt,
    scope,
    scope_mode: scope,
    source,
    count: canonicalIds.length,
    counts,
    canonical_ids: canonicalIds,
  });

  for (const doc of memberships) {
    await writeJsonAtomic(path.join(membershipDir, `${doc.index_id}.json`), doc);
  }
  await writeJsonAtomic(path.join(membershipDir, 'manifest.json'), {
    schema: 'rv.index_memberships_manifest.v1',
    generated_at: generatedAt,
    scope_mode: scope,
    count: memberships.length,
    indexes: memberships.map((doc) => ({
      index_id: doc.index_id,
      label: doc.label,
      count: doc.count,
      unmatched_count: doc.unmatched_count,
      path: `/data/universe/v7/index-memberships/${doc.index_id}.json`,
      source_kind: doc.source_kind,
      source_url: doc.source_url,
    })),
  });
  await writeJsonAtomic(path.join(reportDir, 'index_core_scope_report.json'), { ...report, counts, dry_run: dryRun });
  return { out_root: dryRun ? path.relative(ROOT, rootDir) : '.', counts };
}

function membershipLabel(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function build(options) {
  const generatedAt = nowIso();
  const config = await readJson(CONFIG_PATH);
  const registry = buildRegistryIndex(readRegistryRows());
  const token = resolveToken(options.envFile);
  const budget = options.noLive ? { checked: false, reason: 'no_live' } : await assertBudget(token);
  const maxProviderCalls = Math.max(1, Number(process.env.RV_INDEX_CORE_MAX_PROVIDER_CALLS || 1500));
  const allIndexDefs = [...(config.indices || [])];
  if (process.env.RV_INDEX_CORE_INCLUDE_EXTENDED === '1') {
    allIndexDefs.push(...(config.extended_when_RV_INDEX_CORE_INCLUDE_EXTENDED?.indexes || []).map((row) => ({ ...row, required: false, expected_min: 0 })));
  }
  if (!options.noLive && allIndexDefs.length > maxProviderCalls) {
    const error = new Error(`index_core_provider_call_budget_exceeded:${allIndexDefs.length}>${maxProviderCalls}`);
    error.exitCode = 3;
    throw error;
  }

  const byCanonical = new Map();
  const memberships = [];
  const perIndex = [];
  let eodhdCalls = 0;
  const warnings = [];

  for (const def of allIndexDefs) {
    const loaded = await loadComponents(def, token, options, registry);
    if (loaded.source === 'live') eodhdCalls += 1;
    if (loaded.source === 'live' && !options.dryRun) {
      await writeLastGoodSnapshot(def, loaded.components || [], generatedAt);
    }
    const constituents = [];
    const unmatched = [];
    for (const component of loaded.components || []) {
      const resolved = resolveComponent(component, def, registry);
      const ticker = normalize(component.symbol || component.Code || component.code || component.ticker || component.Ticker || component.Symbol);
      if (!resolved) {
        if (ticker && unmatched.length < 200) unmatched.push(ticker);
        continue;
      }
      constituents.push({
        ticker: resolved.symbol,
        name: resolved.name || ticker,
        canonical_id: resolved.canonical_id,
        type_norm: resolved.type_norm,
      });
      if (!byCanonical.has(resolved.canonical_id)) {
        byCanonical.set(resolved.canonical_id, { ...resolved, index_memberships: [def.id], scope_region: classifyScopeRegion(resolved) || def.region });
      } else {
        byCanonical.get(resolved.canonical_id).index_memberships.push(def.id);
      }
    }
    const uniqueConstituents = [...new Map(constituents.map((row) => [row.canonical_id, row])).values()]
      .sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));
    const expectedMin = toNum(def.expected_min);
    const requiredFloor = expectedMin * LIVE_MIN_RATIO;
    if (def.required && uniqueConstituents.length < requiredFloor && loaded.source !== 'fixture') {
      const error = new Error(`required_index_resolved_below_floor:${def.id}:${uniqueConstituents.length}<${requiredFloor}`);
      error.exitCode = 4;
      throw error;
    }
    if (uniqueConstituents.length < requiredFloor) {
      warnings.push({ id: 'index_below_floor', index_id: def.id, count: uniqueConstituents.length, floor: requiredFloor, source: loaded.source });
    }
    const membership = {
      schema: 'rv.index_membership.v1',
      generated_at: generatedAt,
      index_id: def.id,
      label: membershipLabel(def.id),
      source_kind: `eodhd_fundamentals_${loaded.source}`,
      source_url: `https://eodhd.com/financial-apis/fundamental-data-api/`,
      source_input_path: def.eodhd,
      expected_min: expectedMin,
      count: uniqueConstituents.length,
      unmatched_count: unmatched.length,
      unmatched: unmatched.slice(0, 200),
      constituents: uniqueConstituents,
    };
    memberships.push(membership);
    perIndex.push({
      id: def.id,
      eodhd: def.eodhd,
      required: Boolean(def.required),
      expected_min: expectedMin,
      source: loaded.source,
      components_count: loaded.components?.length || 0,
      resolved_count: uniqueConstituents.length,
      unmatched_count: unmatched.length,
      fallback_used: loaded.source !== 'live',
      reason: loaded.reason || null,
    });
  }

  const etfRows = await resolveEtfs(config, registry);
  for (const row of etfRows) {
    if (!byCanonical.has(row.canonical_id)) byCanonical.set(row.canonical_id, row);
  }
  const indexAssetRows = await resolveIndexAssets(config, registry);
  for (const row of indexAssetRows) {
    if (!byCanonical.has(row.canonical_id)) {
      byCanonical.set(row.canonical_id, row);
    } else {
      byCanonical.get(row.canonical_id).index_memberships.push('registry_index_asset');
    }
  }

  const rows = [...byCanonical.values()]
    .map((row) => ({
      ...row,
      index_memberships: [...new Set(row.index_memberships || [])].sort(),
    }))
    .sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));
  const report = {
    schema: 'rv.index_core_scope_report.v1',
    generated_at: generatedAt,
    scope_mode: 'index_core',
    status: warnings.length ? 'WARN' : 'PASS',
    provider_budget: budget,
    eodhd_calls: eodhdCalls,
    etf_count: etfRows.length,
    index_asset_count: indexAssetRows.length,
    index_count: memberships.length,
    per_index: perIndex,
    warnings,
    validation: {
      expected_asset_count_min: 4500,
      expected_asset_count_max: 9500,
      asset_count_in_expected_range: rows.length >= 4500 && rows.length <= 9500,
    },
  };
  return writeOutputs({ rows, memberships, report, generatedAt, dryRun: options.dryRun });
}

function lockFilePath() {
  return process.env.RV_EODHD_LOCK_FILE
    || process.env.RV_EODHD_GLOBAL_LOCK_PATH
    || (process.env.NAS_LOCK_ROOT ? path.join(process.env.NAS_LOCK_ROOT, 'eodhd.lock') : '');
}

function runWithFlockIfNeeded(argv) {
  const lockFile = lockFilePath();
  if (!lockFile || process.env.RV_INDEX_CORE_FLOCK_HELD === '1') return false;
  const scriptPath = path.join(ROOT, 'scripts/universe-v7/build-index-core-scope.mjs');
  const env = { ...process.env, RV_INDEX_CORE_FLOCK_HELD: '1' };
  const run = spawnSync('flock', ['-n', lockFile, process.execPath, scriptPath, ...argv], {
    cwd: ROOT,
    stdio: 'inherit',
    env,
  });
  if (run.error && run.error.code === 'ENOENT') return false;
  process.exit(run.status ?? 3);
}

export async function main({ argv = process.argv.slice(2) } = {}) {
  runWithFlockIfNeeded(argv);
  const options = parseArgs(argv);
  try {
    const result = await build(options);
    process.stdout.write(`${JSON.stringify({ ok: true, scope_mode: 'index_core', ...result }, null, 2)}\n`);
    return result;
  } catch (error) {
    process.stderr.write(`[build-index-core-scope] ${error?.stack || error?.message || String(error)}\n`);
    process.exitCode = error?.exitCode || 1;
    return null;
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  await main();
}
