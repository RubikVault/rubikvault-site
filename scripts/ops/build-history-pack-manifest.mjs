#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseGlobalAssetClasses } from '../../functions/api/_shared/global-asset-classes.mjs';

const ROOT = process.cwd();

function parseArgs(argv) {
  const out = {
    scope: 'us-eu',
    registry: 'public/data/universe/v7/registry/registry.ndjson.gz',
    allowlist: '',
    output: '',
    lookup: '',
    assetClasses: process.env.RV_GLOBAL_ASSET_CLASSES || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    const readValue = () => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      i += 1;
      return argv[i];
    };
    if (arg === '--scope' || arg.startsWith('--scope=')) out.scope = readValue();
    else if (arg === '--registry-path' || arg.startsWith('--registry-path=')) out.registry = readValue();
    else if (arg === '--allowlist-path' || arg.startsWith('--allowlist-path=')) out.allowlist = readValue();
    else if (arg === '--output-path' || arg.startsWith('--output-path=')) out.output = readValue();
    else if (arg === '--lookup-path' || arg.startsWith('--lookup-path=')) out.lookup = readValue();
    else if (arg === '--asset-classes' || arg.startsWith('--asset-classes=')) out.assetClasses = readValue();
  }
  out.scope = String(out.scope || 'us-eu').trim().toLowerCase();
  if (!['us-eu', 'global'].includes(out.scope)) {
    throw new Error(`unsupported_scope:${out.scope}`);
  }
  if (!out.allowlist) {
    out.allowlist = out.scope === 'global'
      ? 'public/data/universe/v7/ssot/assets.global.canonical.ids.json'
      : 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json';
  }
  if (!out.output) {
    // RV_GLOBAL_MANIFEST_DIR: NAS sets this to $NAS_OPS_ROOT/pipeline-artifacts/manifests/
    // to keep the 40 MB global manifest out of public/ and away from the Pages deploy bundle.
    // us-eu manifest always stays in public/ — it is served at runtime.
    const globalManifestDir = process.env.RV_GLOBAL_MANIFEST_DIR;
    out.output = out.scope === 'global'
      ? (globalManifestDir ? path.join(globalManifestDir, 'pack-manifest.global.json') : 'public/data/eod/history/pack-manifest.global.json')
      : 'public/data/eod/history/pack-manifest.us-eu.json';
  }
  if (!out.lookup) {
    const globalManifestDir = process.env.RV_GLOBAL_MANIFEST_DIR;
    out.lookup = out.scope === 'global'
      ? (globalManifestDir ? path.join(globalManifestDir, 'pack-manifest.global.lookup.json') : 'public/data/eod/history/pack-manifest.global.lookup.json')
      : 'public/data/eod/history/pack-manifest.us-eu.lookup.json';
  }
  return out;
}

function resolveRepoPath(value) {
  const candidate = path.resolve(ROOT, value);
  return path.isAbsolute(value) ? value : candidate;
}

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
  const args = parseArgs(process.argv.slice(2));
  const assetClasses = parseGlobalAssetClasses(args.assetClasses);
  const registryPath = resolveRepoPath(args.registry);
  const allowlistPath = resolveRepoPath(args.allowlist);
  const outputPath = resolveRepoPath(args.output);
  const lookupPath = resolveRepoPath(args.lookup);
  const allowlistDoc = readJson(allowlistPath);
  const allowlist = new Set((allowlistDoc?.canonical_ids || allowlistDoc?.ids || []).map(normalize).filter(Boolean));
  const rows = readJsonGzLines(registryPath);
  const bySymbol = {};
  const byCanonicalId = {};
  const lookupBySymbol = {};
  const lookupByCanonicalId = {};
  const packFiles = new Set();
  const missingPackCanonicalIds = [];

  for (const row of rows) {
    const canonicalId = normalize(row?.canonical_id);
    if (!allowlist.has(canonicalId)) continue;
    const symbol = normalize(row?.symbol);
    const historyPack = String(row?.pointers?.history_pack || row?.history_pack || '').trim();
    if (!symbol || !historyPack) {
      missingPackCanonicalIds.push(canonicalId);
      continue;
    }
    const pack = historyPack.replace(/^history\//, '');
    const entry = {
      canonical_id: canonicalId,
      symbol,
      exchange: normalize(row?.exchange) || null,
      type_norm: normalize(row?.type_norm) || null,
      pack,
      last_trade_date: String(row?.last_trade_date || '').slice(0, 10) || null,
      pack_sha256: String(row?.pointers?.pack_sha256 || '').trim() || null,
      history_effective_sha256: String(row?.pointers?.history_effective_sha256 || row?.pointers?.pack_sha256 || '').trim() || null,
    };
    byCanonicalId[canonicalId] = entry;
    if (!bySymbol[symbol]) bySymbol[symbol] = [];
    bySymbol[symbol].push(entry);
    lookupByCanonicalId[canonicalId] = [symbol, pack];
    if (!lookupBySymbol[symbol]) lookupBySymbol[symbol] = [];
    lookupBySymbol[symbol].push([canonicalId, pack]);
    packFiles.add(pack);
  }

  const generatedAt = new Date().toISOString();
  writeJson(outputPath, {
    schema: `rv.history_pack_manifest.${args.scope}.v1`,
    generated_at: generatedAt,
    scope: args.scope,
    source: {
      registry: path.relative(ROOT, registryPath),
      allowlist: path.relative(ROOT, allowlistPath),
      asset_classes: assetClasses,
    },
    counts: {
      allowlist_canonical_ids: allowlist.size,
      symbols: Object.keys(bySymbol).length,
      canonical_ids: Object.keys(byCanonicalId).length,
      unique_pack_files: packFiles.size,
      missing_pack_canonical_ids: missingPackCanonicalIds.length,
    },
    asset_classes: assetClasses,
    by_canonical_id: byCanonicalId,
    missing_pack_canonical_ids: missingPackCanonicalIds.slice(0, 1000),
  }, 0); // compact JSON — must stay under CF 25 MiB per-file limit

  writeJson(lookupPath, {
    schema: `rv.history_pack_manifest.${args.scope}.lookup.v1`,
    generated_at: generatedAt,
    scope: args.scope,
    counts: {
      allowlist_canonical_ids: allowlist.size,
      symbols: Object.keys(lookupBySymbol).length,
      canonical_ids: Object.keys(lookupByCanonicalId).length,
      unique_pack_files: packFiles.size,
      missing_pack_canonical_ids: missingPackCanonicalIds.length,
    },
    asset_classes: assetClasses,
    by_symbol: lookupBySymbol,
    by_canonical_id: lookupByCanonicalId,
  }, 0);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    scope: args.scope,
    output: path.relative(ROOT, outputPath),
    lookup: path.relative(ROOT, lookupPath),
    counts: {
      allowlist_canonical_ids: allowlist.size,
      canonical_ids: Object.keys(byCanonicalId).length,
      unique_pack_files: packFiles.size,
      missing_pack_canonical_ids: missingPackCanonicalIds.length,
    },
    asset_classes: assetClasses,
  }, null, 2)}\n`);
}

main();
