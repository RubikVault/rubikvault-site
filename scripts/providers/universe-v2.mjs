#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildEnvelope, validateEnvelopeSchema } from '../lib/envelope.js';
import { computeSnapshotDigest } from '../lib/digest.js';
import { buildModuleState } from '../lib/module-state.js';
import { computeValidationMetadata } from '../lib/drop-threshold.js';

const __filename = fileURLToPath(import.meta.url);
const BASE_DIR = process.cwd();
const MODULE_NAME = 'universe';
const DEFAULT_ARTIFACTS_DIR = join(BASE_DIR, 'tmp/universe-artifacts');
const DEFAULT_STUB_PATH = join(BASE_DIR, 'tests/fixtures/universe-v2.stub.json');
const INDEX_THRESHOLDS = {
  DJ30: 30,
  SP500: 500,
  NDX100: 100,
  RUT2000: 2000
};
const TOTAL_THRESHOLD = Object.values(INDEX_THRESHOLDS).reduce((sum, next) => sum + next, 0);

function toBool(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function formatDate(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function readJson(path) {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((column) => column.trim());
  return lines.slice(1).map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i - 1] !== '\\') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current);
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i] !== undefined ? values[i].trim() : '';
    }
    return row;
  });
}

export function normalizeSymbol(rawValue, warnings = []) {
  if (!rawValue) return null;
  const trimmed = String(rawValue).trim();
  if (trimmed.split(/\s+/).length > 1) {
    warnings.push(`INVALID_SYMBOL:${rawValue}`);
    return null;
  }
  let symbol = trimmed.toUpperCase();
  symbol = symbol.replace(/\s+/g, '');
  if (!symbol) return null;

  const exchangeSuffix = symbol.match(/\.(US|UK|LN|L|HK|TO|AX|PA)$/i);
  if (exchangeSuffix) {
    symbol = symbol.replace(/\.(US|UK|LN|L|HK|TO|AX|PA)$/i, '');
  } else if (symbol.includes('.')) {
    symbol = symbol.replace(/\./g, '-');
  }

  symbol = symbol.replace(/-+US$/i, '');

  if (!/^[A-Z0-9-]+$/.test(symbol)) {
    warnings.push(`INVALID_SYMBOL:${rawValue}`);
    return null;
  }

  if (symbol.length > 8) {
    warnings.push(`SYMBOL_TOO_LONG:${symbol}`);
  }

  return symbol;
}

const INDEX_CONFIGS = {
  DJ30: {
    url: 'https://datahub.io/core/dow-30/r/dow-30.csv',
    parser: (rows) => rows.map((row) => ({
      symbol: row.Symbol,
      name: row.Name,
      sector: row.Industry || null,
      industry: row.Industry || null,
      exchange: 'NYSE',
      country: 'US',
      currency: 'USD'
    }))
  },
  SP500: {
    url: 'https://datahub.io/core/s-and-p-500-companies/r/constituents.csv',
    parser: (rows) => rows.map((row) => ({
      symbol: row.Symbol,
      name: row.Name,
      sector: row.Sector || null,
      industry: null,
      exchange: 'NYSE',
      country: 'US',
      currency: 'USD'
    }))
  },
  NDX100: {
    url: 'https://datahub.io/core/nasdaq-100/r/nasdaq-100.csv',
    parser: (rows) => rows.map((row) => ({
      symbol: row.Symbol,
      name: row.Name,
      sector: row.Sector || null,
      industry: null,
      exchange: 'NASDAQ',
      country: 'US',
      currency: 'USD'
    }))
  },
  RUT2000: {
    url: 'https://raw.githubusercontent.com/datasets/russell-2000/main/data/russell2000.csv',
    parser: (rows) => rows.map((row) => ({
      symbol: row.Symbol,
      name: row.Name,
      sector: row.Sector || null,
      industry: row.Industry || null,
      exchange: 'NYSE',
      country: 'US',
      currency: 'USD'
    }))
  }
};

async function fetchIndex(indexKey, config) {
  const response = await fetch(config.url, {
    headers: {
      'User-Agent': 'RubikVault/3.0 universe',
      Accept: 'text/csv'
    }
  });
  const upstream = {
    url: config.url,
    http_status: response.status,
    status: response.ok ? 'ok' : 'error'
  };
  if (!response.ok) {
    return { entries: [], upstream };
  }
  const text = await response.text();
  const rawEntries = parseCsv(text);
  const parsed = config.parser(rawEntries);
  upstream.record_count = parsed.length;
  return { entries: parsed, upstream };
}

function mergeEntry(symbol, bucket, entry, index, warnings) {
  if (!symbol) return;
  const existing = bucket[symbol] || {
    symbol,
    name: entry.name || null,
    exchange: entry.exchange || null,
    currency: entry.currency || 'USD',
    country: entry.country || null,
    sector: entry.sector || null,
    industry: entry.industry || null,
    indexes: [],
    source: {},
    updated_at: formatDate()
  };
  if (entry.name && entry.name.length > (existing.name || '').length) {
    existing.name = entry.name;
  }
  existing.exchange = existing.exchange || entry.exchange || null;
  existing.sector = existing.sector || entry.sector || null;
  existing.industry = existing.industry || entry.industry || null;
  existing.indexes = Array.from(new Set([...existing.indexes, index]));
  existing.source[index] = entry.name ? `${index}:${entry.name}` : `${index}:unknown`;
  bucket[symbol] = existing;
}

function buildMapFromStub(stub) {
  return stub?.data || {};
}

function buildHealth(symbolCount) {
  let quality = 'FAILED';
  if (symbolCount >= TOTAL_THRESHOLD) quality = 'OK';
  else if (symbolCount >= TOTAL_THRESHOLD * 0.75) quality = 'DEGRADED';
  return {
    module: MODULE_NAME,
    total_symbols: symbolCount,
    coverage_ratio: Number(Math.min(1, symbolCount / TOTAL_THRESHOLD).toFixed(3)),
    run_quality: quality
  };
}

async function loadModuleConfig() {
  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
  const registry = await readJson(registryPath);
  const moduleConfig = registry?.modules?.[MODULE_NAME];
  if (!moduleConfig) {
    throw new Error(`MODULE_CONFIG_MISSING:${MODULE_NAME}`);
  }
  return moduleConfig;
}

async function main() {
  const artifactsDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : process.env.ARTIFACTS_DIR
    ? join(String(process.env.ARTIFACTS_DIR), MODULE_NAME)
    : DEFAULT_ARTIFACTS_DIR;
  await mkdir(artifactsDir, { recursive: true });
  const forcedStub = toBool(process.env.RV_UNIVERSE_STUB);
  const forcedReal = toBool(process.env.RV_UNIVERSE_FORCE_REAL);
  const mode = forcedReal ? 'REAL' : 'STUB';
  const config = await loadModuleConfig();

  const warnings = [];
  const upstream = {};
  let bucket = {};

  if (mode === 'STUB') {
    const stub = await readJson(DEFAULT_STUB_PATH);
    bucket = buildMapFromStub(stub);
    warnings.push('STUB_DATA');
    upstream.stub = { status: 'ok', sourced_from: 'tests/fixtures/universe-v2.stub.json' };
  } else {
    for (const [index, config] of Object.entries(INDEX_CONFIGS)) {
      const { entries, upstream: result } = await fetchIndex(index, config);
      upstream[index.toLowerCase()] = result;
      for (const entry of entries) {
        const normalized = normalizeSymbol(entry.symbol, warnings);
        mergeEntry(normalized, bucket, entry, index, warnings);
      }
    }
  }

  const data = Object.keys(bucket)
    .sort()
    .reduce((acc, symbol) => {
      acc[symbol] = bucket[symbol];
      return acc;
    }, {});

  const symbolCount = Object.keys(data).length;
  const validationMeta = computeValidationMetadata(symbolCount, symbolCount, 0, true);
  const now = new Date().toISOString();
  const envelope = buildEnvelope([], {
    module: MODULE_NAME,
    tier: 'standard',
    domain: 'stocks',
    source: mode === 'STUB' ? 'stub' : 'universe-real',
    fetched_at: now,
    published_at: now,
    freshness: config.freshness,
    validation: {
      ...validationMeta,
      warnings
    }
  });
  envelope.data = data;
  envelope.metadata.record_count = symbolCount;
  envelope.metadata.provider = 'universe-engine';
  envelope.metadata.upstream = upstream;
  envelope.metadata.digest = computeSnapshotDigest(envelope);
  envelope.module = envelope.module || envelope.metadata?.module || MODULE_NAME;

  const schemaCheck = validateEnvelopeSchema(envelope);
  if (!schemaCheck.valid) {
    throw new Error(`ENVELOPE_SCHEMA_INVALID: ${schemaCheck.errors.join('; ')}`);
  }

  const health = buildHealth(symbolCount);
  const validationPassed = symbolCount >= TOTAL_THRESHOLD;
  const state = buildModuleState(
    MODULE_NAME,
    envelope,
    {
      valid: validationPassed,
      passed: validationPassed,
      errors: validationPassed ? [] : ['VALIDATION_FAILED'],
      warnings
    },
    config,
    {
      failure_class: validationPassed ? null : 'VALIDATION_FAILED',
      failure_message: validationPassed ? null : 'Universe validation failed',
      failure_hint: validationPassed ? null : 'Inspect data coverage'
    }
  );

  const snapshotPath = join(artifactsDir, 'snapshot.json');
  const statePath = join(artifactsDir, 'module-state.json');
  const healthPath = join(artifactsDir, 'universe-health.json');

  await writeFile(snapshotPath, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  await writeFile(healthPath, JSON.stringify(health, null, 2) + '\n', 'utf-8');

  process.stdout.write(`OK: ${MODULE_NAME} artifacts written (${mode})\n`);
}

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`FAIL: ${MODULE_NAME} provider\n${err.stack || err.message || String(err)}\n`);
    process.exit(1);
  });
}
