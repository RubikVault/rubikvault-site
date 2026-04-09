#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const PATHS = {
  registry: path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz'),
  allowlist: path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json'),
  output: path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.json'),
  lookup: path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.lookup.json'),
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonGzLines(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(filePath, payload, spaces = 2) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const text = spaces > 0 ? JSON.stringify(payload, null, spaces) : JSON.stringify(payload);
  fs.writeFileSync(tmp, `${text}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function main() {
  const allowlistDoc = readJson(PATHS.allowlist);
  const allowlist = new Set((allowlistDoc?.canonical_ids || []).map(normalize).filter(Boolean));
  const rows = readJsonGzLines(PATHS.registry);
  const bySymbol = {};
  const byCanonicalId = {};
  const lookupBySymbol = {};
  const lookupByCanonicalId = {};
  const packFiles = new Set();

  for (const row of rows) {
    const canonicalId = normalize(row?.canonical_id);
    if (!allowlist.has(canonicalId)) continue;
    const symbol = normalize(row?.symbol);
    const historyPack = String(row?.pointers?.history_pack || row?.history_pack || '').trim();
    if (!symbol || !historyPack) continue;
    const pack = historyPack.replace(/^history\//, '');
    const entry = {
      canonical_id: canonicalId,
      symbol,
      exchange: normalize(row?.exchange) || null,
      pack,
      last_trade_date: String(row?.last_trade_date || '').slice(0, 10) || null,
    };
    bySymbol[symbol] = entry;
    byCanonicalId[canonicalId] = entry;
    lookupBySymbol[symbol] = [canonicalId, pack];
    lookupByCanonicalId[canonicalId] = [symbol, pack];
    packFiles.add(pack);
  }

  writeJson(PATHS.output, {
    schema: 'rv.history_pack_manifest.us_eu.v1',
    generated_at: new Date().toISOString(),
    source: {
      registry: path.relative(ROOT, PATHS.registry),
      allowlist: path.relative(ROOT, PATHS.allowlist),
    },
    counts: {
      symbols: Object.keys(bySymbol).length,
      canonical_ids: Object.keys(byCanonicalId).length,
      unique_pack_files: packFiles.size,
    },
    by_symbol: bySymbol,
    by_canonical_id: byCanonicalId,
  });

  writeJson(PATHS.lookup, {
    schema: 'rv.history_pack_manifest.us_eu.lookup.v1',
    generated_at: new Date().toISOString(),
    counts: {
      symbols: Object.keys(lookupBySymbol).length,
      canonical_ids: Object.keys(lookupByCanonicalId).length,
      unique_pack_files: packFiles.size,
    },
    by_symbol: lookupBySymbol,
    by_canonical_id: lookupByCanonicalId,
  }, 0);
}

main();
