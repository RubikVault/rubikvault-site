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
    auditMode: null,        // path to degraded-asset-audit-latest.json
    auditScopeOnly: false,
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
    else if (arg === '--audit-mode' || arg.startsWith('--audit-mode=')) {
      // F12: when set, narrow scope to canonical_ids in the audit artifact's
      // provider_exception bucket. Probes use the existing refresh-report
      // evidence (no new EODHD calls — kritik's concern about hammering rate
      // limits stays satisfied) and emit to a private path so the bundle does
      // not leak audit-mode output as production exceptions.
      out.auditMode = resolvePath(read());
      out.auditScopeOnly = true;
    }
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
  fs.writeFileSync(tmp, `${JSON.stringify(doc)}\n`, 'utf8');
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
  const changed = Number(report?.assets_changed || 0);
  const errors = Number(report?.fetch_errors_total || 0);
  const partialOk = ['provider_blocked_partial', 'budget_stopped_partial'].includes(status)
    && String(report?.provider_blocked_reason || '').toLowerCase() === 'bulk_yield_below_threshold'
    && Number.isFinite(changed)
    && changed > 0
    && (!Number.isFinite(errors) || errors === 0);
  if (status !== 'ok' && !partialOk) throw new Error(`refresh_report_not_ok:${status}`);
  if (toDate !== targetMarketDate) throw new Error(`refresh_report_target_mismatch:${toDate}:${targetMarketDate}`);
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('refresh_report_assets_requested_missing');
  if (!Number.isFinite(found) || found <= 0) throw new Error('refresh_report_assets_found_missing');
  const samples = extractRefreshErrors(report);
  if (Number.isFinite(errors) && errors > 0 && samples.length < errors) {
    throw new Error(`refresh_report_fetch_errors_without_samples:${errors}:${samples.length}`);
  }
  return report;
}

function extractRefreshErrors(report) {
  const rows = [
    ...(Array.isArray(report?.fetch_errors) ? report.fetch_errors : []),
    ...(Array.isArray(report?.errors) ? report.errors : []),
    ...(Array.isArray(report?.error_samples) ? report.error_samples : []),
  ];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const canonicalId = String(row?.canonical_id || row?.asset_id || '').toUpperCase();
    if (!canonicalId || seen.has(canonicalId)) continue;
    seen.add(canonicalId);
    out.push({
      canonical_id: canonicalId,
      error: String(row?.error || row?.reason || 'refresh_error').trim() || 'refresh_error',
      message: row?.message ? String(row.message) : null,
    });
  }
  return out;
}

function assetClassFromCanonicalId(canonicalId) {
  const id = String(canonicalId || '').toUpperCase();
  if (id.endsWith('.INDX')) return 'INDEX';
  return 'UNKNOWN';
}

function sanitizeReason(value) {
  return String(value || 'refresh_error')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'refresh_error';
}

function loadAuditBucket(auditPath) {
  if (!auditPath) return null;
  let audit;
  try {
    audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  } catch (err) {
    throw new Error(`audit-mode: cannot read ${auditPath}: ${err?.message || err}`);
  }
  const bucket = audit?.buckets?.provider_exception;
  const ids = new Set();
  for (const id of bucket?.canonical_ids || []) ids.add(String(id).toUpperCase());
  return { ids, audit };
}

function main() {
  const options = parseArgs();
  const scopeIds = loadScopeIds(options.scopePath);
  const refreshReport = assertRefreshEvidence(options.refreshReportPath, options.targetMarketDate);
  const registryRows = readNdjsonGz(options.registryPath);
  const auditBucket = loadAuditBucket(options.auditMode);
  // F12 audit-mode: shrink the candidate set to the degraded audit's
  // provider_exception bucket. Use the existing refresh-report evidence
  // (no live EODHD probe — kritik's batched/locked concern stays valid:
  // the underlying refresh already happened with the EODHD lock during
  // market_data_refresh, so we trust that artifact instead of double-
  // fetching). Output goes to a private path by default.
  const auditOnlyIds = options.auditScopeOnly ? auditBucket?.ids : null;
  if (options.auditScopeOnly) {
    process.stderr.write(`[audit-mode] narrowing scope to ${auditOnlyIds?.size || 0} canonical_ids from ${path.relative(ROOT, options.auditMode)}\n`);
    if (!auditOnlyIds || auditOnlyIds.size === 0) {
      process.stderr.write('[audit-mode] no provider_exception bucket assets to classify; writing empty audit report.\n');
    }
    if (options.outputPath === DEFAULT_OUTPUT) {
      // Audit-mode writes private so we never overwrite the production
      // provider-exceptions artifact accidentally.
      options.outputPath = path.join(ROOT, 'var/private/ops/degraded-provider-probe-latest.json');
    }
  }
  const exceptions = [];
  const exceptionIds = new Set();
  const byExchange = {};
  const byReason = {};

  for (const row of registryRows) {
    const canonicalId = String(row?.canonical_id || '').toUpperCase();
    if (!scopeIds.has(canonicalId)) continue;
    if (auditOnlyIds && !auditOnlyIds.has(canonicalId)) continue;
    const assetClass = String(row?.type_norm || row?.asset_class || '').toUpperCase();
    if (!OPERATIONAL_ASSET_CLASSES.has(assetClass)) continue;
    const bars = numberOrZero(row?.bars_count);
    const lastTradeDate = isoDate(row?.last_trade_date || row?.latest_bar_date || row?.actual_last_trade_date);
    const staleAfterRefresh = Boolean(lastTradeDate && lastTradeDate < options.targetMarketDate);
    const insufficientHistory = bars < options.minBars;
    if (!staleAfterRefresh && !insufficientHistory) continue;
    const exchange = String(row?.exchange || canonicalId.split(':')[0] || '').toUpperCase();
    const reason = staleAfterRefresh
      ? 'provider_no_target_row_after_full_refresh'
      : 'provider_insufficient_history_after_full_refresh';
    byExchange[exchange] = (byExchange[exchange] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
    exceptionIds.add(canonicalId);
    exceptions.push({
      canonical_id: canonicalId,
      bars_count: bars,
      last_trade_date: lastTradeDate,
      reason,
    });
  }

  for (const error of extractRefreshErrors(refreshReport)) {
    const canonicalId = error.canonical_id;
    if (!scopeIds.has(canonicalId) || exceptionIds.has(canonicalId)) continue;
    if (auditOnlyIds && !auditOnlyIds.has(canonicalId)) continue;
    const exchange = String(canonicalId.split(':')[0] || '').toUpperCase();
    const reason = `refresh_report_${sanitizeReason(error.error)}`;
    byExchange[exchange] = (byExchange[exchange] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
    exceptionIds.add(canonicalId);
    exceptions.push({
      canonical_id: canonicalId,
      bars_count: null,
      last_trade_date: null,
      reason,
    });
  }

  const doc = {
    schema: options.auditScopeOnly
      ? 'rv.stock_analyzer.provider_exceptions.audit.v1'
      : 'rv.stock_analyzer.provider_exceptions.v1',
    generated_at: new Date().toISOString(),
    target_market_date: options.targetMarketDate,
    min_bars: options.minBars,
    audit_mode: options.auditScopeOnly,
    audit_source_path: options.auditScopeOnly ? path.relative(ROOT, options.auditMode) : null,
    audit_scope_size: options.auditScopeOnly ? (auditOnlyIds?.size || 0) : null,
    evidence_source: {
      refresh_report_path: path.relative(ROOT, options.refreshReportPath),
      refresh_report_status: refreshReport.status || null,
      refresh_report_generated_at: refreshReport.generated_at || null,
      refresh_report_assets_requested: refreshReport.assets_requested ?? null,
      refresh_report_assets_fetched_with_data: refreshReport.assets_fetched_with_data ?? null,
      refresh_report_fetch_errors_total: refreshReport.fetch_errors_total ?? null,
      refresh_report_fetch_error_samples: extractRefreshErrors(refreshReport).slice(0, 25),
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
