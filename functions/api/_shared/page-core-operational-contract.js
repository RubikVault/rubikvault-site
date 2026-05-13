import { tradingDaysBetween } from './market-calendar.js';

const PAGE_CORE_MAX_STALE_TRADING_DAYS = 2;

function isoDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function addReason(reasons, reason) {
  if (reason && !reasons.includes(reason)) reasons.push(reason);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

function latestBarLagTradingDays(row, latest = null) {
  const marketStatsMin = row?.market_stats_min && typeof row.market_stats_min === 'object'
    ? row.market_stats_min
    : null;
  const latestBarDate = isoDate(
    marketStatsMin?.latest_bar_date
    || marketStatsMin?.price_date
    || row?.latest_bar_date
    || row?.price_date
    || row?.freshness?.as_of
  );
  const targetDate = isoDate(latest?.target_market_date || latest?.target_date || row?.target_market_date);
  if (!latestBarDate || !targetDate) return null;
  return tradingDaysBetween(latestBarDate, targetDate);
}

function latestBarWithinOperationalTtl(row, latest = null) {
  const lag = latestBarLagTradingDays(row, latest);
  return lag != null && lag <= PAGE_CORE_MAX_STALE_TRADING_DAYS;
}

export function pageCoreReturnIntegrity(row) {
  const summary = row?.summary_min || {};
  const rawPct = finiteNumber(summary.daily_change_pct);
  const absChange = finiteNumber(summary.daily_change_abs);
  const close = finiteNumber(summary.last_close);
  if (rawPct == null) return { status: 'missing', reason: 'return_missing', value: null };
  let value = rawPct;
  let reason = null;
  let status = 'ok';
  if (absChange != null && close != null) {
    const prevClose = close - absChange;
    if (prevClose > 0) {
      const expected = absChange / prevClose;
      if (Math.abs(rawPct - expected) <= 0.0005) {
        value = Number(expected.toFixed(8));
      } else if (Math.abs((rawPct / 100) - expected) <= 0.0005) {
        value = Number(expected.toFixed(8));
        status = 'normalized_percent_unit';
      } else {
        status = 'mismatch';
        reason = 'return_abs_pct_mismatch';
      }
    }
  }
  const displayTicker = String(row?.display_ticker || '').toUpperCase();
  const broadBenchmark = displayTicker === 'SPY' || displayTicker === 'QQQ';
  const threshold = broadBenchmark ? 0.20 : 0.50;
  if (Math.abs(value) > threshold) {
    if (broadBenchmark) {
      status = 'implausible';
      reason = 'benchmark_return_plausibility_failed';
    } else {
      status = 'warning';
      reason = 'asset_return_plausibility_warning';
    }
  }
  const low52w = finiteNumber(row?.market_stats_min?.stats?.low_52w);
  if (close != null && low52w != null && low52w > 0 && value > -0.95) {
    const impliedPrevClose = close / (1 + value);
    if (impliedPrevClose < low52w * 0.98 && close >= low52w * 0.98) {
      status = 'implausible';
      reason = 'return_conflicts_with_52w_low';
    }
  }
  return { status, reason, value, raw: rawPct };
}

export function pageCoreStrictOperationalReasons(row, { latest = null, freshnessStatus = null } = {}) {
  const reasons = [];
  const marketStatsMin = row?.market_stats_min && typeof row.market_stats_min === 'object'
    ? row.market_stats_min
    : null;
  const stats = marketStatsMin?.stats && typeof marketStatsMin.stats === 'object'
    ? marketStatsMin.stats
    : null;
  const latestBarDate = isoDate(
    marketStatsMin?.latest_bar_date
    || marketStatsMin?.price_date
    || row?.latest_bar_date
    || row?.price_date
    || row?.freshness?.as_of
  );
  const priceDate = isoDate(marketStatsMin?.price_date || row?.price_date || latestBarDate);
  const statsDate = isoDate(marketStatsMin?.as_of || marketStatsMin?.stats_date || row?.stats_date);
  const targetDate = isoDate(latest?.target_market_date || latest?.target_date || row?.target_market_date);
  const priceSource = String(marketStatsMin?.price_source || row?.price_source || '').trim();
  const statsSource = String(marketStatsMin?.stats_source || row?.stats_source || '').trim();
  const freshness = String(freshnessStatus || row?.freshness?.status || '').toLowerCase();
  const statusContractView = String(row?.status_contract?.stock_detail_view_status || '').toLowerCase();
  const historicalProfileStatus = String(row?.status_contract?.historical_profile_status || row?.status_contract?.hist_profile_status || '').toLowerCase();
  const modelCoverageStatus = String(row?.status_contract?.model_coverage_status || row?.model_coverage?.status || '').toLowerCase();
  const latestBarFreshEnough = latestBarWithinOperationalTtl(row, latest);
  const primaryBlocker = String(row?.primary_blocker || '');

  const claimsNonOperational = row?.ui_banner_state !== 'all_systems_operational' && statusContractView !== 'operational';
  if (row?.coverage?.ui_renderable !== true) addReason(reasons, 'ui_not_renderable');
  if (!marketStatsMin) {
    addReason(reasons, 'missing_market_stats_basis');
  } else {
    if (!stats || Object.keys(stats).length === 0) addReason(reasons, 'missing_market_stats_values');
    if (!priceSource) addReason(reasons, 'missing_price_source');
    if (!statsSource) addReason(reasons, 'missing_stats_source');
    if (!latestBarDate) addReason(reasons, 'missing_latest_bar_date');
    if (!priceDate) addReason(reasons, 'missing_price_date');
    if (!statsDate) addReason(reasons, 'missing_stats_date');
    if (priceDate && latestBarDate && priceDate !== latestBarDate) addReason(reasons, 'price_latest_bar_date_mismatch');
    if (statsDate && latestBarDate && statsDate !== latestBarDate) addReason(reasons, 'stats_latest_bar_date_mismatch');
    if (Array.isArray(marketStatsMin.issues) && marketStatsMin.issues.length > 0) {
      addReason(reasons, `market_stats_issue:${String(marketStatsMin.issues[0])}`);
    }
  }
  if (row?.key_levels_ready !== true || marketStatsMin?.key_levels_ready === false) {
    addReason(reasons, 'key_levels_not_ready');
  }
  if (targetDate && (!latestBarDate || (!latestBarFreshEnough && latestBarDate < targetDate))) addReason(reasons, 'bars_stale');
  if (['stale', 'expired', 'missing', 'last_good', 'error'].includes(freshness) && !latestBarFreshEnough) {
    addReason(reasons, `freshness_${freshness}`);
  }
  if (primaryBlocker && !(primaryBlocker === 'bars_stale' && latestBarFreshEnough)) {
    addReason(reasons, `primary_blocker:${primaryBlocker}`);
  }
  const returnIntegrity = pageCoreReturnIntegrity(row);
  if (returnIntegrity.reason && returnIntegrity.status !== 'warning') addReason(reasons, returnIntegrity.reason);
  if (!['ready', 'available', 'available_via_endpoint', 'not_applicable'].includes(historicalProfileStatus)) {
    addReason(reasons, 'historical_profile_not_ready');
  }
  if (!['complete', 'ready', 'not_applicable'].includes(modelCoverageStatus)) {
    addReason(reasons, 'model_coverage_incomplete');
  }
  if (claimsNonOperational && reasons.length > 0) addReason(reasons, 'ui_banner_not_operational');
  return unique(reasons);
}

export function pageCoreClaimsOperational(row) {
  return row?.ui_banner_state === 'all_systems_operational'
    || String(row?.status_contract?.stock_detail_view_status || '').toLowerCase() === 'operational';
}

export function normalizePageCoreOperationalState(row, { latest = null, freshnessStatus = null } = {}) {
  if (!row || typeof row !== 'object') return row;
  const strictReasons = pageCoreStrictOperationalReasons(row, { latest, freshnessStatus });
  const strictlyOperational = strictReasons.length === 0;
  const existingContract = row.status_contract || {};
  const coverage = row.coverage || {};
  const normalized = {
    ...row,
    ui_banner_state: strictlyOperational ? 'all_systems_operational' : row.ui_banner_state,
    primary_blocker: strictlyOperational ? null : row.primary_blocker,
    summary_min: {
      ...(row.summary_min || {}),
      quality_status: strictlyOperational ? 'OK' : row?.summary_min?.quality_status,
    },
    status_contract: {
      ...existingContract,
      core_status: strictReasons.some((reason) => reason === 'bars_stale' || reason.startsWith('freshness_'))
        ? 'stale'
        : (row?.freshness?.as_of ? 'fresh' : 'missing'),
      page_core_status: strictlyOperational ? 'operational' : 'degraded',
      key_levels_status: row?.key_levels_ready === true && row?.market_stats_min ? 'ready' : 'degraded',
      decision_status: firstNonEmpty(existingContract.decision_status)
        || (row?.summary_min?.governance_status === 'available' ? 'available' : 'degraded'),
      risk_status: firstNonEmpty(existingContract.risk_status)
        || (String(row?.summary_min?.risk_level || row?.governance_summary?.risk_level || '').toUpperCase() === 'UNKNOWN'
        ? 'degraded'
        : (row?.summary_min?.risk_level || row?.governance_summary?.risk_level ? 'available' : 'missing')),
      hist_status: firstNonEmpty(existingContract.hist_status)
        || (row?.market_stats_min ? 'available' : 'missing'),
      fundamentals_status: firstNonEmpty(existingContract.fundamentals_status, coverage.fundamentals_status)
        || (coverage.fundamentals === true ? 'available' : 'missing'),
      forecast_status: firstNonEmpty(existingContract.forecast_status, coverage.forecast_status)
        || (coverage.forecast === true ? 'available' : 'missing'),
      breakout_status: firstNonEmpty(existingContract.breakout_status, coverage.breakout_status)
        || (row?.breakout_summary ? 'available' : 'missing'),
      historical_profile_status: firstNonEmpty(existingContract.historical_profile_status, existingContract.hist_profile_status)
        || (row?.historical_profile_summary ? 'ready' : 'missing'),
      model_coverage_status: firstNonEmpty(existingContract.model_coverage_status, row?.model_coverage?.status)
        || 'missing',
      stock_detail_view_status: strictlyOperational ? 'operational' : 'degraded',
      strict_operational: strictlyOperational,
      strict_blocking_reasons: strictReasons,
    },
  };
  if (!strictlyOperational && pageCoreClaimsOperational(row)) {
    normalized.ui_banner_state = 'degraded';
    normalized.primary_blocker = row.primary_blocker || strictReasons[0] || 'strict_operational_contract_failed';
    normalized.summary_min = {
      ...(row.summary_min || {}),
      quality_status: 'DEGRADED',
    };
    normalized.governance_summary = {
      ...(row.governance_summary || {}),
      blocking_reasons: unique([
        ...(Array.isArray(row?.governance_summary?.blocking_reasons) ? row.governance_summary.blocking_reasons : []),
        normalized.primary_blocker,
      ]),
      warnings: unique([
        ...(Array.isArray(row?.governance_summary?.warnings) ? row.governance_summary.warnings : []),
        'false_green_downgraded_by_page_core_contract',
      ]),
    };
    normalized.meta = {
      ...(row.meta || {}),
      warnings: unique([
        ...(Array.isArray(row?.meta?.warnings) ? row.meta.warnings : []),
        'false_green_downgraded_by_page_core_contract',
      ]),
    };
  }
  return normalized;
}
