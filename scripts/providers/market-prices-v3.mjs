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

function selectProviderConfig(registry) {
  const chain = registry?.chains?.prices_eod;
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error('PROVIDER_CHAIN_MISSING');
  }
  const selected = chain.find((entry) => entry && entry.enabled !== false) || chain[0];
  if (!selected || !selected.id) {
    throw new Error('PROVIDER_CHAIN_INVALID');
  }
  const providers = Array.isArray(registry?.providers) ? registry.providers : [];
  const provider = providers.find((entry) => entry && entry.id === selected.id);
  if (!provider || typeof provider !== 'object') {
    throw new Error('PROVIDER_CONFIG_MISSING');
  }
  return {
    ...provider,
    id: provider.id || selected.id,
    kind: provider.kind || selected.kind || null
  };
}

function getProviderApiKey(provider) {
  const envVar = provider?.auth_env_var;
  if (typeof envVar !== 'string' || !envVar.trim()) {
    throw new Error('PROVIDER_AUTH_ENV_VAR_MISSING (check public/data/registry/providers.v1.json)');
  }
  const raw = process.env[envVar];
  const apiKey = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  return { envVar, apiKey };
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

async function fetchProviderABar(symbol, providerConfig, { apiKey, targetDate }) {
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

async function fetchBarWithRetries(symbol, providerConfig, options = {}) {
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
    const result = await fetchProviderABar(symbol, providerConfig, { apiKey, targetDate });
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

  const providersRegistry = await loadProvidersRegistry();
  const providerConfig = selectProviderConfig(providersRegistry);
  const { apiKey } = getProviderApiKey(providerConfig);

  if (forcedReal && !apiKey) {
    const err = new Error('REAL_FETCH_MISSING_API_KEY');
    err.class = 'REAL_FETCH_MISSING_API_KEY';
    throw err;
  }

  const mode = forcedStub ? 'STUB' : (forcedReal && apiKey ? 'REAL' : 'STUB');
  const providerId = mode === 'STUB' ? 'stub' : (providerConfig.id || providerConfig.alias || 'unknown');

  const symbols = await loadUniverseIndexProxies();
  const config = await loadModuleConfig();
  const minCount = Number.isFinite(config.counts?.min) ? config.counts.min : symbols.length;

  const errors = [];
  const warnings = [];
  const rawBars = [];
  const validBars = [];
  const upstreamResults = [];
  const symbolErrors = {};
  let upstreamNote = null;
  const throttleState = { requestsMade: 0 };
  const targetDate = getYesterdayUTCString();
  const realStart = Date.now();
  const runtimeState = mode === 'REAL' ? (await loadProviderRuntimeState(outDir)) || {} : {};
  runtimeState.provider_id = providerId;

  const nowMs = Date.now();
  const cooldownMinutes = Math.max(0, Number(providerConfig.cooldown_minutes_default) || 30);
  const maxRetriesNote = Math.max(0, Number(providerConfig.max_retries_note_payload) || 0);
  const maxRetries429 = Math.max(0, Number(providerConfig.max_retries_429) || 0);
  const throttleDelay = Math.max(1000, Number(providerConfig.default_throttle_ms) || 1000);

  let cooldownActive = false;
  let cooldownNote = null;
  if (mode === 'REAL' && runtimeState.cooldown_until) {
    const until = Date.parse(runtimeState.cooldown_until);
    if (!Number.isNaN(until) && until > nowMs) {
      cooldownActive = true;
      cooldownNote = runtimeState.cooldown_note || `Cooldown active until ${runtimeState.cooldown_until}`;
    } else {
      delete runtimeState.cooldown_until;
      delete runtimeState.cooldown_note;
    }
  }

  let runClassification = CLASSIFICATIONS.OK;
  let reasonCode = null;
  let lastHttpStatus = null;
  let stopIndex = null;
  let succeededSymbols = 0;

  if (mode === 'STUB') {
    for (const symbol of symbols) {
      rawBars.push(makeStubBar(symbol));
    }
  } else {
    if (cooldownActive && forcedReal) {
      reasonCode = 'COOLDOWN_ACTIVE';
      runClassification = CLASSIFICATIONS.COOLDOWN_ACTIVE;
      upstreamNote = upstreamNote || cooldownNote;
      for (const symbol of symbols) {
        rawBars.push(buildMissingBar(symbol, providerId));
        symbolErrors[symbol] = {
          classification: CLASSIFICATIONS.COOLDOWN_ACTIVE,
          note: upstreamNote,
          http_status: runtimeState.last_http_status || null
        };
      }
    } else {
      for (let idx = 0; idx < symbols.length; idx += 1) {
        const symbol = symbols[idx];
        await throttleProvider(providerConfig, throttleState);

        const result = await fetchBarWithRetries(symbol, providerConfig, {
          apiKey,
          targetDate,
          maxRetriesNotePayload: maxRetriesNote,
          maxRetries429,
          throttleMs: throttleDelay
        });

        if (result?.upstream) upstreamResults.push(result.upstream);

        if (result?.ok && result.bar) {
          rawBars.push(result.bar);
          if (Array.isArray(result.warnings) && result.warnings.length > 0) {
            warnings.push(...result.warnings);
          }
          succeededSymbols += 1;
          continue;
        }

        const classification = result?.classification || CLASSIFICATIONS.NETWORK_ERROR;
        const note = result?.note || null;
        const httpStatus = result?.http_status ?? result?.upstream?.http_status ?? null;
        symbolErrors[symbol] = {
          classification,
          note,
          http_status: httpStatus
        };
        rawBars.push(buildMissingBar(symbol, providerId));
        lastHttpStatus = httpStatus || lastHttpStatus;
        runClassification = classification;
        if (!upstreamNote && note) upstreamNote = note;

        if (isCooldownClassification(classification)) {
          stopIndex = idx + 1;
          reasonCode = succeededSymbols > 0 ? 'PARTIAL_DUE_TO_RATE_LIMIT' : classification;
          runtimeState.last_rate_limit_at = new Date().toISOString();
          runtimeState.last_classification = classification;
          runtimeState.last_http_status = httpStatus;
          const cooldownUntilMs = Date.now() + cooldownMinutes * 60 * 1000;
          runtimeState.cooldown_until = new Date(cooldownUntilMs).toISOString();
          runtimeState.cooldown_note = note;
          break;
        }
      }

      if (stopIndex !== null) {
        for (let idx = stopIndex; idx < symbols.length; idx += 1) {
          const symbol = symbols[idx];
          rawBars.push(buildMissingBar(symbol, providerId));
          if (!symbolErrors[symbol]) {
            symbolErrors[symbol] = {
              classification: CLASSIFICATIONS.COOLDOWN_ACTIVE,
              note: 'Stopped due to rate limit',
              http_status: lastHttpStatus || null
            };
          }
        }
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

  if (!reasonCode) {
    if (cooldownActive) {
      reasonCode = 'COOLDOWN_ACTIVE';
    } else if (!meetsMinCount) {
      reasonCode = runClassification === CLASSIFICATIONS.OK ? 'NO_VALID_BARS' : runClassification;
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
    symbol_errors: Object.keys(symbolErrors).length > 0 ? symbolErrors : {}
  };

  const fetchedAt = new Date().toISOString();
  const asOf = computeAsOf(validBars);
  const envelope = buildEnvelope(validBars, {
    module: MODULE_NAME,
    tier: config.tier || 'standard',
    domain: config.domain || 'stocks',
    source: mode === 'STUB' ? 'stub' : (providerConfig.kind || providerConfig.id || 'unknown'),
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
  envelope.metadata.provider = providerId;
  envelope.metadata.as_of = asOf;
  envelope.metadata.compute = {
    planned_symbols: symbols.length,
    done_symbols: validCount,
    dropped_symbols: Object.keys(symbolErrors).sort(),
    reason_code: reasonCode,
    cooldown_until: runtimeState.cooldown_until || null
  };
  envelope.metadata.digest = computeSnapshotDigest(envelope);

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
    runtimeState.last_run_at = new Date().toISOString();
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
      `FAIL: ${providerId} ${reasonLabel} (classification=${runClassification}). See snapshot.metadata.upstream.*\n`
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
