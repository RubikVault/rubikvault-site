#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseGlobalAssetClasses } from '../../functions/api/_shared/global-asset-classes.mjs';

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
const ASIA_COUNTRIES = new Set([
  'CHINA',
  'HONG KONG',
  'INDONESIA',
  'JAPAN',
  'MALAYSIA',
  'SINGAPORE',
  'SOUTH KOREA',
  'TAIWAN',
  'THAILAND',
  'VIETNAM',
]);
const ASIA_EXCHANGES = new Set([
  'BK',
  'JK',
  'KLSE',
  'KO',
  'KQ',
  'SHE',
  'SHG',
  'TO',
  'TW',
  'TWO',
  'VN',
]);
function parseArgs(argv) {
  const out = {
    assetClasses: process.env.RV_GLOBAL_ASSET_CLASSES || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    const next = argv[i + 1];
    if (arg === '--asset-classes' && next) {
      out.assetClasses = next;
      i += 1;
    } else if (arg.startsWith('--asset-classes=')) {
      out.assetClasses = arg.slice(arg.indexOf('=') + 1);
    }
  }
  return out;
}

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

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function toNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function classifyRegion(row = {}) {
  const country = normalize(row.country);
  const exchange = normalize(row.exchange);
  if (US_COUNTRIES.has(country) || US_EXCHANGES.has(exchange)) return 'US';
  if (EU_COUNTRIES.has(country) || EU_EXCHANGES.has(exchange)) return 'EU';
  if (ASIA_COUNTRIES.has(country) || ASIA_EXCHANGES.has(exchange)) return 'ASIA';
  return null;
}

function symbolSupported(symbol) {
  return /^[A-Z0-9][A-Z0-9.\-]*$/.test(symbol);
}

function sortRows(a, b) {
  return String(a.canonical_id || '').localeCompare(String(b.canonical_id || ''));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const allowedTypes = new Set(parseGlobalAssetClasses(options.assetClasses));
  const registryRows = await readRegistryEntries(SOURCE_REGISTRY);
  const selectedRows = registryRows
    .filter((row) => allowedTypes.has(normalize(row?.type_norm)))
    .map((row) => ({
      canonical_id: normalize(row.canonical_id),
      symbol: normalize(row.symbol),
      provider_symbol: row.provider_symbol || null,
      name: row.name || null,
      type_norm: normalize(row.type_norm),
      exchange: normalize(row.exchange) || null,
      mic: row.mic || null,
      country: row.country || null,
      currency: row.currency || null,
      bars_count: toNum(row.bars_count),
      avg_volume_30d: toNum(row.avg_volume_30d),
      last_trade_date: row.last_trade_date || null,
      history_pack: row?.pointers?.history_pack || row?.history_pack || null,
      scope_region: classifyRegion(row),
    }))
    .filter((row) => row.scope_region)
    .filter((row) => row.canonical_id)
    .filter((row) => row.symbol)
    .filter((row) => symbolSupported(row.symbol))
    .sort(sortRows);

  const symbols = [...new Set(selectedRows.map((row) => row.symbol))].sort();
  const canonicalIds = selectedRows.map((row) => row.canonical_id);
  const byType = {};
  for (const type of [...allowedTypes].sort()) {
    byType[type] = selectedRows.filter((row) => row.type_norm === type).length;
  }
  const scopeName = allowedTypes.has('INDEX') ? 'global_stocks_etfs_index' : 'global_stocks_etfs';
  const counts = {
    total_assets: selectedRows.length,
    total_symbols: symbols.length,
    duplicate_symbol_count: Math.max(0, selectedRows.length - symbols.length),
    by_region: {
      US: selectedRows.filter((row) => row.scope_region === 'US').length,
      EU: selectedRows.filter((row) => row.scope_region === 'EU').length,
      ASIA: selectedRows.filter((row) => row.scope_region === 'ASIA').length,
    },
    by_type: byType,
  };

  const generatedAt = nowIso();
  const source = 'public/data/universe/v7/registry/registry.ndjson.gz';
  await writeJson(path.join(PUBLIC_DIR, 'assets.global.symbols.json'), {
    schema: 'rv_v7_scope_symbols_v1',
    generated_at: generatedAt,
    scope: scopeName,
    source,
    count: symbols.length,
    counts,
    symbols,
  });
  await writeJson(path.join(PUBLIC_DIR, 'assets.global.canonical.ids.json'), {
    schema: 'rv_v7_scope_canonical_ids_v1',
    generated_at: generatedAt,
    scope: scopeName,
    source,
    count: canonicalIds.length,
    counts,
    canonical_ids: canonicalIds,
  });
  await writeJson(path.join(PUBLIC_DIR, 'assets.global.scope.json'), {
    schema: 'rv_v7_scope_manifest_v1',
    generated_at: generatedAt,
    scope: scopeName,
    source,
    counts,
    policy: {
      in_scope_regions: ['US', 'EU', 'ASIA'],
      in_scope_asset_types: [...allowedTypes].sort(),
      region_match_mode: 'country_or_exchange',
      symbol_support_rule: '^[A-Z0-9][A-Z0-9.-]*$',
      compatibility_scope: 'stocks_etfs.us_eu.* remains unchanged',
      index_policy: allowedTypes.has('INDEX')
        ? 'INDEX included; UI green requires macro-index contracts to classify non-tradable fundamentals/hist-probs as neutral.'
        : 'INDEX intentionally excluded until Q1, hist-probs, audit, and UI support it end-to-end',
    },
    exchanges: {
      US: [...US_EXCHANGES].sort(),
      EU: [...EU_EXCHANGES].sort(),
      ASIA: [...ASIA_EXCHANGES].sort(),
    },
  });
  await writeJson(path.join(MIRROR_DIR, 'assets.global.rows.json'), {
    schema: 'rv_v7_scope_rows_v1',
    generated_at: generatedAt,
    scope: scopeName,
    count: selectedRows.length,
    counts,
    items: selectedRows,
  });

  process.stdout.write(`${JSON.stringify({ ok: true, scope: scopeName, asset_classes: [...allowedTypes].sort(), counts }, null, 2)}\n`);
}

await main();
