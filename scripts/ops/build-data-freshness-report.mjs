#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS,
  normalizeDateId,
} from '../../functions/api/_shared/fundamentals-scope.mjs';

const ROOT = process.cwd();
const CANONICAL_LABEL_WINDOW_DAYS = 30; // Allow up to 30 trading days canonical label lag (structural QuantLab delay)
const MIN_REQUIRED_HIST_BARS = 60;
const HIST_PROBS_INACTIVE_TOLERANCE_TRADING_DAYS = 20;
const PATHS = {
  scopeRows: path.join(ROOT, 'mirrors/universe-v7/ssot/stocks_etfs.us_eu.rows.json'),
  scopeSymbols: path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.symbols.json'),
  scopeCanonicalIds: path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json'),
  refreshReport: path.join(ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json'),
  deltaLatestSuccess: path.join('/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/q1_daily_delta_ingest/latest_success.json'),
  quantlabOperational: path.join(ROOT, 'public/data/quantlab/status/operational-status.json'),
  histProbsSummary: path.join(ROOT, 'public/data/hist-probs/run-summary.json'),
  histProbsRegime: path.join(ROOT, 'public/data/hist-probs/regime-daily.json'),
  histProbsDir: path.join(ROOT, 'public/data/hist-probs'),
  histProbsNoData: path.join(ROOT, 'public/data/hist-probs/no-data-tickers.json'),
  forecast: path.join(ROOT, 'public/data/forecast/latest.json'),
  scientific: path.join(ROOT, 'public/data/supermodules/scientific-summary.json'),
  snapshot: path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'),
  fundamentalsIndex: path.join(ROOT, 'public/data/fundamentals/_index.json'),
  fundamentalsScope: path.join(ROOT, 'public/data/fundamentals/_scope.json'),
  fundamentalsDir: path.join(ROOT, 'public/data/fundamentals'),
  audit: path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  output: path.join(ROOT, 'public/data/reports/data-freshness-latest.json'),
};

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function ageCalendarDays(value, referenceDate) {
  if (!value || !referenceDate) return null;
  const a = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(referenceDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function tradingDaysBetween(value, referenceDate) {
  if (!value || !referenceDate) return null;
  const older = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  const newer = new Date(`${String(referenceDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime()) || newer <= older) return 0;
  let count = 0;
  const cursor = new Date(older);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= newer) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function latestFileSet(dirPath, exclude = []) {
  try {
    return new Set(
      fs.readdirSync(dirPath)
        .filter((name) => name.endsWith('.json') && !exclude.includes(name))
        .map((name) => name.replace(/\.json$/i, '').toUpperCase()),
    );
  } catch {
    return new Set();
  }
}

function latestJsonDocumentDate(dirPath, exclude = []) {
  let latestValue = null;
  try {
    for (const name of fs.readdirSync(dirPath)) {
      if (!name.endsWith('.json') || exclude.includes(name)) continue;
      const filePath = path.join(dirPath, name);
      let candidate = null;
      try {
        const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        candidate = String(doc?.updatedAt || doc?.asOf || doc?.date || '').trim() || null;
      } catch {}
      if (!candidate) {
        try {
          candidate = new Date(fs.statSync(filePath).mtimeMs).toISOString();
        } catch {}
      }
      if (candidate && (!latestValue || Date.parse(candidate) > Date.parse(latestValue))) {
        latestValue = candidate;
      }
    }
  } catch {}
  return latestValue;
}

function buildNoDataTickerSet(noDataDoc) {
  const tickers = Array.isArray(noDataDoc?.tickers) ? noDataDoc.tickers : [];
  return new Set(tickers.map((row) => String(row?.symbol || '').trim().toUpperCase()).filter(Boolean));
}

function analyzeHistProbs(scopeRows, histDir, fallbackExpectedEod, noDataTickers) {
  const result = {
    fresh_count: 0,
    stale_count: 0,
    missing_count: 0,
    inactive_excluded_count: 0,
    sample_tickers: [],
    latest_dates: [],
  };
  for (const row of scopeRows) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    if (Number(row?.bars_count || 0) < MIN_REQUIRED_HIST_BARS) continue;
    if (noDataTickers?.has(symbol)) continue;
    const expectedDate = String(row?.last_trade_date || fallbackExpectedEod || '').slice(0, 10) || null;
    const inactiveLagTradingDays = tradingDaysBetween(expectedDate, fallbackExpectedEod);
    if (inactiveLagTradingDays != null && inactiveLagTradingDays > HIST_PROBS_INACTIVE_TOLERANCE_TRADING_DAYS) {
      result.inactive_excluded_count += 1;
      continue;
    }
    const filePath = path.join(histDir, `${symbol}.json`);
    if (!fs.existsSync(filePath)) {
      result.missing_count += 1;
      if (result.sample_tickers.length < 10) result.sample_tickers.push(symbol);
      continue;
    }
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const latestDate = String(doc?.latest_date || '').slice(0, 10) || null;
      if (latestDate) result.latest_dates.push(latestDate);
      // Exclude tickers whose file's latest_date is far behind the expected EOD —
      // these are runtime-inactive tickers (same >20T-day criterion as turbo uses).
      const fileLagTradingDays = tradingDaysBetween(latestDate, fallbackExpectedEod);
      if (fileLagTradingDays != null && fileLagTradingDays > HIST_PROBS_INACTIVE_TOLERANCE_TRADING_DAYS) {
        result.inactive_excluded_count += 1;
        continue;
      }
      if (latestDate && expectedDate && latestDate >= expectedDate) {
        result.fresh_count += 1;
      } else {
        result.stale_count += 1;
        if (result.sample_tickers.length < 10) result.sample_tickers.push(symbol);
      }
    } catch {
      result.stale_count += 1;
      if (result.sample_tickers.length < 10) result.sample_tickers.push(symbol);
    }
  }
  result.data_asof = result.latest_dates.length ? result.latest_dates.sort().slice(-1)[0] : null;
  delete result.latest_dates;
  return result;
}

function analyzeFundamentalsScope(scopeDoc, fundamentalsDir, expectedEod) {
  const members = Array.isArray(scopeDoc?.members) ? scopeDoc.members : [];
  const freshnessLimit = Number(scopeDoc?.freshness_limit_trading_days || DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS);
  const result = {
    scope_total: members.length,
    expected_total: 0,
    fresh_count: 0,
    stale_count: 0,
    missing_count: 0,
    sample_tickers: [],
    data_asof: null,
    freshness_limit_trading_days: freshnessLimit,
  };

  for (const member of members) {
    if (member?.coverage_expected !== true) continue;
    result.expected_total += 1;
    const ticker = String(member?.ticker || '').trim().toUpperCase();
    if (!ticker) continue;
    const filePath = path.join(fundamentalsDir, `${ticker}.json`);
    if (!fs.existsSync(filePath)) {
      result.missing_count += 1;
      if (result.sample_tickers.length < 10) result.sample_tickers.push(ticker);
      continue;
    }
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const updatedAt = normalizeDateId(doc?.updatedAt || doc?.asOf || doc?.date);
      if (updatedAt && (!result.data_asof || updatedAt > result.data_asof)) result.data_asof = updatedAt;
      const lagTradingDays = tradingDaysBetween(updatedAt, expectedEod);
      if (updatedAt && (lagTradingDays ?? Infinity) <= freshnessLimit) {
        result.fresh_count += 1;
      } else {
        result.stale_count += 1;
        if (result.sample_tickers.length < 10) result.sample_tickers.push(ticker);
      }
    } catch {
      result.stale_count += 1;
      if (result.sample_tickers.length < 10) result.sample_tickers.push(ticker);
    }
  }

  return result;
}

function buildFamily({
  family_id,
  affected_scope = 'US+EU',
  expected_eod = null,
  data_asof = null,
  fresh_count = null,
  stale_count = null,
  missing_count = null,
  sample_tickers = [],
  healthy = false,
  severity = healthy ? 'ok' : 'critical',
  verification_mode = 'artifact_summary',
  fix_commands = [],
}) {
  return {
    family_id,
    affected_scope,
    expected_eod,
    data_asof,
    fresh_count,
    stale_count,
    missing_count,
    sample_tickers,
    healthy,
    severity,
    verification_mode,
    fix_commands,
  };
}

function main() {
  const scopeRowsDoc = readJson(PATHS.scopeRows);
  const scopeSymbolsDoc = readJson(PATHS.scopeSymbols);
  const scopeRows = Array.isArray(scopeRowsDoc?.items) ? scopeRowsDoc.items : [];
  const scopeSymbols = scopeRows.length
    ? scopeRows.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean)
    : (Array.isArray(scopeSymbolsDoc?.symbols) ? scopeSymbolsDoc.symbols.map((row) => String(row || '').toUpperCase()).filter(Boolean) : []);
  const scopeStocks = scopeRows.filter((row) => String(row.type_norm || '').toUpperCase() === 'STOCK');
  const refreshReport = readJson(PATHS.refreshReport);
  const deltaLatestSuccess = readJson(PATHS.deltaLatestSuccess);
  const quantlabOperational = readJson(PATHS.quantlabOperational);
  const histSummary = readJson(PATHS.histProbsSummary);
  const histRegime = readJson(PATHS.histProbsRegime);
  const histNoDataDoc = readJson(PATHS.histProbsNoData);
  const forecast = readJson(PATHS.forecast);
  const scientific = readJson(PATHS.scientific);
  const snapshot = readJson(PATHS.snapshot);
  const fundamentalsIndex = readJson(PATHS.fundamentalsIndex);
  const fundamentalsScope = readJson(PATHS.fundamentalsScope);
  const audit = readJson(PATHS.audit);

  const expectedEod = refreshReport?.to_date
    || forecast?.data?.asof
    || snapshot?.meta?.data_asof
    || histRegime?.date
    || null;

  const fundamentalsFiles = latestFileSet(PATHS.fundamentalsDir, ['_index.json', '_scope.json']);
  const fundamentalsLatestFileAt = latestJsonDocumentDate(PATHS.fundamentalsDir, ['_index.json', '_scope.json']);
  const fundamentalsGeneratedAt = [fundamentalsIndex?.generated_at, fundamentalsLatestFileAt]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .slice(-1)[0] || null;
  const fundamentalsAgeDays = ageCalendarDays(fundamentalsGeneratedAt, expectedEod);
  const fundamentalsPublishedCount = Number(fundamentalsIndex?.published_existing) > 0
    ? Number(fundamentalsIndex.published_existing)
    : fundamentalsFiles.size;
  const fundamentalsScopeAnalysis = analyzeFundamentalsScope(fundamentalsScope, PATHS.fundamentalsDir, expectedEod);

  const histDate = histRegime?.date || histSummary?.regime_date || null;
  const scientificAsOf = scientific?.source_meta?.asof || String(scientific?.generated_at || '').slice(0, 10) || null;
  const scientificStaleDays = ageCalendarDays(scientificAsOf, expectedEod);
  const histNoDataTickers = buildNoDataTickerSet(histNoDataDoc);
  const histAnalysis = analyzeHistProbs(scopeRows, PATHS.histProbsDir, expectedEod, histNoDataTickers);
  const auditFamilies = Array.isArray(audit?.failure_families) ? audit.failure_families : [];
  const auditCriticalFamilies = auditFamilies.filter((family) => String(family?.severity || '').toLowerCase() === 'critical');
  const auditCriticalAssets = auditCriticalFamilies.reduce((sum, family) => sum + Number(family?.affected_assets || 0), 0);

  const rawBars = quantlabOperational?.rawBars || {};
  const rawAnyDataDate = rawBars.latestAnyRequiredDataDate || null;
  const rawCanonicalLagDays = tradingDaysBetween(rawBars.latestCanonicalRequiredDataDate, rawAnyDataDate);
  const rawCanonicalExcessLag = rawCanonicalLagDays != null
    ? Math.max(0, rawCanonicalLagDays - CANONICAL_LABEL_WINDOW_DAYS)
    : null;
  const rawAnyStaleDays = ageCalendarDays(rawAnyDataDate, expectedEod);
  const families = [
    buildFamily({
      family_id: 'market_history',
      expected_eod: expectedEod,
      data_asof: refreshReport?.to_date || null,
      fresh_count: refreshReport?.assets_fetched_with_data ?? null,
      stale_count: 0,
      missing_count: refreshReport?.assets_requested != null && refreshReport?.assets_fetched_with_data != null
        ? Math.max(0, Number(refreshReport.assets_requested) - Number(refreshReport.assets_fetched_with_data))
        : null,
      healthy: Boolean(refreshReport?.to_date),
      fix_commands: [
        'python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --from-date <YYYY-MM-DD>',
      ],
    }),
    buildFamily({
      family_id: 'q1_delta',
      expected_eod: expectedEod,
      data_asof: deltaLatestSuccess?.ingest_date || null,
      fresh_count: deltaLatestSuccess?.reconciliation?.rows_emitted_delta ?? null,
      stale_count: ageCalendarDays(deltaLatestSuccess?.ingest_date, expectedEod),
      missing_count: null,
      healthy: Boolean(deltaLatestSuccess?.updated_at) && ageCalendarDays(deltaLatestSuccess?.ingest_date, expectedEod) <= 1,
      fix_commands: ['python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>'],
    }),
    buildFamily({
      family_id: 'quantlab_raw',
      expected_eod: expectedEod,
      data_asof: rawAnyDataDate,
      fresh_count: (rawAnyStaleDays ?? Infinity) <= 1 && (rawCanonicalExcessLag ?? 0) === 0 ? scopeSymbols.length : 0,
      stale_count: (rawAnyStaleDays ?? Infinity) <= 1 && (rawCanonicalExcessLag ?? 0) === 0 ? 0 : scopeSymbols.length,
      missing_count: 0,
      healthy: Boolean(rawAnyDataDate) && (rawAnyStaleDays ?? Infinity) <= 1 && (rawCanonicalExcessLag ?? Infinity) === 0,
      verification_mode: 'operational_status_label_window',
      fix_commands: ['node scripts/quantlab/build_quantlab_v4_daily_report.mjs'],
    }),
    buildFamily({
      family_id: 'hist_probs',
      expected_eod: expectedEod,
      data_asof: histAnalysis.data_asof || histDate,
      fresh_count: histAnalysis.fresh_count,
      stale_count: histAnalysis.stale_count,
      missing_count: histAnalysis.missing_count,
      sample_tickers: histAnalysis.sample_tickers,
      healthy: histAnalysis.missing_count === 0
        && histAnalysis.stale_count === 0
        && (histSummary?.tickers_remaining ?? 1) === 0
        && (histSummary?.tickers_errors ?? 1) === 0
        && ['ETF', 'STOCK'].every((cls) => (histSummary?.asset_classes || []).includes(cls)),
      severity: histAnalysis.missing_count === 0
        && histAnalysis.stale_count === 0
        && (histSummary?.tickers_remaining ?? 1) === 0
        && (histSummary?.tickers_errors ?? 1) === 0
        && ['ETF', 'STOCK'].every((cls) => (histSummary?.asset_classes || []).includes(cls))
        ? 'ok'
        : 'critical',
      verification_mode: 'per_symbol_latest_date',
      fix_commands: ['NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs'],
      inactive_excluded_count: histAnalysis.inactive_excluded_count,
    }),
    buildFamily({
      family_id: 'forecast',
      expected_eod: expectedEod,
      data_asof: forecast?.data?.asof || null,
      fresh_count: forecast?.data?.forecasts?.length ?? null,
      stale_count: 0,
      missing_count: forecast?.ok === false ? scopeSymbols.length : 0,
      healthy: Boolean(forecast?.data?.asof),
      fix_commands: ['node scripts/forecast/run_daily.mjs'],
    }),
    buildFamily({
      family_id: 'scientific',
      expected_eod: expectedEod,
      data_asof: scientificAsOf,
      fresh_count: Array.isArray(scientific?.strong_signals) ? scientific.strong_signals.length : null,
      stale_count: (scientificStaleDays ?? Infinity) > 1 ? scopeSymbols.length : 0,
      missing_count: scientific ? 0 : scopeSymbols.length,
      healthy: Boolean(scientificAsOf) && (scientificStaleDays ?? Infinity) <= 1,
      fix_commands: ['node scripts/build-scientific-summary.mjs'],
    }),
    buildFamily({
      family_id: 'snapshot',
      expected_eod: expectedEod,
      data_asof: snapshot?.meta?.data_asof || null,
      fresh_count: snapshot?.meta?.rows_emitted?.total ?? null,
      stale_count: 0,
      missing_count: snapshot ? 0 : scopeSymbols.length,
      healthy: Boolean(snapshot?.meta?.data_asof),
      fix_commands: ['NODE_OPTIONS=--max-old-space-size=8192 node scripts/build-best-setups-v4.mjs'],
    }),
    buildFamily({
      family_id: 'stock_analyzer_universe_audit',
      expected_eod: expectedEod,
      data_asof: audit?.generated_at || null,
      fresh_count: audit?.summary?.healthy_assets ?? null,
      stale_count: auditCriticalAssets,
      missing_count: 0,
      sample_tickers: (audit?.samples?.failing_assets || []).slice(0, 10).map((row) => row.ticker),
      // Use release_eligible (artifact-only gate) — live canary critical families are not blocking
      healthy: audit?.summary?.full_universe === true && audit?.summary?.release_eligible === true,
      verification_mode: 'allowlist_universe_audit',
      fix_commands: [
        'node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --asset-classes STOCK,ETF --max-tickers 0 --concurrency 12 --timeout-ms 30000',
      ],
    }),
    buildFamily({
      family_id: 'fundamentals_scope',
      expected_eod: expectedEod,
      data_asof: fundamentalsScopeAnalysis.data_asof || fundamentalsGeneratedAt,
      fresh_count: fundamentalsScopeAnalysis.fresh_count,
      stale_count: fundamentalsScopeAnalysis.stale_count,
      missing_count: fundamentalsScopeAnalysis.missing_count,
      sample_tickers: fundamentalsScopeAnalysis.sample_tickers,
      healthy: fundamentalsScopeAnalysis.expected_total > 0
        && fundamentalsScopeAnalysis.stale_count === 0
        && fundamentalsScopeAnalysis.missing_count === 0,
      severity: fundamentalsScopeAnalysis.expected_total === 0
        ? 'warning'
        : (fundamentalsScopeAnalysis.stale_count === 0 && fundamentalsScopeAnalysis.missing_count === 0 ? 'ok' : 'warning'),
      verification_mode: 'prioritized_scope_refresh',
      fix_commands: ['node scripts/build-fundamentals.mjs --top-scope --force'],
      scope_total: fundamentalsScopeAnalysis.scope_total,
      expected_total: fundamentalsScopeAnalysis.expected_total,
      freshness_limit_trading_days: fundamentalsScopeAnalysis.freshness_limit_trading_days,
      scope_name: fundamentalsScope?.scope_name || null,
      published_existing: fundamentalsPublishedCount,
      generated_at: fundamentalsGeneratedAt,
    }),
  ];

  const unhealthyFamilies = families.filter((family) => !family.healthy).map((family) => family.family_id);
  const severity = families.reduce((worst, family) => (
    ({ ok: 0, warning: 1, critical: 2 }[family.severity] ?? 2) > ({ ok: 0, warning: 1, critical: 2 }[worst] ?? 0)
      ? family.severity
      : worst
  ), 'ok');

  writeJson(PATHS.output, {
    schema: 'rv.data_freshness_gate.v1',
    generated_at: nowIso(),
    scope: {
      id: 'us_eu_only',
      source_rows: path.relative(ROOT, PATHS.scopeRows),
      source_symbols: path.relative(ROOT, PATHS.scopeSymbols),
      source_canonical_ids: path.relative(ROOT, PATHS.scopeCanonicalIds),
      symbol_count: scopeSymbolsDoc?.count || scopeSymbols.length,
      stock_count: scopeRowsDoc?.counts?.by_type?.STOCK || scopeStocks.length,
      etf_count: scopeRowsDoc?.counts?.by_type?.ETF || Math.max(0, scopeSymbols.length - scopeStocks.length),
    },
    summary: {
      severity,
      healthy: severity === 'ok',
      expected_eod: expectedEod,
      family_total: families.length,
      family_healthy: families.length - unhealthyFamilies.length,
      family_unhealthy: unhealthyFamilies.length,
      unhealthy_families: unhealthyFamilies,
    },
    families,
    families_by_id: Object.fromEntries(families.map((family) => [family.family_id, family])),
  });
}

main();
