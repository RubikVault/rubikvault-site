#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_REGISTRY = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DEFAULT_SCOPE = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DEFAULT_REFRESH_REPORT = path.join(ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/data/runtime/stock-analyzer-provider-exceptions-latest.json');
const OPERATIONAL_ASSET_CLASSES = new Set(['STOCK', 'ETF', 'INDEX']);

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    targetMarketDate: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    registryPath: DEFAULT_REGISTRY,
    scopePath: DEFAULT_SCOPE,
    refreshReportPath: DEFAULT_REFRESH_REPORT,
    outputPath: DEFAULT_OUTPUT,
    minBars: Number(process.env.RV_PROVIDER_EXCEPTION_MIN_BARS || 200),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    const next = argv[i + 1];
    const read = () => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      i += 1;
      return next;
    };
    if (arg === '--target-market-date' || arg.startsWith('--target-market-date=')) out.targetMarketDate = read();
    else if (arg === '--registry-path' || arg.startsWith('--registry-path=')) out.registryPath = resolvePath(read());
    else if (arg === '--scope-path' || arg.startsWith('--scope-path=')) out.scopePath = resolvePath(read());
    else if (arg === '--refresh-report' || arg.startsWith('--refresh-report=')) out.refreshReportPath = resolvePath(read());
    else if (arg === '--output' || arg.startsWith('--output=')) out.outputPath = resolvePath(read());
    else if (arg === '--min-bars' || arg.startsWith('--min-bars=')) out.minBars = Number(read());
  }
  out.targetMarketDate = isoDate(out.targetMarketDate);
  if (!out.targetMarketDate) throw new Error('target_market_date_required');
  return out;
}

function resolvePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function isoDate(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readNdjsonGz(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function loadScopeIds(scopePath) {
  const doc = readJson(scopePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map((id) => String(id || '').toUpperCase()).filter(Boolean));
}

function assertRefreshEvidence(reportPath, targetMarketDate) {
  const report = readJson(reportPath);
  const status = String(report?.status || '').toLowerCase();
  const toDate = isoDate(report?.to_date || report?.target_market_date);
  const requested = Number(report?.assets_requested || 0);
  const found = Number(report?.assets_found_in_registry || 0);
  const errors = Number(report?.fetch_errors_total || 0);
  if (status !== 'ok') throw new Error(`refresh_report_not_ok:${status}`);
  if (toDate !== targetMarketDate) throw new Error(`refresh_report_target_mismatch:${toDate}:${targetMarketDate}`);
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('refresh_report_assets_requested_missing');
  if (!Number.isFinite(found) || found <= 0) throw new Error('refresh_report_assets_found_missing');
  if (Number.isFinite(errors) && errors > 0) throw new Error(`refresh_report_has_fetch_errors:${errors}`);
  return report;
}

function main() {
  const options = parseArgs();
  const scopeIds = loadScopeIds(options.scopePath);
  const refreshReport = assertRefreshEvidence(options.refreshReportPath, options.targetMarketDate);
  const registryRows = readNdjsonGz(options.registryPath);
  const exceptions = [];
  const byExchange = {};
  const byReason = {};

  for (const row of registryRows) {
    const canonicalId = String(row?.canonical_id || '').toUpperCase();
    if (!scopeIds.has(canonicalId)) continue;
    const assetClass = String(row?.type_norm || row?.asset_class || '').toUpperCase();
    if (!OPERATIONAL_ASSET_CLASSES.has(assetClass)) continue;
    const bars = numberOrZero(row?.bars_count);
    if (bars < options.minBars) continue;
    const lastTradeDate = isoDate(row?.last_trade_date || row?.latest_bar_date || row?.actual_last_trade_date);
    if (!lastTradeDate || lastTradeDate >= options.targetMarketDate) continue;
    const exchange = String(row?.exchange || canonicalId.split(':')[0] || '').toUpperCase();
    const reason = 'provider_no_target_row_after_full_refresh';
    byExchange[exchange] = (byExchange[exchange] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
    exceptions.push({
      canonical_id: canonicalId,
      symbol: row?.symbol || canonicalId.split(':').pop(),
      exchange,
      asset_class: assetClass,
      bars_count: bars,
      last_trade_date: lastTradeDate,
      target_market_date: options.targetMarketDate,
      reason,
      evidence: 'full_universe_eodhd_refresh_ok_no_target_row',
    });
  }

  const doc = {
    schema: 'rv.stock_analyzer.provider_exceptions.v1',
    generated_at: new Date().toISOString(),
    target_market_date: options.targetMarketDate,
    min_bars: options.minBars,
    evidence_source: {
      refresh_report_path: path.relative(ROOT, options.refreshReportPath),
      refresh_report_status: refreshReport.status || null,
      refresh_report_generated_at: refreshReport.generated_at || null,
      refresh_report_assets_requested: refreshReport.assets_requested ?? null,
      refresh_report_assets_fetched_with_data: refreshReport.assets_fetched_with_data ?? null,
      refresh_report_fetch_errors_total: refreshReport.fetch_errors_total ?? null,
    },
    counts: {
      scope_assets: scopeIds.size,
      exceptions: exceptions.length,
      by_exchange: Object.fromEntries(Object.entries(byExchange).sort((a, b) => b[1] - a[1])),
      by_reason: byReason,
    },
    exceptions,
  };
  writeJsonAtomic(options.outputPath, doc);
  process.stdout.write(`[build-stock-analyzer-provider-exceptions] wrote ${path.relative(ROOT, options.outputPath)} exceptions=${exceptions.length}\n`);
}

main();
