#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const DEFAULT_REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DEFAULT_ALLOWLIST_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.symbols.json');
const DEFAULT_OUTPUT_PATH = path.join(ROOT, 'public/data/symbol-resolve.v1.json');
const DEFAULT_LOOKUP_OUTPUT_PATH = path.join(ROOT, 'public/data/symbol-resolve.v1.lookup.json');

function parseArgs(argv) {
  const options = {
    registryPath: DEFAULT_REGISTRY_PATH,
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    lookupOutputPath: DEFAULT_LOOKUP_OUTPUT_PATH,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--registry-path' && next) {
      options.registryPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--allowlist-path' && next) {
      options.allowlistPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--output' && next) {
      options.outputPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--lookup-output' && next) {
      options.lookupOutputPath = path.resolve(ROOT, next);
      i += 1;
    }
  }
  return options;
}

function readAllowlist(filePath) {
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new Set(
      Array.isArray(doc?.symbols)
        ? doc.symbols.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
        : [],
    );
  } catch {
    return null;
  }
}

function readRegistry(filePath) {
  const raw = zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
  return raw
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

function buildAliases(entry) {
  const aliases = new Set();
  for (const value of [
    entry?.canonical_id,
    entry?.symbol,
    entry?.name,
    entry?.display_name,
    entry?.ticker,
  ]) {
    const text = String(value || '').trim();
    if (text) aliases.add(text);
  }
  return [...aliases];
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeJsonAtomicMinified(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function buildSymbolResolveIndex(options = parseArgs(process.argv)) {
  const allowlist = readAllowlist(options.allowlistPath);
  const entries = [];
  const seen = new Set();
  const exact = {};

  for (const row of readRegistry(options.registryPath)) {
    const ticker = String(row?.symbol || '').trim().toUpperCase();
    if (!ticker) continue;
    if (allowlist && !allowlist.has(ticker)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    entries.push({
      ticker,
      name: String(row?.name || row?.display_name || '').trim() || null,
      aliases: buildAliases(row),
      exchange: String(row?.exchange || '').trim().toUpperCase() || null,
      country: String(row?.country || '').trim().toUpperCase() || null,
      canonical_id: String(row?.canonical_id || '').trim().toUpperCase() || null,
      type_norm: String(row?.type_norm || '').trim().toUpperCase() || null,
    });
    const entry = entries[entries.length - 1];
    const packed = [
      entry.ticker,
      entry.name,
      entry.exchange,
      entry.country,
      entry.canonical_id,
      entry.type_norm,
    ];
    const exactKeys = new Set([
      entry.ticker,
      entry.canonical_id,
      entry.exchange && entry.ticker ? `${entry.exchange}:${entry.ticker}` : null,
    ].filter(Boolean));
    for (const key of exactKeys) {
      if (!exact[key]) exact[key] = packed;
    }
  }

  const payload = {
    schema: 'rv.symbol_resolve.v1',
    generated_at: new Date().toISOString(),
    scope: allowlist ? 'us_eu_only' : 'full_registry',
    source_registry_path: path.relative(ROOT, options.registryPath),
    source_allowlist_path: allowlist ? path.relative(ROOT, options.allowlistPath) : null,
    entries,
  };

  writeJsonAtomic(options.outputPath, payload);
  writeJsonAtomicMinified(options.lookupOutputPath, {
    schema: 'rv.symbol_resolve.v1.lookup',
    generated_at: payload.generated_at,
    scope: payload.scope,
    source_registry_path: payload.source_registry_path,
    source_allowlist_path: payload.source_allowlist_path,
    exact,
  });
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSymbolResolveIndex(parseArgs(process.argv));
}
