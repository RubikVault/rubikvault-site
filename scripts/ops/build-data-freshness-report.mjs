#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS,
  normalizeDateId,
} from '../../functions/api/_shared/fundamentals-scope.mjs';
import { histProbsReadCandidates } from '../lib/hist-probs/path-resolver.mjs';
import { isDataPlaneLane, parsePipelineLane } from './pipeline-lanes.mjs';

const ROOT = process.cwd();
const EVALUATION_LANE = parsePipelineLane(process.argv.slice(2));
const RELEASE_SCOPE_EVALUATED = !isDataPlaneLane(EVALUATION_LANE);
const CANONICAL_LABEL_WINDOW_DAYS = 30; // Allow up to 30 trading days canonical label lag (structural QuantLab delay)
const MIN_REQUIRED_HIST_BARS = 60;
const HIST_PROBS_INACTIVE_TOLERANCE_TRADING_DAYS = 20;
const PATHS = {
  scopeRows: path.join(ROOT, 'mirrors/universe-v7/ssot/assets.global.rows.json'),
  scopeSymbols: path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.symbols.json'),
  scopeCanonicalIds: path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json'),
  refreshReport: path.join(ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json'),
  deltaLatestSuccess: path.join(process.env.QUANT_ROOT || (process.platform === 'linux' ? '/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab' : '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab'), 'ops/q1_daily_delta_ingest/latest_success.json'),
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

function analyzeHistProbs(scopeRows, histDir, fallbackExpectedEod, noDataTickers, options = {}) {
  const freshnessBudgetTradingDays = Math.max(0, Number(options.freshnessBudgetTradingDays || 0) || 0);
  const result = {
    fresh_count: 0,
    budget_fresh_count: 0,
    stale_count: 0,
    missing_count: 0,
    inactive_excluded_count: 0,
    max_budget_fresh_lag_trading_days: 0,
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
    let filePath = null;
    for (const candidate of histProbsReadCandidates(histDir, symbol)) {
      if (fs.existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
    if (!filePath) {
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
      } else if (fileLagTradingDays != null && fileLagTradingDays <= freshnessBudgetTradingDays) {
        result.fresh_count += 1;
        result.budget_fresh_count += 1;
        result.max_budget_fresh_lag_trading_days = Math.max(
          result.max_budget_fresh_lag_trading_days,
          fileLagTradingDays,
        );
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
  lane_evaluation = 'evaluated',
  non_blocking = false,
  lane_note = null,
  ...extra
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
    evaluation_lane: EVALUATION_LANE,
    release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
    lane_evaluation,
    non_blocking,
    lane_note,
    ...extra,
  };
}

function neutralizeFamilyForLane(family, laneNote) {
  return {
    ...family,
    healthy: true,
    severity: 'info',
    lane_evaluation: 'not_evaluated_on_lane',
    non_blocking: true,
    lane_note: laneNote,
    fix_commands: [],
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
  const fundamentalsProviderFetchesDisabled = fundamentalsIndex?.metadata_only === true
    || fundamentalsIndex?.provider_fetches_disabled === true;
  const fundamentalsScopeOk = fundamentalsScopeAnalysis.expected_total > 0
    && fundamentalsScopeAnalysis.stale_count === 0
    && fundamentalsScopeAnalysis.missing_count === 0;

  const histDate = histRegime?.date || histSummary?.regime_date || null;
  const scientificAsOf = scientific?.source_meta?.asof || String(scientific?.generated_at || '').slice(0, 10) || null;
  const scientificStaleDays = ageCalendarDays(scientificAsOf, expectedEod);
  const histNoDataTickers = buildNoDataTickerSet(histNoDataDoc);
  const histFreshnessBudgetTradingDays = Math.max(0, Number(histSummary?.freshness_budget_trading_days || 0) || 0);
  const histAnalysis = analyzeHistProbs(scopeRows, PATHS.histProbsDir, expectedEod, histNoDataTickers, {
    freshnessBudgetTradingDays: histFreshnessBudgetTradingDays,
  });
  const histEvaluatedTotal = Math.max(
    0,
    Number(histAnalysis.fresh_count || 0)
      + Number(histAnalysis.stale_count || 0)
      + Number(histAnalysis.missing_count || 0),
  );
  const histFreshRatio = histEvaluatedTotal > 0
    ? Number(histAnalysis.fresh_count || 0) / histEvaluatedTotal
    : 0;
  const histSummaryTotal = Math.max(0, Number(histSummary?.tickers_total || 0));
  const histSummaryCoverageRatio = histSummaryTotal > 0
    ? Number(histSummary?.tickers_covered || 0) / histSummaryTotal
    : histFreshRatio;
  const histMinCoverageRatio = Math.max(0, Math.min(1, Number(histSummary?.min_coverage_ratio || 0.95)));
  const histRunCoverageOk = histSummaryCoverageRatio >= histMinCoverageRatio;
  const histAssetClasses = Array.isArray(histSummary?.asset_classes) ? histSummary.asset_classes : [];
  const histCoverageOk = histRunCoverageOk
    && Number(histSummary?.worker_hard_failures || 0) === 0
    && ['STOCK', 'ETF', 'INDEX'].every((cls) => histAssetClasses.includes(cls));
  const auditFamilies = Array.isArray(audit?.failure_families) ? audit.failure_families : [];
  const auditCriticalFamilies = auditFamilies.filter((family) => String(family?.severity || '').toLowerCase() === 'critical');
  const auditWarningFamilies = auditFamilies.filter((family) => String(family?.severity || '').toLowerCase() === 'warning');
  const auditCriticalAssets = auditCriticalFamilies.reduce((sum, family) => sum + Number(family?.affected_assets || 0), 0);
  const auditCriticalIssueCount = Number(audit?.summary?.artifact_critical_issue_count ?? audit?.summary?.critical_issue_count ?? 0);
  const auditFullUniverse = audit?.summary?.full_universe === true;
  const auditNoCriticalFailures = auditCriticalFamilies.length === 0 && auditCriticalIssueCount === 0;
  const auditOperationalHealthy = auditFullUniverse && auditNoCriticalFailures;

  const rawBars = quantlabOperational?.rawBars || {};
  const rawAnyDataDate = rawBars.latestAnyRequiredDataDate || null;
  const rawCanonicalLagDays = tradingDaysBetween(rawBars.latestCanonicalRequiredDataDate, rawAnyDataDate);
  const rawCanonicalExcessLag = rawCanonicalLagDays != null
    ? Math.max(0, rawCanonicalLagDays - CANONICAL_LABEL_WINDOW_DAYS)
    : null;
  const rawAnyStaleDays = ageCalendarDays(rawAnyDataDate, expectedEod);
  const rawAnyFreshForTarget = Boolean(rawAnyDataDate) && (rawAnyStaleDays ?? Infinity) <= 1;
  const rawCanonicalLagSeverity = rawCanonicalExcessLag == null
    ? 'ok'
    : rawCanonicalExcessLag > 14
      ? 'critical'
      : rawCanonicalExcessLag > 7
        ? 'warning'
        : 'ok';
  const rawOperationalHealthy = rawAnyFreshForTarget && rawCanonicalLagSeverity !== 'critical';
  const rawOperationalSeverity = rawOperationalHealthy ? 'ok' : 'critical';
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
        'python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file "$NAS_DEV_ROOT/.env.local" --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date <YYYY-MM-DD> --to-date <YYYY-MM-DD> --concurrency "${RV_MARKET_REFRESH_CONCURRENCY:-12}" --progress-every "${RV_MARKET_REFRESH_PROGRESS_EVERY:-500}"',
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
      fresh_count: rawOperationalHealthy ? scopeSymbols.length : 0,
      stale_count: rawOperationalHealthy ? 0 : scopeSymbols.length,
      missing_count: 0,
      healthy: rawOperationalHealthy,
      severity: rawOperationalSeverity,
      verification_mode: 'operational_status_any_raw_with_structural_label_window',
      fix_commands: ['node scripts/quantlab/build_quantlab_v4_daily_report.mjs'],
      latest_canonical_data_date: rawBars.latestCanonicalRequiredDataDate || null,
      latest_any_data_date: rawAnyDataDate,
      raw_any_stale_days: rawAnyStaleDays,
      canonical_label_lag_trading_days: rawCanonicalLagDays,
      canonical_label_window_trading_days: CANONICAL_LABEL_WINDOW_DAYS,
      canonical_excess_lag_trading_days: rawCanonicalExcessLag,
      canonical_lag_severity: rawCanonicalLagSeverity,
      lane_note: rawOperationalHealthy && rawCanonicalExcessLag > 0
        ? 'Raw any-data is current for the target date; canonical label lag is tracked as structural advisory until it exceeds the hard label-window threshold.'
        : null,
    }),
    buildFamily({
      family_id: 'hist_probs',
      expected_eod: expectedEod,
      data_asof: histAnalysis.data_asof || histDate,
      fresh_count: histAnalysis.fresh_count,
      stale_count: histAnalysis.stale_count,
      missing_count: histAnalysis.missing_count,
      sample_tickers: histAnalysis.sample_tickers,
      healthy: histCoverageOk,
      severity: histCoverageOk ? 'ok' : 'critical',
      verification_mode: 'run_summary_with_residual_artifact_counts',
      fix_commands: ['NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs'],
      inactive_excluded_count: histAnalysis.inactive_excluded_count,
      budget_fresh_count: histAnalysis.budget_fresh_count,
      freshness_budget_trading_days: histFreshnessBudgetTradingDays,
      max_budget_fresh_lag_trading_days: histAnalysis.max_budget_fresh_lag_trading_days,
      coverage_ratio: histSummaryCoverageRatio,
      run_coverage_ratio: histSummaryCoverageRatio,
      artifact_coverage_ratio: histFreshRatio,
      min_coverage_ratio: histMinCoverageRatio,
      run_coverage_ok: histRunCoverageOk,
      worker_hard_failures: Number(histSummary?.worker_hard_failures || 0),
      asset_classes: histAssetClasses,
      residual_fresh_count: histAnalysis.fresh_count,
      residual_stale_count: histAnalysis.stale_count,
      residual_missing_count: histAnalysis.missing_count,
      residual_counts_blocking: false,
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
      // Only critical artifact failures block freshness. Warning families remain visible
      // but Page-Core/public-decision gates own release readiness.
      healthy: auditOperationalHealthy,
      severity: auditOperationalHealthy ? 'ok' : 'critical',
      verification_mode: 'full_universe_audit_critical_families_only',
      fix_commands: [
        'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF}"; node scripts/universe-v7/build-global-scope.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-stock-analyzer-universe-audit.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --asset-classes "$RV_GLOBAL_ASSET_CLASSES" --max-tickers 0 --live-sample-size 0 --concurrency 12 --timeout-ms 30000',
      ],
      legacy_release_eligible: audit?.summary?.release_eligible === true,
      warning_failure_family_count: auditWarningFamilies.length,
      critical_failure_family_count: auditCriticalFamilies.length,
      artifact_critical_issue_count: auditCriticalIssueCount,
      warning_failure_families: auditWarningFamilies.map((family) => ({
        family_id: family.family_id,
        affected_assets: family.affected_assets,
        severity: family.severity,
      })),
      lane_note: auditOperationalHealthy && audit?.summary?.release_eligible !== true
        ? 'Legacy audit release_eligible is false because warning families remain; freshness gate blocks only critical artifact failures. Public release truth is enforced by Page-Core, public decision coverage, and final seal gates.'
        : null,
    }),
    buildFamily({
      family_id: 'fundamentals_scope',
      expected_eod: expectedEod,
      data_asof: fundamentalsScopeAnalysis.data_asof || fundamentalsGeneratedAt,
      fresh_count: fundamentalsScopeAnalysis.fresh_count,
      stale_count: fundamentalsScopeAnalysis.stale_count,
      missing_count: fundamentalsScopeAnalysis.missing_count,
      sample_tickers: fundamentalsScopeAnalysis.sample_tickers,
      healthy: fundamentalsProviderFetchesDisabled ? true : fundamentalsScopeOk,
      severity: fundamentalsProviderFetchesDisabled
        ? 'info'
        : fundamentalsScopeAnalysis.expected_total === 0
        ? 'warning'
        : (fundamentalsScopeOk ? 'ok' : 'warning'),
      verification_mode: fundamentalsProviderFetchesDisabled
        ? 'metadata_only_provider_fetch_disabled'
        : 'prioritized_scope_refresh',
      fix_commands: ['node scripts/build-fundamentals.mjs --top-scope --force'],
      non_blocking: fundamentalsProviderFetchesDisabled,
      lane_note: fundamentalsProviderFetchesDisabled
        ? 'Fundamentals provider fetches were intentionally disabled for this run; missing per-ticker fundamentals remain visible but are not part of the core Stock Analyzer green gate.'
        : null,
      scope_total: fundamentalsScopeAnalysis.scope_total,
      expected_total: fundamentalsScopeAnalysis.expected_total,
      freshness_limit_trading_days: fundamentalsScopeAnalysis.freshness_limit_trading_days,
      scope_name: fundamentalsScope?.scope_name || null,
      published_existing: fundamentalsPublishedCount,
      generated_at: fundamentalsGeneratedAt,
      metadata_only: fundamentalsIndex?.metadata_only === true,
      provider_fetches_disabled: fundamentalsIndex?.provider_fetches_disabled === true,
    }),
  ];

  if (isDataPlaneLane(EVALUATION_LANE)) {
    const auditIndex = families.findIndex((family) => family.family_id === 'stock_analyzer_universe_audit');
    if (auditIndex >= 0) {
      families[auditIndex] = neutralizeFamilyForLane(
        families[auditIndex],
        'Stock Analyzer universe audit belongs to release-full lane and is not evaluated on the data-plane lane.',
      );
    }
  }

  const blockingFamilies = families.filter((family) => family.lane_evaluation !== 'not_evaluated_on_lane');
  const unhealthyFamilies = blockingFamilies.filter((family) => !family.healthy).map((family) => family.family_id);
  const severity = blockingFamilies.reduce((worst, family) => (
    ({ ok: 0, info: 0, warning: 1, critical: 2 }[family.severity] ?? 2) > ({ ok: 0, info: 0, warning: 1, critical: 2 }[worst] ?? 0)
      ? family.severity
      : worst
  ), 'ok');

  writeJson(PATHS.output, {
    schema: 'rv.data_freshness_gate.v1',
    generated_at: nowIso(),
    evaluation_lane: EVALUATION_LANE,
    release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
    scope: {
      id: 'global_stock_etf_index',
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
      evaluation_lane: EVALUATION_LANE,
      release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
      expected_eod: expectedEod,
      family_total: families.length,
      family_healthy: blockingFamilies.length - unhealthyFamilies.length,
      family_unhealthy: unhealthyFamilies.length,
      unhealthy_families: unhealthyFamilies,
    },
    families,
    families_by_id: Object.fromEntries(families.map((family) => [family.family_id, family])),
  });
}

main();
