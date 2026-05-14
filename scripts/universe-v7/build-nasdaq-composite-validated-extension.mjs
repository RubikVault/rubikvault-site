#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const DEFAULT_PREVIEW = path.join(ROOT, 'public/data/universe/v7/index-memberships/nasdaq_composite_all.preview.json');
const DEFAULT_REGISTRY = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DEFAULT_SCOPE = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/data/universe/v7/index-memberships/nasdaq_composite_validated_extension.json');
const DEFAULT_REPORT = path.join(ROOT, 'public/data/universe/v7/reports/nasdaq_composite_validated_extension_report.json');

function argValue(name, fallback = '') {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] || fallback : fallback;
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDate(value) {
  const iso = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function toNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readRegistryById(filePath) {
  const rows = zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return new Map(rows.map((row) => [normalize(row?.canonical_id), row]).filter(([id]) => id));
}

function readScopeIds(filePath) {
  const doc = readJson(filePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map(normalize).filter(Boolean));
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function symbolSupported(value) {
  return /^[A-Z0-9][A-Z0-9.\-]*$/.test(String(value || '').trim().toUpperCase());
}

function rejectReason(row, { targetMarketDate, minBars }) {
  if (!row) return 'missing_registry_row';
  if (normalize(row.type_norm) !== 'STOCK') return 'not_stock';
  if (normalize(row.exchange) !== 'US') return 'not_us_exchange';
  if (!symbolSupported(row.symbol)) return 'unsupported_symbol';
  if (toNum(row.bars_count) < minBars) return 'insufficient_bars';
  const lastTradeDate = normalizeDate(row.last_trade_date);
  if (!lastTradeDate || lastTradeDate < targetMarketDate) return 'stale_or_missing_target_eod';
  const historyPack = String(row?.pointers?.history_pack || row?.history_pack || '').trim();
  if (!historyPack) return 'missing_history_pack';
  return null;
}

function main() {
  const previewPath = path.resolve(argValue('--preview-path', DEFAULT_PREVIEW));
  const registryPath = path.resolve(argValue('--registry-path', DEFAULT_REGISTRY));
  const scopePath = path.resolve(argValue('--scope-file', DEFAULT_SCOPE));
  const outputPath = path.resolve(argValue('--output', DEFAULT_OUTPUT));
  const reportPath = path.resolve(argValue('--report-output', DEFAULT_REPORT));
  const targetMarketDate = normalizeDate(argValue('--target-market-date', process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || ''));
  const minBars = Math.max(1, Number(argValue('--min-bars', process.env.RV_NASDAQ_EXTENSION_MIN_BARS || '200')) || 200);
  if (!targetMarketDate) throw new Error('target_market_date_required');

  const preview = readJson(previewPath);
  const registryById = readRegistryById(registryPath);
  const currentScope = readScopeIds(scopePath);
  const previewRows = Array.isArray(preview?.constituents) ? preview.constituents : [];
  const seen = new Set();
  const rejects = {};
  const constituents = [];

  for (const item of previewRows) {
    const canonicalId = normalize(item?.canonical_id);
    if (!canonicalId || seen.has(canonicalId)) continue;
    seen.add(canonicalId);
    const row = registryById.get(canonicalId);
    const reason = rejectReason(row, { targetMarketDate, minBars });
    if (reason) {
      rejects[reason] = (rejects[reason] || 0) + 1;
      continue;
    }
    constituents.push({
      ticker: normalize(row.symbol),
      name: row.name || normalize(row.symbol),
      canonical_id: canonicalId,
      type_norm: 'STOCK',
      exchange: 'US',
      last_trade_date: normalizeDate(row.last_trade_date),
      bars_count: toNum(row.bars_count),
      already_in_scope: currentScope.has(canonicalId),
    });
  }

  constituents.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));
  const extensionCount = constituents.filter((row) => !row.already_in_scope).length;
  const generatedAt = new Date().toISOString();
  const doc = {
    schema: 'rv.index_membership.validated_extension.v1',
    generated_at: generatedAt,
    index_id: 'nasdaq_composite_validated_extension',
    label: 'Nasdaq Composite Validated Extension',
    source_kind: 'historical_preview_plus_eodhd_registry_freshness_validation',
    source_input_path: path.relative(ROOT, previewPath),
    target_market_date: targetMarketDate,
    production_ready: true,
    validation_policy: {
      type_norm: 'STOCK',
      exchange: 'US',
      min_bars: minBars,
      required_last_trade_date: targetMarketDate,
      listed_basis: 'EODHD registry row with fresh target-date EOD history',
    },
    count: constituents.length,
    extension_count: extensionCount,
    unmatched_count: 0,
    constituents,
  };
  const report = {
    schema: 'rv.nasdaq_composite_validated_extension_report.v1',
    generated_at: generatedAt,
    target_market_date: targetMarketDate,
    preview_count: previewRows.length,
    unique_preview_count: seen.size,
    validated_count: constituents.length,
    already_in_scope_count: constituents.length - extensionCount,
    extension_count: extensionCount,
    reject_counts: rejects,
    output: path.relative(ROOT, outputPath),
  };
  writeJsonAtomic(outputPath, doc);
  writeJsonAtomic(reportPath, report);
  process.stdout.write(`${JSON.stringify({ ok: true, ...report }, null, 2)}\n`);
}

main();
