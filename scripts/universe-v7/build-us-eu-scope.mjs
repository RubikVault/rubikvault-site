#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const REPO_ROOT = process.cwd();
const SOURCE_REGISTRY = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public/data/universe/v7/ssot');
const MIRROR_DIR = path.join(REPO_ROOT, 'mirrors/universe-v7/ssot');

const US_COUNTRIES = new Set(['USA']);
const US_EXCHANGES = new Set(['US']);
const EU_COUNTRIES = new Set([
  'AUSTRIA',
  'BELGIUM',
  'CZECH REPUBLIC',
  'DENMARK',
  'FINLAND',
  'FRANCE',
  'GERMANY',
  'GREECE',
  'HUNGARY',
  'IRELAND',
  'ITALY',
  'LUXEMBOURG',
  'NETHERLANDS',
  'NORWAY',
  'POLAND',
  'PORTUGAL',
  'ROMANIA',
  'SPAIN',
  'SWEDEN',
  'SWITZERLAND',
  'UK',
]);
const EU_EXCHANGES = new Set([
  'AMS',
  'AS',
  'AT',
  'BC',
  'BE',
  'BME',
  'BR',
  'CO',
  'DU',
  'EBS',
  'EPA',
  'F',
  'FWB',
  'HA',
  'HE',
  'LON',
  'LSE',
  'MC',
  'MI',
  'MIL',
  'MU',
  'PA',
  'ST',
  'SW',
  'VI',
  'XETR',
  'XETRA',
  'XLON',
]);

function nowIso() {
  return new Date().toISOString();
}

async function readRegistryEntries(filePath) {
  const buf = await fs.readFile(filePath);
  const text = zlib.gunzipSync(buf).toString('utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function toNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function classifyRegion(row = {}) {
  const country = String(row.country || '').trim().toUpperCase();
  const exchange = String(row.exchange || '').trim().toUpperCase();
  if (US_COUNTRIES.has(country) || US_EXCHANGES.has(exchange)) return 'US';
  if (EU_COUNTRIES.has(country) || EU_EXCHANGES.has(exchange)) return 'EU';
  return null;
}

function regionRank(region) {
  if (region === 'US') return 3;
  if (region === 'EU') return 2;
  return 0;
}

function typeRank(typeNorm) {
  return String(typeNorm || '').toUpperCase() === 'STOCK' ? 2 : 1;
}

function symbolSupported(symbol) {
  return /^[A-Z][A-Z0-9.\-]*$/.test(symbol);
}

function compareRows(a, b) {
  const av = regionRank(a.scope_region) - regionRank(b.scope_region);
  if (av !== 0) return av;
  const tv = typeRank(a.type_norm) - typeRank(b.type_norm);
  if (tv !== 0) return tv;
  const dateA = String(a.last_trade_date || '');
  const dateB = String(b.last_trade_date || '');
  if (dateA !== dateB) return dateA > dateB ? 1 : -1;
  const volA = toNum(a.avg_volume_30d) ?? -1;
  const volB = toNum(b.avg_volume_30d) ?? -1;
  if (volA !== volB) return volA > volB ? 1 : -1;
  const barsA = toNum(a.bars_count) ?? -1;
  const barsB = toNum(b.bars_count) ?? -1;
  if (barsA !== barsB) return barsA > barsB ? 1 : -1;
  return String(b.canonical_id || '').localeCompare(String(a.canonical_id || '')) * -1;
}

async function main() {
  const registryRows = await readRegistryEntries(SOURCE_REGISTRY);
  const eligibleRows = registryRows
    .filter((row) => ['STOCK', 'ETF'].includes(String(row?.type_norm || '').toUpperCase()))
    .map((row) => ({
      canonical_id: row.canonical_id || null,
      symbol: normalizeSymbol(row.symbol),
      name: row.name || null,
      type_norm: String(row.type_norm || '').toUpperCase(),
      exchange: row.exchange || null,
      mic: row.mic || null,
      country: row.country || null,
      currency: row.currency || null,
      bars_count: toNum(row.bars_count),
      avg_volume_30d: toNum(row.avg_volume_30d),
      last_trade_date: row.last_trade_date || null,
      scope_region: classifyRegion(row),
    }))
    .filter((row) => row.scope_region)
    .filter((row) => row.symbol)
    .filter((row) => symbolSupported(row.symbol));

  const totalUniqueSymbols = new Set(eligibleRows.map((row) => row.symbol)).size;
  const winners = new Map();
  for (const row of eligibleRows) {
    const current = winners.get(row.symbol);
    if (!current || compareRows(row, current) > 0) winners.set(row.symbol, row);
  }

  const selectedRows = [...winners.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const symbols = selectedRows.map((row) => row.symbol);
  const canonicalIds = selectedRows.map((row) => String(row.canonical_id || '').toUpperCase()).filter(Boolean);

  const counts = {
    total_symbols: symbols.length,
    total_removed_symbols: Math.max(0, totalUniqueSymbols - symbols.length),
    by_region: {
      US: selectedRows.filter((row) => row.scope_region === 'US').length,
      EU: selectedRows.filter((row) => row.scope_region === 'EU').length,
    },
    by_type: {
      STOCK: selectedRows.filter((row) => row.type_norm === 'STOCK').length,
      ETF: selectedRows.filter((row) => row.type_norm === 'ETF').length,
    },
  };

  const generatedAt = nowIso();
  await writeJson(path.join(PUBLIC_DIR, 'stocks_etfs.us_eu.symbols.json'), {
    schema: 'rv_v7_scope_symbols_v1',
    generated_at: generatedAt,
    scope: 'us_eu_only',
    source: 'public/data/universe/v7/registry/registry.ndjson.gz',
    count: symbols.length,
    counts,
    symbols,
  });
  await writeJson(path.join(PUBLIC_DIR, 'stocks_etfs.us_eu.canonical.ids.json'), {
    schema: 'rv_v7_scope_canonical_ids_v1',
    generated_at: generatedAt,
    scope: 'us_eu_only',
    source: 'public/data/universe/v7/registry/registry.ndjson.gz',
    count: canonicalIds.length,
    counts,
    canonical_ids: canonicalIds,
  });
  await writeJson(path.join(PUBLIC_DIR, 'stocks_etfs.us_eu.scope.json'), {
    schema: 'rv_v7_scope_manifest_v1',
    generated_at: generatedAt,
    scope: 'us_eu_only',
    source: 'public/data/universe/v7/registry/registry.ndjson.gz',
    counts,
    policy: {
      in_scope_regions: ['US', 'EU'],
      region_match_mode: 'country_or_exchange',
      symbol_support_rule: '^[A-Z][A-Z0-9.-]*$',
      duplicate_symbol_resolution: [
        'prefer US over EU',
        'prefer STOCK over ETF',
        'prefer latest last_trade_date',
        'prefer higher avg_volume_30d',
        'prefer higher bars_count',
      ],
    },
  });
  await writeJson(path.join(MIRROR_DIR, 'stocks_etfs.us_eu.rows.json'), {
    schema: 'rv_v7_scope_rows_v1',
    generated_at: generatedAt,
    scope: 'us_eu_only',
    count: selectedRows.length,
    counts,
    items: selectedRows,
  });

  process.stdout.write(`${JSON.stringify({ ok: true, scope: 'us_eu_only', counts }, null, 2)}\n`);
}

await main();
