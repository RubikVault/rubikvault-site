#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseGlobalAssetClasses } from '../../functions/api/_shared/global-asset-classes.mjs';

const ROOT = process.cwd();

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    registryPath: 'public/data/universe/v7/registry/registry.ndjson.gz',
    allowlistPath: 'public/data/universe/v7/ssot/assets.global.canonical.ids.json',
    manifestPath: '',
    outputPath: 'public/data/universe/v7/reports/history_coverage_report.json',
    assetClasses: process.env.RV_GLOBAL_ASSET_CLASSES || 'STOCK,ETF,INDEX',
    targetMarketDate: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    minBars: Number(process.env.RV_HISTORY_COVERAGE_MIN_BARS || 200),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    const readValue = () => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      i += 1;
      return argv[i] || '';
    };
    if (arg === '--registry-path' || arg.startsWith('--registry-path=')) out.registryPath = readValue();
    else if (arg === '--allowlist-path' || arg.startsWith('--allowlist-path=')) out.allowlistPath = readValue();
    else if (arg === '--manifest-path' || arg.startsWith('--manifest-path=')) out.manifestPath = readValue();
    else if (arg === '--output-path' || arg.startsWith('--output-path=')) out.outputPath = readValue();
    else if (arg === '--asset-classes' || arg.startsWith('--asset-classes=')) out.assetClasses = readValue();
    else if (arg === '--target-market-date' || arg.startsWith('--target-market-date=')) out.targetMarketDate = readValue();
    else if (arg === '--min-bars' || arg.startsWith('--min-bars=')) out.minBars = Number(readValue());
  }
  out.minBars = Number.isFinite(out.minBars) && out.minBars > 0 ? Math.floor(out.minBars) : 200;
  return out;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonMaybe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function readNdjsonGz(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDate(value) {
  return String(value || '').trim().slice(0, 10);
}

function pct(count, total) {
  return total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
}

function increment(map, key, by = 1) {
  const safeKey = key || 'UNKNOWN';
  map[safeKey] = (map[safeKey] || 0) + by;
}

function topEntries(map, limit = 40) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function loadAllowlist(filePath) {
  const doc = readJson(filePath);
  const raw = Array.isArray(doc) ? doc : (doc?.canonical_ids || doc?.ids || []);
  return raw.map(normalize).filter(Boolean);
}

function resolveManifestPath(explicitPath) {
  if (explicitPath) return resolvePath(explicitPath);
  const envDir = process.env.RV_GLOBAL_MANIFEST_DIR || '';
  const candidates = [
    envDir ? path.join(envDir, 'pack-manifest.global.json') : '',
    'public/data/eod/history/pack-manifest.global.json',
  ].filter(Boolean).map(resolvePath);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found || candidates[candidates.length - 1];
}

function main() {
  const args = parseArgs();
  const registryPath = resolvePath(args.registryPath);
  const allowlistPath = resolvePath(args.allowlistPath);
  const manifestPath = resolveManifestPath(args.manifestPath);
  const outputPath = resolvePath(args.outputPath);
  const assetClasses = new Set(parseGlobalAssetClasses(args.assetClasses));
  const targetMarketDate = normalizeDate(args.targetMarketDate);

  const scopeIds = loadAllowlist(allowlistPath);
  const scopeSet = new Set(scopeIds);
  const registryRows = readNdjsonGz(registryPath);
  const manifest = readJsonMaybe(manifestPath) || {};
  const manifestIds = new Set(Object.keys(manifest.by_canonical_id || {}).map(normalize));

  const registryById = new Map();
  for (const row of registryRows) {
    const canonicalId = normalize(row?.canonical_id);
    if (!scopeSet.has(canonicalId)) continue;
    const typeNorm = normalize(row?.type_norm);
    if (assetClasses.size > 0 && !assetClasses.has(typeNorm)) continue;
    registryById.set(canonicalId, row);
  }

  const counts = {
    ssot_assets: scopeIds.length,
    registry_scope_rows: registryById.size,
    missing_registry_rows: 0,
    pack_manifest_assets: 0,
    missing_pack_assets: 0,
    bars_zero_or_unknown: 0,
    bars_1_199: 0,
    bars_200_499: 0,
    bars_500_999: 0,
    bars_1000_plus: 0,
    bars_ge_200: 0,
    bars_ge_1000: 0,
    fresh_ge_200: 0,
    stale_ge_200: 0,
  };
  const byType = {};
  const byExchange = {};
  const targetableByExchange = {};
  const missingRegistrySample = [];
  const missingPackSample = [];
  const zeroBarsSample = [];
  const shortBarsSample = [];
  const staleTargetableSample = [];

  for (const canonicalId of scopeIds) {
    const row = registryById.get(canonicalId);
    if (!row) {
      counts.missing_registry_rows += 1;
      if (missingRegistrySample.length < 25) missingRegistrySample.push(canonicalId);
      continue;
    }
    const typeNorm = normalize(row.type_norm) || 'UNKNOWN';
    const exchange = normalize(row.exchange) || canonicalId.split(':')[0] || 'UNKNOWN';
    const bars = Number(row.bars_count || 0);
    const lastTradeDate = normalizeDate(row.last_trade_date);
    const hasPack = manifestIds.has(canonicalId) || Boolean(row?.pointers?.history_pack);

    increment(byType, typeNorm);
    increment(byExchange, exchange);
    if (hasPack) counts.pack_manifest_assets += 1;
    else {
      counts.missing_pack_assets += 1;
      if (missingPackSample.length < 25) missingPackSample.push(canonicalId);
    }

    if (!Number.isFinite(bars) || bars <= 0) {
      counts.bars_zero_or_unknown += 1;
      if (zeroBarsSample.length < 25) zeroBarsSample.push(canonicalId);
    } else if (bars < args.minBars) {
      counts.bars_1_199 += 1;
      if (shortBarsSample.length < 25) {
        shortBarsSample.push({ canonical_id: canonicalId, bars_count: bars, last_trade_date: lastTradeDate || null });
      }
    } else {
      counts.bars_ge_200 += 1;
      increment(targetableByExchange, exchange);
      if (bars < 500) counts.bars_200_499 += 1;
      else if (bars < 1000) counts.bars_500_999 += 1;
      else {
        counts.bars_1000_plus += 1;
        counts.bars_ge_1000 += 1;
      }
      if (targetMarketDate && lastTradeDate >= targetMarketDate) {
        counts.fresh_ge_200 += 1;
      } else if (targetMarketDate) {
        counts.stale_ge_200 += 1;
        if (staleTargetableSample.length < 25) {
          staleTargetableSample.push({ canonical_id: canonicalId, bars_count: bars, last_trade_date: lastTradeDate || null });
        }
      }
    }
  }

  const report = {
    schema: 'rv.history_coverage_report.v1',
    generated_at: new Date().toISOString(),
    target_market_date: targetMarketDate || null,
    min_bars: args.minBars,
    asset_classes: Array.from(assetClasses),
    sources: {
      allowlist: path.relative(ROOT, allowlistPath),
      registry: path.relative(ROOT, registryPath),
      manifest: path.relative(ROOT, manifestPath),
    },
    counts,
    percentages: {
      registry_scope_rows_pct: pct(counts.registry_scope_rows, counts.ssot_assets),
      pack_manifest_assets_pct: pct(counts.pack_manifest_assets, counts.ssot_assets),
      missing_pack_assets_pct: pct(counts.missing_pack_assets, counts.ssot_assets),
      bars_ge_200_pct: pct(counts.bars_ge_200, counts.ssot_assets),
      bars_ge_1000_pct: pct(counts.bars_ge_1000, counts.ssot_assets),
      fresh_ge_200_pct: pct(counts.fresh_ge_200, counts.ssot_assets),
      fresh_of_targetable_pct: pct(counts.fresh_ge_200, counts.bars_ge_200),
    },
    bins: {
      zero_or_unknown: counts.bars_zero_or_unknown,
      one_to_199: counts.bars_1_199,
      two_hundred_to_499: counts.bars_200_499,
      five_hundred_to_999: counts.bars_500_999,
      one_thousand_plus: counts.bars_1000_plus,
    },
    top_exchanges: topEntries(byExchange),
    top_targetable_exchanges: topEntries(targetableByExchange),
    by_type: byType,
    samples: {
      missing_registry: missingRegistrySample,
      missing_pack: missingPackSample,
      zero_or_unknown_bars: zeroBarsSample,
      one_to_199_bars: shortBarsSample,
      stale_targetable: staleTargetableSample,
    },
  };

  writeJsonAtomic(outputPath, report);
  console.log(JSON.stringify({
    output_path: path.relative(ROOT, outputPath),
    ssot_assets: counts.ssot_assets,
    bars_ge_200: counts.bars_ge_200,
    bars_ge_200_pct: report.percentages.bars_ge_200_pct,
    bars_ge_1000: counts.bars_ge_1000,
    bars_ge_1000_pct: report.percentages.bars_ge_1000_pct,
    missing_pack_assets: counts.missing_pack_assets,
  }));
}

main();
