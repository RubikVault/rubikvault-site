#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

import { buildEnvelope, validateEnvelopeSchema } from '../lib/envelope.js';
import { computeSnapshotDigest } from '../lib/digest.js';
import { buildModuleState } from '../lib/module-state.js';
import { computeValidationMetadata } from '../lib/drop-threshold.js';
import { fetchWithRetry } from '../providers/_shared.js';
import { sleep } from '../utils/mirror-io.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = process.cwd();

const MODULE_NAME = 'market-prices';
const DEFAULT_OUT_DIR = join(BASE_DIR, 'tmp/phase1-artifacts/market-prices');

function toBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

const CLASSIFICATIONS = {
  OK: 'OK',
  RATE_LIMIT_NOTE: 'RATE_LIMIT_NOTE',
  UPSTREAM_INFORMATION: 'UPSTREAM_INFORMATION',
  UPSTREAM_ERROR_MESSAGE: 'UPSTREAM_ERROR_MESSAGE',
  HTTP_429: 'HTTP_429',
  NETWORK_ERROR: 'NETWORK_ERROR',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE'
};

function isCooldownClassification(classification) {
  return (
    classification === CLASSIFICATIONS.RATE_LIMIT_NOTE ||
    classification === CLASSIFICATIONS.HTTP_429 ||
    classification === CLASSIFICATIONS.UPSTREAM_INFORMATION ||
    classification === CLASSIFICATIONS.UPSTREAM_ERROR_MESSAGE
  );
}

function truncateNote(value, maxLen = 180) {
  const note = String(value || '').trim();
  if (note.length <= maxLen) return note;
  return note.slice(0, maxLen);
}

function stableNumberFromString(input, label) {
  const h = crypto.createHash('sha256').update(`${label}:${input}`, 'utf8').digest('hex');
  const slice = h.slice(0, 12);
  return parseInt(slice, 16);
}

function formatDateYYYYMMDD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayUTCString() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDateYYYYMMDD(d);
}

function makeStubBar(symbol) {
  const date = getYesterdayUTCString();

  const baseInt = stableNumberFromString(symbol, 'base');
  const driftInt = stableNumberFromString(symbol, 'drift');
  const volInt = stableNumberFromString(symbol, 'vol');

  const base = 100 + (baseInt % 300) * 0.1;
  const drift = ((driftInt % 200) - 100) * 0.001;
  const close = Number((base * (1 + drift)).toFixed(4));
  const open = Number((close * (1 - ((volInt % 50) * 0.0002))).toFixed(4));
  const high = Number((Math.max(open, close) * (1 + ((volInt % 25) * 0.0004))).toFixed(4));
  const low = Number((Math.min(open, close) * (1 - ((volInt % 25) * 0.0004))).toFixed(4));

  const volume = Math.floor(1_000_000 + (volInt % 9_000_000));

  return {
    symbol,
    date,
    open,
    high,
    low,
    close,
    volume,
    adj_close: null,
    currency: 'USD',
    source_provider: 'stub',
    ingested_at: null
  };
}

const STOOQ_BASE_URL = 'https://stooq.pl/q/d/l/';
const STOOQ_SYMBOL_MAP = {
  SPY: 'spy.us',
  QQQ: 'qqq.us',
  DIA: 'dia.us',
  IWM: 'iwm.us'
};

function parseStooqLatestRow(text) {
  if (!text || typeof text !== 'string') return null;
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rows.length <= 1) return null;
  const lastLine = rows[rows.length - 1];
  return lastLine.split(',');
}

function toNumber(value) {
  if (value === null || value === undefined) return NaN;
  const sanitized = String(value).replace(/,/g, '');
  return Number(sanitized);
}

function buildStooqBar(symbol, row) {
  if (!Array.isArray(row) || row.length < 7) {
    throw new Error(`STOOQ_ROW_INVALID:${symbol}`);
  }
  const [date, openStr, highStr, lowStr, closeStr, , volumeStr] = row;
  const open = toNumber(openStr);
  const high = toNumber(highStr);
  const low = toNumber(lowStr);
  const close = toNumber(closeStr);
  const volume = toNumber(volumeStr);
  if ([open, high, low, close].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(`STOOQ_PRICE_MALFORMED:${symbol}`);
  }
  return {
    symbol,
    date,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? Math.max(0, volume) : 0,
    adj_close: null,
    currency: 'USD',
    source_provider: 'stooq',
    ingested_at: new Date().toISOString()
  };
}

async function fetchStooqBars(symbols, outDir) {
  const stooqCacheDir = join(outDir, 'stooq-cache');
  await mkdir(stooqCacheDir, { recursive: true });
  const bars = [];
  const upstreams = [];
  const attempts = {};
  const sources = {};

  for (const symbol of symbols) {
    const symbolKey = STOOQ_SYMBOL_MAP[symbol];
    if (!symbolKey) {
      throw new Error(`STOOQ_SYMBOL_MAPPING_MISSING:${symbol}`);
    }
    const url = `${STOOQ_BASE_URL}?s=${symbolKey}&i=d`;
    const result = await fetchWithRetry(
      url,
      {
        headers: { 'User-Agent': 'RubikVault/3.0 market-prices' },
        timeoutMs: 20000
      },
      {
        maxRetries: 2,
        baseDelayMs: 1500,
        sleep
      }
    );

    if (!result.ok) {
      throw new Error(`STOOQ_FETCH_FAILED:${symbol}:${result.upstream?.http_status ?? 'unknown'}`);
    }

    const csvPath = join(stooqCacheDir, `${symbol}.csv`);
    await writeFile(csvPath, result.text, 'utf-8');
    const row = parseStooqLatestRow(result.text);
    if (!row) {
      throw new Error(`STOOQ_NO_DATA:${symbol}`);
    }
    const bar = buildStooqBar(symbol, row);
    bars.push(bar);
    const upstreamEntry = {
      symbol,
      http_status: result.upstream?.http_status ?? null,
      latency_ms: result.upstream?.latency_ms ?? null,
      rate_limited: Boolean(result.upstream?.rate_limited),
      retry_count: result.upstream?.retry_count ?? 0
    };
    upstreams.push(upstreamEntry);
    attempts[symbol] = [
      {
        provider_id: 'stooq',
        classification: CLASSIFICATIONS.OK,
        http_status: upstreamEntry.http_status,
        note: null,
        ok: true
      }
    ];
    sources[symbol] = 'stooq';
    await sleep(400);
  }

  return {
    bars,
    upstreams,
    warnings: [],
    attempts,
    sources
  };
}

export function classifyAlphaVantagePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.Note) {
    return {
      classification: CLASSIFICATIONS.RATE_LIMIT_NOTE,
      kind: 'Note',
      note: truncateNote(payload.Note)
    };
  }
  if (payload['Error Message']) {
    return {
      classification: CLASSIFICATIONS.UPSTREAM_ERROR_MESSAGE,
      kind: 'Error Message',
      note: truncateNote(payload['Error Message'])
    };
  }
  if (payload.Information) {
    return {
      classification: CLASSIFICATIONS.UPSTREAM_INFORMATION,
      kind: 'Information',
      note: truncateNote(payload.Information)
    };
  }

  return null;
}

function validateBar(bar) {
  const errors = [];

  if (!bar || typeof bar !== 'object') errors.push('BAR_NOT_OBJECT');

  const dateOk = typeof bar.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bar.date);
  if (!dateOk) errors.push('INVALID_DATE');

  const numericFields = ['open', 'high', 'low', 'close'];
  for (const f of numericFields) {
    const v = bar[f];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      errors.push(`INVALID_${f.toUpperCase()}`);
    }
  }

  if (typeof bar.volume !== 'number' || !Number.isFinite(bar.volume) || bar.volume < 0) {
    errors.push('INVALID_VOLUME');
  }

  if (
    typeof bar.high === 'number' &&
    typeof bar.low === 'number' &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    bar.high < bar.low
  ) {
    errors.push('HIGH_LT_LOW');
  }

  return { ok: errors.length === 0, errors };
}

const PROVIDER_HEALTH_PENALTIES = {
  [CLASSIFICATIONS.RATE_LIMIT_NOTE]: 25,
  [CLASSIFICATIONS.HTTP_429]: 20,
  [CLASSIFICATIONS.NETWORK_ERROR]: 15
};

const RUN_QUALITIES = {
  OK: 'OK',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED'
};

function selectDominantFailureReason(failureMap = new Map()) {
  let dominant = null;
  let maxCount = 0;
  for (const [reason, count] of failureMap.entries()) {
    if (count > maxCount || (count === maxCount && reason < dominant)) {
      dominant = reason;
      maxCount = count;
    }
  }
  return dominant;
}

function buildReasonSummary(symbolErrors = {}) {
  const counts = {};
  for (const entry of Object.values(symbolErrors)) {
    const classification = entry?.classification ?? 'UNKNOWN';
    counts[classification] = (counts[classification] || 0) + 1;
  }
  const sortedKeys = Object.keys(counts).sort();
  const summary = {};
  for (const key of sortedKeys) {
    summary[key] = counts[key];
  }
  return summary;
}

function determineRunQuality(coverageRatio, symbolsResolved) {
  if (!symbolsResolved || symbolsResolved === 0) {
    return RUN_QUALITIES.FAILED;
  }
  if (coverageRatio >= 0.95) {
    return RUN_QUALITIES.OK;
  }
  if (coverageRatio >= 0.5) {
    return RUN_QUALITIES.DEGRADED;
  }
  return RUN_QUALITIES.FAILED;
}

function formatRatio(value, decimals = 3) {
  return Number(value.toFixed(decimals));
}

function collectProviderMetrics(providerChain) {
  const metrics = new Map();
  for (const provider of providerChain) {
    metrics.set(provider.id, {
      provider_id: provider.id,
      symbols_attempted: new Set(),
      symbols_success: new Set(),
      failureReasons: new Map()
    });
  }
  return metrics;
}

function buildProviderHealthEntries({
  providerChain,
  symbolAttempts = {},
  symbolSources = {},
  runtimeState = {}
}) {
  const metrics = collectProviderMetrics(providerChain);
  for (const [symbol, attempts] of Object.entries(symbolAttempts)) {
    for (const attempt of attempts || []) {
      const providerId = attempt.provider_id || 'unknown';
      let entry = metrics.get(providerId);
      if (!entry) {
        entry = {
          provider_id: providerId,
          symbols_attempted: new Set(),
          symbols_success: new Set(),
          failureReasons: new Map()
        };
        metrics.set(providerId, entry);
      }
      entry.symbols_attempted.add(symbol);
      if (attempt.ok) {
        entry.symbols_success.add(symbol);
      } else {
        const reason = attempt.classification || CLASSIFICATIONS.NETWORK_ERROR;
        entry.failureReasons.set(reason, (entry.failureReasons.get(reason) || 0) + 1);
      }
    }
  }

  for (const [symbol, providerId] of Object.entries(symbolSources || {})) {
    const entry = metrics.get(providerId);
    if (entry) {
      entry.symbols_success.add(symbol);
    }
  }

  const orderedIds = [...providerChain.map((p) => p.id), ...metrics.keys()].filter(
    (value, index, array) => array.indexOf(value) === index
  );

  const entries = [];
  for (const providerId of orderedIds) {
    const metric = metrics.get(providerId);
    if (!metric) continue;
    const attempted = metric.symbols_attempted.size;
    const success = metric.symbols_success.size;
    const failed = Math.max(0, attempted - success);
    const successRatio = attempted > 0 ? success / attempted : 0;
    const failureReasons = metric.failureReasons;
    const runtimeEntry = runtimeState.providers?.[providerId];
    const cooldownTriggered = isProviderInCooldown(runtimeEntry);
    let score = 100;
    if (cooldownTriggered) score -= 40;
    for (const [reason, penalty] of Object.entries(PROVIDER_HEALTH_PENALTIES)) {
      if (failureReasons.has(reason)) {
        score -= penalty;
      }
    }
    score -= 100 * (1 - successRatio);
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    entries.push({
      provider_id: providerId,
      symbols_attempted: attempted,
      symbols_success: success,
      symbols_failed: failed,
      success_ratio: formatRatio(successRatio),
      cooldown_triggered: Boolean(cooldownTriggered),
      dominant_failure_reason: selectDominantFailureReason(failureReasons) || null,
      run_health_score: normalizedScore
    });
  }

  return entries;
}

function buildHealthArtifacts({
  mode,
  providerChain,
  providerChainSummary,
  symbolAttempts,
  symbolSources,
  symbolErrors,
  symbols,
  validCount,
  runtimeState
}) {
  const totalSymbols = symbols.length;
  if (mode === 'STUB') {
    const entry = {
      provider_id: 'stub',
      symbols_attempted: totalSymbols,
      symbols_success: totalSymbols,
      symbols_failed: 0,
      success_ratio: 1,
      cooldown_triggered: false,
      dominant_failure_reason: null,
      run_health_score: 100
    };
    const providerHealthPayload = {
      module: MODULE_NAME,
      providers: [entry]
    };
    const marketHealthPayload = {
      module: MODULE_NAME,
      total_symbols: totalSymbols,
      symbols_resolved: totalSymbols,
      coverage_ratio: totalSymbols > 0 ? 1 : 0,
      fallback_usage_ratio: 0,
      run_quality: RUN_QUALITIES.OK,
      reason_summary: {}
    };
    return { providerHealthPayload, marketHealthPayload };
  }

  const providerHealthEntries = buildProviderHealthEntries({
    providerChain,
    symbolAttempts,
    symbolSources,
    runtimeState
  });

  const fallbackIds = providerChain.filter((provider) => provider.role === 'fallback').map((provider) => provider.id);
  const fallbackSuccesses = Object.values(symbolSources || {}).filter((id) => fallbackIds.includes(id)).length;
  const coverageRatio = totalSymbols > 0 ? validCount / totalSymbols : 0;
  const fallbackUsageRatio = totalSymbols > 0 ? fallbackSuccesses / totalSymbols : 0;
  const runQuality = determineRunQuality(coverageRatio, validCount);
  const reasonSummary = buildReasonSummary(symbolErrors);

  const providerHealthPayload = {
    module: MODULE_NAME,
    provider_chain: providerChainSummary,
    providers: providerHealthEntries
  };

  const marketHealthPayload = {
    module: MODULE_NAME,
    total_symbols: totalSymbols,
    symbols_resolved: validCount,
    coverage_ratio: formatRatio(Math.min(1, Math.max(0, coverageRatio))),
    fallback_usage_ratio: formatRatio(Math.min(1, Math.max(0, fallbackUsageRatio))),
    run_quality: runQuality,
    reason_summary: reasonSummary
  };

  return { providerHealthPayload, marketHealthPayload };
}


async function loadProviderRuntimeState(outDir) {
  const runtimePath = join(outDir, 'provider-runtime.json');
  try {
    const raw = await readFile(runtimePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function saveProviderRuntimeState(outDir, state) {
  const runtimePath = join(outDir, 'provider-runtime.json');
  await writeFile(runtimePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function computeAsOf(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  const dates = bars.map((bar) => bar?.date).filter((date) => typeof date === 'string' && date.length === 10);
  if (dates.length === 0) return null;
  return dates.sort().slice(-1)[0];
}

async function loadUniverseIndexProxies() {
  const universePath = join(BASE_DIR, 'public/data/registry/universe.v1.json');
  const content = await readFile(universePath, 'utf-8');
  const parsed = JSON.parse(content);
  const symbols = parsed?.groups?.index_proxies?.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('UNIVERSE_INDEX_PROXIES_MISSING');
  }
  return symbols;
}

async function loadModuleConfig() {
  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
  const content = await readFile(registryPath, 'utf-8');
  const registry = JSON.parse(content);
  const config = registry?.modules?.[MODULE_NAME];

  if (!config) {
    return {
      module: MODULE_NAME,
      tier: 'standard',
      domain: 'stocks',
      source: 'stub',
      freshness: {
        expected_interval_minutes: 1440,
        grace_minutes: 180,
        policy: 'market_days_only'
      },
      counts: {
        expected: 1,
        min: 1,
        max: 1
      },
      ui_contract: { policy: 'optional' },
      cache: { kv_enabled: false, preferred_source: 'ASSET' },
      endpoints: {
        api: `/api/${MODULE_NAME}`,
        debug: `/api/${MODULE_NAME}?debug=1`,
        probe: `/api/probe/${MODULE_NAME}`
      }
    };
  }

  return config;
}

async function loadProvidersRegistry() {
  const registryPath = join(BASE_DIR, 'public/data/registry/providers.v1.json');
  const content = await readFile(registryPath, 'utf-8');
  return JSON.parse(content);
}

export function buildProviderChain(registry, chainKey = 'prices_eod') {
  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function resolveChainEntries() {
    if (Array.isArray(registry?.chains)) return registry.chains;
    if (isObject(registry?.chains)) {
      const entry = registry.chains[chainKey];
      if (Array.isArray(entry)) return entry;
    }
    if (Array.isArray(registry?.[chainKey])) return registry[chainKey];
    return [];
  }

  const chainEntries = resolveChainEntries();
  const providers = Array.isArray(registry?.providers) ? registry.providers : [];
  const providerMap = new Map();
  for (const provider of providers) {
    if (provider && typeof provider === 'object' && provider.id) {
      providerMap.set(provider.id, { ...provider });
    }
  }

  const uniqueIds = new Set();
  const enabled = [];
  for (const entry of chainEntries) {
    if (!entry?.id || uniqueIds.has(entry.id)) continue;
    const provider = providerMap.get(entry.id);
    if (!provider) continue;
    uniqueIds.add(entry.id);
    const combined = {
      ...provider,
      ...entry,
      role: (provider.role || entry.role || 'primary').toLowerCase(),
      order: typeof entry.order === 'number' ? entry.order : Number.MAX_SAFE_INTEGER
    };
    if (combined.enabled === false || entry.enabled === false) continue;
    enabled.push(combined);
  }

  if (enabled.length === 0) {
    const availableKeys = [];
    if (isObject(registry?.chains)) {
      availableKeys.push(...Object.keys(registry.chains));
    }
    if (Array.isArray(registry?.[chainKey])) {
      availableKeys.push(chainKey);
    }
    throw new Error(
      `PROVIDER_CHAIN_NO_ENABLED_PROVIDERS (chains type=${typeof registry?.chains}, keys=${[
        ...new Set(availableKeys)
      ].join(',')})`
    );
  }

  const primaries = enabled.filter((item) => item.role === 'primary');
  if (primaries.length === 0) {
    throw new Error('REGISTRY_NO_ENABLED_PRIMARY_PROVIDER');
  }

  const fallbacks = enabled.filter((item) => item.role === 'fallback');

  const sortByOrder = (a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  };

  primaries.sort(sortByOrder);
  fallbacks.sort(sortByOrder);

  return [...primaries, ...fallbacks];
}

function describeProviderChain(chain) {
  return chain.map((provider) => ({
    id: provider.id,
    role: provider.role,
    enabled: provider.enabled !== false
  }));
}

function getProviderAuthInfo(provider) {
  const envVar = provider?.auth_env_var;
  if (typeof envVar !== 'string' || !envVar.trim()) {
    throw new Error('PROVIDER_AUTH_ENV_VAR_MISSING (check public/data/registry/providers.v1.json)');
  }
  const raw = process.env[envVar];
  const apiKey = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  return { envVar, apiKey };
}

function ensureProviderRuntimeEntry(runtimeState, providerId) {
  runtimeState.providers = runtimeState.providers || {};
  if (!runtimeState.providers[providerId]) {
    runtimeState.providers[providerId] = {};
  }
  return runtimeState.providers[providerId];
}

function isProviderInCooldown(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object') return false;
  const until = entry.cooldown_until ? Date.parse(entry.cooldown_until) : NaN;
  return !Number.isNaN(until) && until > nowMs;
}

function markProviderCooldown(entry, classification, note, httpStatus, cooldownMinutes) {
  if (!entry || typeof entry !== 'object') return;
  const cooldownMs = Math.max(0, Number(cooldownMinutes) || 0) * 60 * 1000;
  const until = new Date(Date.now() + cooldownMs).toISOString();
  entry.cooldown_until = until;
  entry.cooldown_note = note;
  entry.last_classification = classification;
  entry.last_http_status = httpStatus;
}

export function normalizeAlphaVantageDailyAdjusted(payload, symbol, options = {}) {
  const targetDate = options.targetDate || null;
  const ingestedAt = options.ingestedAt || new Date().toISOString();
  const sourceProvider = options.sourceProvider || 'A';

  const series = payload?.['Time Series (Daily)'];
  if (!series || typeof series !== 'object') {
    return { bar: null, warnings: ['PROVIDER_SCHEMA_MISMATCH'] };
  }

  const dates = Object.keys(series).sort().reverse();
  if (dates.length === 0) {
    return { bar: null, warnings: ['PROVIDER_EMPTY_SERIES'] };
  }

  let selectedDate = dates[0];
  if (targetDate) {
    const match = dates.find((d) => d <= targetDate);
    if (match) selectedDate = match;
  }

  const row = series[selectedDate];
  if (!row || typeof row !== 'object') {
    return { bar: null, warnings: ['PROVIDER_BAR_MISSING'] };
  }

  const open = Number.parseFloat(row['1. open']);
  const high = Number.parseFloat(row['2. high']);
  const low = Number.parseFloat(row['3. low']);
  const close = Number.parseFloat(row['4. close']);
  const adjRaw = row['5. adjusted close'];
  const adjParsed = Number.parseFloat(adjRaw);
  const adjClose = Number.isFinite(adjParsed) && adjParsed > 0 ? adjParsed : null;
  const volumeRaw = row['6. volume'] ?? row['5. volume'];
  const volumeParsed = Number.parseInt(volumeRaw, 10);
  const volume = Number.isFinite(volumeParsed) ? volumeParsed : Number.NaN;

  const warnings = [];
  if (adjClose === null) warnings.push(`MISSING_ADJ:${symbol}`);

  const bar = {
    symbol,
    date: selectedDate,
    open,
    high,
    low,
    close,
    volume,
    adj_close: adjClose,
    currency: 'USD',
    source_provider: sourceProvider,
    ingested_at: ingestedAt
  };

  return { bar, warnings };
}

export function normalizeTwelveDataTimeSeries(payload, symbol, options = {}) {
  const values = Array.isArray(payload?.values) ? [...payload.values] : [];
  if (values.length === 0) {
    return { bar: null, warnings: ['PROVIDER_EMPTY_SERIES'] };
  }
  values.sort((a, b) => {
    const left = String(b?.datetime || b?.timestamp || '');
    const right = String(a?.datetime || a?.timestamp || '');
    return left.localeCompare(right);
  });
  const row = values[0];
  if (!row || typeof row !== 'object') {
    return { bar: null, warnings: ['PROVIDER_BAR_MISSING'] };
  }

  const parseNumber = (value) => {
    const num = Number.parseFloat(value);
    return Number.isFinite(num) ? num : Number.NaN;
  };

  const parseIntValue = (value) => {
    const num = Number.parseInt(value, 10);
    return Number.isFinite(num) ? num : Number.NaN;
  };

  const date = row.datetime || row.date || null;
  const open = parseNumber(row.open);
  const high = parseNumber(row.high);
  const low = parseNumber(row.low);
  const close = parseNumber(row.close);
  const adjRaw = row.adj_close ?? row.adjusted_close ?? null;
  const adjParsed = parseNumber(adjRaw);
  const adjClose = Number.isFinite(adjParsed) && adjParsed > 0 ? adjParsed : null;
  const volume = parseIntValue(row.volume ?? row.vol ?? row['5. volume']);

  const warnings = [];
  if (adjClose === null) warnings.push(`MISSING_ADJ:${symbol}`);

  const bar = {
    symbol,
    date: typeof date === 'string' ? date.split('T')[0] : null,
    open,
    high,
    low,
    close,
    volume,
    adj_close: adjClose,
    currency: 'USD',
    source_provider: options.sourceProvider || 'twelvedata',
    ingested_at: options.ingestedAt || new Date().toISOString()
  };

  return { bar, warnings };
}

function buildMissingBar(symbol, sourceProvider) {
  return {
    symbol,
    date: null,
    open: Number.NaN,
    high: Number.NaN,
    low: Number.NaN,
    close: Number.NaN,
    volume: Number.NaN,
    adj_close: null,
    currency: 'USD',
    source_provider: sourceProvider,
    ingested_at: new Date().toISOString()
  };
}

async function fetchAlphaVantageBar(symbol, providerConfig, { apiKey, targetDate }) {
  if (providerConfig?.kind !== 'alpha_vantage_eod') {
    throw new Error('PROVIDER_KIND_UNSUPPORTED');
  }

  const params = new URLSearchParams({
    function: 'TIME_SERIES_DAILY_ADJUSTED',
    symbol,
    outputsize: 'compact',
    apikey: apiKey
  });

  const url = `${providerConfig.base_url}?${params.toString()}`;
  const timeoutMs = Number.isFinite(Number(providerConfig.timeout_ms)) ? Number(providerConfig.timeout_ms) : 10000;

  const result = await fetchWithRetry(url, {
    headers: {
      'user-agent': 'RubikVault/3.0 (market-prices)',
      'accept': 'application/json'
    },
    timeoutMs
  });

  const upstream = result.upstream || {
    http_status: null,
    latency_ms: 0,
    retry_count: 0,
    rate_limited: false
  };

  if (!result.ok) {
    const classification =
      upstream.http_status === 429 ? CLASSIFICATIONS.HTTP_429 : CLASSIFICATIONS.NETWORK_ERROR;
    return {
      ok: false,
      classification,
      note: truncateNote(result.text),
      http_status: upstream.http_status,
      upstream
    };
  }

  let payload;
  try {
    payload = JSON.parse(result.text || '{}');
  } catch (error) {
    return {
      ok: false,
      classification: CLASSIFICATIONS.NETWORK_ERROR,
      note: 'failed_json_parse',
      http_status: upstream.http_status,
      upstream
    };
  }

  const errorPayload = classifyAlphaVantagePayload(payload);
  if (errorPayload) {
    return {
      ok: false,
      classification: errorPayload.classification,
      note: errorPayload.note,
      http_status: 200,
      upstream: { ...upstream, http_status: 200 }
    };
  }

  const { bar, warnings } = normalizeAlphaVantageDailyAdjusted(payload, symbol, {
    targetDate,
    sourceProvider: providerConfig.id || providerConfig.alias || 'A',
    ingestedAt: new Date().toISOString()
  });

  if (!bar) {
    return {
      ok: false,
      classification: CLASSIFICATIONS.NETWORK_ERROR,
      note: 'schema_mismatch',
      http_status: upstream.http_status,
      upstream
    };
  }

  return {
    ok: true,
    bar,
    warnings,
    classification: CLASSIFICATIONS.OK,
    upstream
  };
}

async function fetchTwelveDataBar(symbol, providerConfig, { apiKey, targetDate }) {
  if (providerConfig?.kind !== 'twelve_data_eod') {
    throw new Error('PROVIDER_KIND_UNSUPPORTED');
  }

  const baseUrl = String(providerConfig.base_url || '').replace(/\/$/, '');
  const endpoint = String(providerConfig.endpoints?.time_series_eod || '/time_series');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const params = new URLSearchParams({
    symbol,
    interval: providerConfig.params?.interval || '1day',
    outputsize: providerConfig.params?.outputsize || '5',
    apikey: apiKey
  });
  const url = `${baseUrl}${path}?${params.toString()}`;
  const timeoutMs = Number.isFinite(Number(providerConfig.timeout_ms))
    ? Number(providerConfig.timeout_ms)
    : 10000;

  const result = await fetchWithRetry(url, {
    headers: {
      'user-agent': 'RubikVault/3.0 (market-prices)',
      accept: 'application/json'
    },
    timeoutMs
  });

  const upstream = result.upstream || {
    http_status: null,
    latency_ms: 0,
    retry_count: 0,
    rate_limited: false
  };

  if (!result.ok) {
    const classification =
      upstream.http_status === 429 ? CLASSIFICATIONS.HTTP_429 : CLASSIFICATIONS.NETWORK_ERROR;
    return {
      ok: false,
      classification,
      note: truncateNote(result.text),
      http_status: upstream.http_status,
      upstream
    };
  }

  let payload;
  try {
    payload = JSON.parse(result.text || '{}');
  } catch (error) {
    return {
      ok: false,
      classification: CLASSIFICATIONS.NETWORK_ERROR,
      note: 'failed_json_parse',
      http_status: upstream.http_status,
      upstream
    };
  }

  if (payload?.status === 'error') {
    return {
      ok: false,
      classification: CLASSIFICATIONS.UPSTREAM_ERROR_MESSAGE,
      note: truncateNote(payload.message || payload['status']),
      http_status: upstream.http_status,
      upstream
    };
  }

  const { bar, warnings } = normalizeTwelveDataTimeSeries(payload, symbol, {
    sourceProvider: providerConfig.id || 'twelvedata',
    ingestedAt: new Date().toISOString()
  });

  if (!bar) {
    return {
      ok: false,
      classification: CLASSIFICATIONS.NETWORK_ERROR,
      note: 'schema_mismatch',
      http_status: upstream.http_status,
      upstream
    };
  }

  return {
    ok: true,
    bar,
    warnings,
    classification: CLASSIFICATIONS.OK,
    upstream
  };
}

async function fetchBarWithRetries(symbol, providerConfig, options = {}) {
  const fetcher =
    providerConfig.kind === 'alpha_vantage_eod'
      ? fetchAlphaVantageBar
      : providerConfig.kind === 'twelve_data_eod'
      ? fetchTwelveDataBar
      : null;

  if (!fetcher) {
    throw new Error('PROVIDER_FETCHER_MISSING');
  }

  const {
    apiKey,
    targetDate,
    maxRetriesNotePayload = 0,
    maxRetries429 = 0,
    throttleMs = 1000
  } = options;

  let noteAttempts = 0;
  let rateAttempts = 0;
  while (true) {
    const result = await fetcher(symbol, providerConfig, { apiKey, targetDate });
    if (result.ok) {
      return result;
    }

    const classification = result.classification || CLASSIFICATIONS.NETWORK_ERROR;
    if (
      (classification === CLASSIFICATIONS.RATE_LIMIT_NOTE || classification === CLASSIFICATIONS.UPSTREAM_INFORMATION) &&
      noteAttempts < maxRetriesNotePayload
    ) {
      noteAttempts += 1;
      await sleep(throttleMs);
      continue;
    }

    if (classification === CLASSIFICATIONS.HTTP_429 && rateAttempts < maxRetries429) {
      rateAttempts += 1;
      await sleep(throttleMs);
      continue;
    }

    return result;
  }
}

async function throttleProvider(providerConfig, state) {
  const throttleMs = Number.isFinite(Number(providerConfig.default_throttle_ms))
    ? Number(providerConfig.default_throttle_ms)
    : 0;
  const burstCap = Number.isFinite(Number(providerConfig.burst_cap))
    ? Number(providerConfig.burst_cap)
    : 1;

  state.requestsMade = state.requestsMade ?? 0;
  if (throttleMs <= 0) {
    state.requestsMade += 1;
    return;
  }

  if (state.requestsMade >= burstCap) {
    const jitter = Math.floor(Math.random() * Math.min(1000, Math.max(1, throttleMs * 0.1)));
    await sleep(throttleMs + jitter);
  }

  state.requestsMade += 1;
}

export async function main() {
  const outDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : (process.env.ARTIFACTS_DIR
        ? join(String(process.env.ARTIFACTS_DIR), MODULE_NAME)
        : DEFAULT_OUT_DIR);

  await mkdir(outDir, { recursive: true });

  const forcedStub = toBool(process.env.RV_PRICES_STUB);
  const forcedReal = toBool(process.env.RV_PRICES_FORCE_REAL);

  const useStooq = !forcedStub;
  const providersRegistry = await loadProvidersRegistry();
  const stooqProviderEntry = {
    id: 'stooq',
    name: 'Stooq',
    role: 'primary',
    enabled: true,
    order: 0
  };
  const providerChain = useStooq
    ? [stooqProviderEntry]
    : buildProviderChain(providersRegistry, 'prices_eod');
  const providerChainSummary = describeProviderChain(providerChain);
  const providerAuthInfo = {};
  if (!useStooq) {
    for (const provider of providerChain) {
      providerAuthInfo[provider.id] = getProviderAuthInfo(provider);
    }
  }
  const primaryProvider = providerChain.find((provider) => provider.role === 'primary');
  if (!primaryProvider) {
    throw new Error('PROVIDER_PRIMARY_AVAILABLE');
  }

  if (!useStooq) {
    const primaryAuth = providerAuthInfo[primaryProvider.id];
    if (forcedReal && !primaryAuth.apiKey) {
      const err = new Error('REAL_FETCH_MISSING_API_KEY');
      err.class = 'REAL_FETCH_MISSING_API_KEY';
      throw err;
    }
  }

  const mode = forcedStub ? 'STUB' : 'REAL';
  let providerLabel = mode === 'STUB' ? 'stub' : 'stooq';

  const symbols = await loadUniverseIndexProxies();
  const config = await loadModuleConfig();
  const minCount = Number.isFinite(config.counts?.min) ? config.counts.min : symbols.length;

  const errors = [];
  const warnings = [];
  const rawBars = [];
  const validBars = [];
  const upstreamResults = [];
  const symbolErrors = {};
  const symbolAttempts = {};
  const symbolSources = {};
  let upstreamNote = null;
  const targetDate = getYesterdayUTCString();
  const realStart = Date.now();
  const runtimeState = mode === 'REAL' ? (await loadProviderRuntimeState(outDir)) || {} : {};
  runtimeState.providers = runtimeState.providers || {};
  runtimeState.provider_chain = providerChainSummary;

  let runClassification = CLASSIFICATIONS.OK;
  let reasonCode = null;
  let lastHttpStatus = null;
  let succeededSymbols = 0;

  const throttleStates = {};
  if (useStooq) {
    const stooqResult = await fetchStooqBars(symbols, outDir);
    rawBars.push(...stooqResult.bars);
    Object.assign(symbolSources, stooqResult.sources);
    Object.assign(symbolAttempts, stooqResult.attempts);
    upstreamResults.push(...stooqResult.upstreams);
    succeededSymbols = stooqResult.bars.length;
  } else if (mode === 'STUB') {
    for (const symbol of symbols) {
      rawBars.push(makeStubBar(symbol));
    }
  } else {
    for (const symbol of symbols) {
      const attempts = [];
      let selectedBar = null;
      let selectedProviderId = null;
      let lastAttempt = null;

      for (const provider of providerChain) {
        const providerState = ensureProviderRuntimeEntry(runtimeState, provider.id);
        const attempt = {
          provider_id: provider.id,
          classification: null,
          http_status: null,
          note: null,
          ok: false
        };

        if (isProviderInCooldown(providerState)) {
          attempt.classification = CLASSIFICATIONS.COOLDOWN_ACTIVE;
          attempt.note =
            providerState.cooldown_note || `Cooldown active until ${providerState.cooldown_until || 'unknown'}`;
          attempts.push(attempt);
          lastAttempt = attempt;
          continue;
        }

        const auth = providerAuthInfo[provider.id];
        if (!auth?.apiKey) {
          attempt.classification = CLASSIFICATIONS.NETWORK_ERROR;
          attempt.note = auth ? `Missing API key (${auth.envVar})` : 'Missing API key';
          attempts.push(attempt);
          lastAttempt = attempt;
          continue;
        }

        const throttleState = throttleStates[provider.id] || { requestsMade: 0 };
        await throttleProvider(provider, throttleState);
        throttleStates[provider.id] = throttleState;

        const result = await fetchBarWithRetries(symbol, provider, {
          apiKey: auth.apiKey,
          targetDate,
          maxRetriesNotePayload: Math.max(0, Number(provider.max_retries_note_payload) || 0),
          maxRetries429: Math.max(0, Number(provider.max_retries_429) || 0),
          throttleMs: Math.max(1000, Number(provider.min_delay_ms_default) || 1000)
        });

        if (result?.upstream) upstreamResults.push(result.upstream);

        attempt.classification = result.classification || CLASSIFICATIONS.NETWORK_ERROR;
        attempt.http_status = result.http_status ?? result.upstream?.http_status ?? null;
        attempt.note = result.note ?? null;
        attempt.ok = Boolean(result.ok);
        attempts.push(attempt);
        lastAttempt = attempt;

        if (result.ok && result.bar) {
          selectedBar = result.bar;
          selectedProviderId = provider.id;
          if (Array.isArray(result.warnings) && result.warnings.length > 0) {
            warnings.push(...result.warnings);
          }
          break;
        }

        if (!upstreamNote && attempt.note) upstreamNote = attempt.note;
        if (attempt.http_status) lastHttpStatus = attempt.http_status;

        const classification = attempt.classification || CLASSIFICATIONS.NETWORK_ERROR;
        if (isCooldownClassification(classification)) {
          markProviderCooldown(
            providerState,
            classification,
            attempt.note,
            attempt.http_status,
            provider.cooldown_minutes_default ?? 30
          );
        }

        if (classification && classification !== CLASSIFICATIONS.OK) {
          runClassification = classification;
        }
      }

      symbolAttempts[symbol] = attempts;

      if (selectedBar) {
        rawBars.push(selectedBar);
        symbolSources[symbol] = selectedProviderId;
        succeededSymbols += 1;
        continue;
      }

      const failureAttempt = lastAttempt || {
        classification: CLASSIFICATIONS.NETWORK_ERROR,
        provider_id: providerChain[providerChain.length - 1]?.id || providerChain[0]?.id || 'unknown',
        http_status: null,
        note: null
      };
      symbolErrors[symbol] = {
        classification: failureAttempt.classification,
        note: failureAttempt.note,
        http_status: failureAttempt.http_status,
        provider_id: failureAttempt.provider_id || providerChain[0]?.id || 'unknown'
      };
      rawBars.push(buildMissingBar(symbol, failureAttempt.provider_id || providerChain[0]?.id || 'unknown'));
      if (!upstreamNote && failureAttempt.note) upstreamNote = failureAttempt.note;
      if (failureAttempt.http_status) lastHttpStatus = failureAttempt.http_status;
      if (failureAttempt.classification && failureAttempt.classification !== CLASSIFICATIONS.OK) {
        runClassification = failureAttempt.classification;
      }
    }
  }

  for (const bar of rawBars) {
    const check = validateBar(bar);
    if (!check.ok) {
      errors.push({ symbol: bar?.symbol || null, errors: check.errors });
    } else {
      validBars.push(bar);
    }
  }

  const rawCount = rawBars.length;
  const validCount = validBars.length;
  const droppedRecords = rawCount - validCount;
  const validationMeta = computeValidationMetadata(rawCount, validCount, droppedRecords, errors.length === 0);
  const meetsMinCount = validCount >= minCount;
  const noValidBars = validCount === 0;
  const passed = !noValidBars && meetsMinCount && errors.length === 0 && validationMeta.drop_check_passed;

  const providerCooldownActive =
    mode === 'REAL' &&
    providerChain.some((provider) => isProviderInCooldown(runtimeState.providers?.[provider.id]));

  if (!reasonCode) {
    if (providerCooldownActive) {
      reasonCode = 'COOLDOWN_ACTIVE';
    } else if (noValidBars) {
      reasonCode = runClassification === CLASSIFICATIONS.OK ? 'NO_VALID_BARS' : runClassification;
    } else if (!meetsMinCount) {
      reasonCode = runClassification === CLASSIFICATIONS.OK ? 'PARTIAL_DUE_TO_RATE_LIMIT' : runClassification;
    } else {
      reasonCode = 'FULL_SUCCESS';
    }
  }

  const httpStatus = upstreamResults.find((u) => u && u.http_status !== null)?.http_status ?? lastHttpStatus ?? null;
  const retryCount = upstreamResults.reduce((max, u) => Math.max(max, u?.retry_count || 0), 0);
  const rateLimited = upstreamResults.some((u) => u?.rate_limited) || runClassification === CLASSIFICATIONS.HTTP_429;

  const upstream = {
    http_status: httpStatus,
    latency_ms: Date.now() - realStart,
    rate_limit_remaining: null,
    retry_count: retryCount,
    rate_limited: rateLimited,
    classification: runClassification,
    note: upstreamNote || null,
    error: runClassification === CLASSIFICATIONS.OK ? null : runClassification,
    symbol_errors: Object.keys(symbolErrors).length > 0 ? symbolErrors : {},
    symbol_attempts: Object.keys(symbolAttempts).length > 0 ? symbolAttempts : undefined,
    symbol_sources: Object.keys(symbolSources).length > 0 ? symbolSources : undefined
  };

  const successfulProviders = [
    ...new Set(validBars.map((bar) => bar?.source_provider).filter(Boolean))
  ];
  if (mode !== 'STUB') {
    if (successfulProviders.length === 0) {
      providerLabel = providerChain[0]?.id || providerLabel;
    } else if (successfulProviders.length === 1) {
      providerLabel = successfulProviders[0];
    } else {
      providerLabel = 'MIXED_BY_SYMBOL';
    }
  }
  const fetchedAt = new Date().toISOString();
  const asOf = computeAsOf(validBars);
  const envelope = buildEnvelope(validBars, {
    module: MODULE_NAME,
    tier: config.tier || 'standard',
    domain: config.domain || 'stocks',
    source: mode === 'STUB' ? 'stub' : 'stooq',
    fetched_at: fetchedAt,
    published_at: fetchedAt,
    freshness: config.freshness,
    validation: {
      passed,
      dropped_records: validationMeta.dropped_records,
      drop_ratio: validationMeta.drop_ratio,
      drop_check_passed: validationMeta.drop_check_passed,
      drop_threshold: validationMeta.drop_threshold,
      checks: ['bars', 'drop_threshold'],
      warnings
    },
    upstream,
    error: passed
      ? null
      : {
          class: noValidBars ? 'NO_VALID_BARS' : (runClassification || 'VALIDATION_FAILED'),
          message: noValidBars ? 'No valid bars after normalization' : 'One or more symbols failed hard validation',
          details: {
            dropped_records: droppedRecords,
            errors
          }
        }
  });

  envelope.metadata.upstream = { ...envelope.metadata.upstream, ...upstream };
  envelope.metadata.provider = providerLabel;
  envelope.metadata.as_of = asOf;
  const cooldownUntil =
    providerChain
      .map((provider) => runtimeState.providers?.[provider.id]?.cooldown_until)
      .find((value) => typeof value === 'string' && value.length > 0) ?? null;
  envelope.metadata.compute = {
    planned_symbols: symbols.length,
    done_symbols: validCount,
    dropped_symbols: Object.keys(symbolErrors).sort(),
    provider_chain: providerChainSummary,
    provider_sources: Object.keys(symbolSources).length > 0 ? symbolSources : undefined,
    reason_code: reasonCode,
    cooldown_until: cooldownUntil
  };
  envelope.metadata.digest = computeSnapshotDigest(envelope);

  const healthArtifacts = buildHealthArtifacts({
    mode,
    providerChain,
    providerChainSummary,
    symbolAttempts,
    symbolSources,
    symbolErrors,
    symbols,
    validCount,
    runtimeState
  });
  const providerHealthPath = join(outDir, 'provider-health.json');
  const marketHealthPath = join(outDir, 'market-prices-health.json');
  await writeFile(providerHealthPath, JSON.stringify(healthArtifacts.providerHealthPayload, null, 2) + '\n', 'utf-8');
  await writeFile(marketHealthPath, JSON.stringify(healthArtifacts.marketHealthPayload, null, 2) + '\n', 'utf-8');

  const schemaCheck = validateEnvelopeSchema(envelope);
  if (!schemaCheck.valid) {
    throw new Error(`ENVELOPE_SCHEMA_INVALID: ${schemaCheck.errors.join('; ')}`);
  }

  const failureClass = passed ? null : (reasonCode || 'VALIDATION_FAILED');
  const failureMessage = passed ? null : `Run failed (${reasonCode})`;
  const failureHint = passed ? null : 'Inspect metadata.upstream for classification details.';

  const moduleState = buildModuleState(
    MODULE_NAME,
    envelope,
    { valid: passed, passed, errors: passed ? [] : [failureClass || 'VALIDATION_FAILED'], warnings },
    config,
    {
      failure_class: failureClass,
      failure_message: failureMessage,
      failure_hint: failureHint
    }
  );

  if (mode === 'REAL') {
    const nowIso = new Date().toISOString();
    for (const provider of providerChain) {
      const entry = ensureProviderRuntimeEntry(runtimeState, provider.id);
      entry.last_run_at = nowIso;
    }
    runtimeState.last_run_at = nowIso;
    runtimeState.provider_id = providerLabel;
    runtimeState.last_classification = runClassification;
    runtimeState.last_http_status = lastHttpStatus ?? runtimeState.last_http_status ?? null;
    runtimeState.last_note = upstreamNote || runtimeState.last_note || null;
    await saveProviderRuntimeState(outDir, runtimeState);
  }

  const snapshotPath = join(outDir, 'snapshot.json');
  const statePath = join(outDir, 'module-state.json');

  await writeFile(snapshotPath, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  await writeFile(statePath, JSON.stringify(moduleState, null, 2) + '\n', 'utf-8');

  const shouldFailHard = forcedReal && mode === 'REAL' && symbols.length > 0 && noValidBars;
  if (shouldFailHard) {
    process.exitCode = 2;
    const reasonLabel = reasonCode === 'COOLDOWN_ACTIVE' ? 'REAL_FETCH_COOLDOWN_ACTIVE' : 'REAL_FETCH_NO_VALID_BARS';
    process.stderr.write(
      `FAIL: ${providerLabel} ${reasonLabel} (classification=${runClassification}). See snapshot.metadata.upstream.*\n`
    );
  } else {
    process.stdout.write(`OK: ${MODULE_NAME} artifacts written (${mode})\n`);
  }
  process.stdout.write(`  out_dir: ${outDir}\n`);
  process.stdout.write(`  symbols: ${symbols.join(', ')}\n`);
  process.stdout.write(`  status: ${moduleState.status}\n`);
  process.stdout.write(`  dropped_records: ${validationMeta.dropped_records}\n`);
}

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`FAIL: ${MODULE_NAME} provider\n${err.stack || err.message || String(err)}\n`);
    process.exit(1);
  });
}
