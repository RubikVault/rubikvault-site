#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { buildEnvelope, validateEnvelopeSchema } from '../lib/envelope.js';
import { computeSnapshotDigest } from '../lib/digest.js';
import { buildModuleState } from '../lib/module-state.js';
import { computeValidationMetadata } from '../lib/drop-threshold.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = process.cwd();

const MODULE_NAME = 'market-prices';
const DEFAULT_OUT_DIR = join(BASE_DIR, 'tmp/phase1-artifacts/market-prices');

function toBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
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

function detectSecretsPresent() {
  const candidates = ['STOOQ_API_KEY', 'POLYGON_API_KEY', 'ALPHAVANTAGE_API_KEY', 'FMP_API_KEY', 'FINNHUB_API_KEY'];
  return candidates.some((k) => {
    const v = process.env[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

async function main() {
  const outDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : DEFAULT_OUT_DIR;

  const forcedStub = toBool(process.env.RV_PRICES_STUB);
  const forcedReal = toBool(process.env.RV_PRICES_FORCE_REAL);

  const secretsPresent = detectSecretsPresent();

  if (forcedReal) {
    throw new Error('REAL_FETCH_NOT_IMPLEMENTED_YET (use STUB or implement WP3 provider)');
  }

  const mode = forcedStub || !secretsPresent ? 'STUB' : 'STUB';

  const symbols = await loadUniverseIndexProxies();
  const config = await loadModuleConfig();

  const rawBars = [];
  for (const symbol of symbols) {
    if (mode === 'STUB') {
      rawBars.push(makeStubBar(symbol));
    }
  }

  const errors = [];
  const warnings = [];
  const validBars = [];

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
  const passed = errors.length === 0 && validationMeta.drop_check_passed;

  const fetchedAt = new Date().toISOString();
  const envelope = buildEnvelope(validBars, {
    module: MODULE_NAME,
    tier: config.tier || 'standard',
    domain: config.domain || 'stocks',
    source: mode === 'STUB' ? 'stub' : (config.source || 'unknown'),
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
    upstream: {
      http_status: null,
      latency_ms: 0,
      rate_limit_remaining: null,
      retry_count: 0,
      rate_limited: false
    },
    error: passed
      ? null
      : {
          class: 'VALIDATION_FAILED',
          message: 'One or more symbols failed hard validation',
          details: {
            dropped_records: droppedRecords,
            errors
          }
        }
  });

  envelope.metadata.digest = computeSnapshotDigest(envelope);

  const schemaCheck = validateEnvelopeSchema(envelope);
  if (!schemaCheck.valid) {
    throw new Error(`ENVELOPE_SCHEMA_INVALID: ${schemaCheck.errors.join('; ')}`);
  }

  const moduleState = buildModuleState(
    MODULE_NAME,
    envelope,
    { valid: passed, passed, errors: passed ? [] : ['VALIDATION_FAILED'], warnings },
    config,
    {
      failure_class: passed ? null : 'VALIDATION_FAILED',
      failure_message: passed ? null : 'One or more symbols failed hard validation',
      failure_hint: passed ? null : 'Inspect tmp artifacts and fix the provider normalization/validation.'
    }
  );

  await mkdir(outDir, { recursive: true });

  const snapshotPath = join(outDir, 'snapshot.json');
  const statePath = join(outDir, 'module-state.json');

  await writeFile(snapshotPath, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  await writeFile(statePath, JSON.stringify(moduleState, null, 2) + '\n', 'utf-8');

  process.stdout.write(`OK: ${MODULE_NAME} artifacts written (${mode})\n`);
  process.stdout.write(`  out_dir: ${outDir}\n`);
  process.stdout.write(`  symbols: ${symbols.join(', ')}\n`);
  process.stdout.write(`  status: ${moduleState.status}\n`);
  process.stdout.write(`  dropped_records: ${validationMeta.dropped_records}\n`);
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${MODULE_NAME} provider\n${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
