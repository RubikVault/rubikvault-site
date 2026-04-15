export const DEFAULT_FUNDAMENTALS_SCOPE_SIZE = 1500;
export const DEFAULT_FUNDAMENTALS_SCOPE_NAME = 'top_1500_hybrid';
export const DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS = 6;

export function normalizeTicker(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

export function normalizeDateId(value) {
  const normalized = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function tradingDaysBetween(olderDateId, newerDateId) {
  const older = normalizeDateId(olderDateId);
  const newer = normalizeDateId(newerDateId);
  if (!older || !newer) return null;
  const start = new Date(`${older}T00:00:00Z`);
  const end = new Date(`${newer}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function countMeaningfulFundamentals(doc) {
  if (!doc || typeof doc !== 'object') return 0;
  const keys = ['marketCap', 'pe_ttm', 'eps_ttm', 'pb', 'companyName', 'sector', 'industry', 'nextEarningsDate'];
  return keys.filter((key) => doc[key] != null && doc[key] !== '').length;
}

export function inferFundamentalsAssetClass({ ticker, universe, fundamentals } = {}) {
  const haystack = [
    ticker,
    universe?.name,
    universe?.asset_class,
    universe?.security_type,
    universe?.type,
    universe?.industry,
    fundamentals?.companyName,
    fundamentals?.assetClass,
    fundamentals?.securityType,
    fundamentals?.sector,
    fundamentals?.industry,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\betf\b|\bexchange traded fund\b|\btrust\b|\bucits\b|\bindex fund\b|\bfund\b/.test(haystack)) return 'ETF';
  if (/\bindex\b|\bcomposite\b/.test(haystack) || String(ticker || '').startsWith('^')) return 'Index';
  return 'Stock';
}

export function resolveFundamentalsScopeMember(scopeDoc, ticker) {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker || !scopeDoc || typeof scopeDoc !== 'object') return null;
  const members = Array.isArray(scopeDoc.members) ? scopeDoc.members : [];
  return members.find((member) => normalizeTicker(member?.ticker) === normalizedTicker) || null;
}

function buildBaseFundamentals({ ticker, universe, fundamentals, assetClass }) {
  const normalizedTicker = normalizeTicker(ticker);
  const inferredAssetClass = assetClass || inferFundamentalsAssetClass({ ticker: normalizedTicker, universe, fundamentals });
  const base = fundamentals && typeof fundamentals === 'object' ? { ...fundamentals } : {};
  return {
    ...base,
    ticker: normalizedTicker,
    companyName: base.companyName || universe?.name || normalizedTicker,
    updatedAt: normalizeDateId(base.updatedAt || base.asOf || base.date) || null,
    assetClass: base.assetClass || inferredAssetClass,
    securityType: base.securityType || inferredAssetClass,
    marketCap: base.marketCap ?? null,
    pe_ttm: base.pe_ttm ?? null,
    ps_ttm: base.ps_ttm ?? null,
    pb: base.pb ?? null,
    ev_ebitda: base.ev_ebitda ?? null,
    revenue_ttm: base.revenue_ttm ?? null,
    grossMargin: base.grossMargin ?? null,
    operatingMargin: base.operatingMargin ?? null,
    netMargin: base.netMargin ?? null,
    eps_ttm: base.eps_ttm ?? null,
    nextEarningsDate: base.nextEarningsDate ?? null,
    sector: base.sector ?? universe?.sector ?? null,
    industry: base.industry ?? universe?.industry ?? null,
    dividendYield: base.dividendYield ?? null,
    beta: base.beta ?? null,
  };
}

export function annotateFundamentalsForScope({
  ticker,
  universe = null,
  fundamentals = null,
  scopeDoc = null,
  targetMarketDate = null,
  assetClass = null,
} = {}) {
  const base = buildBaseFundamentals({ ticker, universe, fundamentals, assetClass });
  const normalizedTicker = normalizeTicker(base.ticker);
  const resolvedAssetClass = assetClass || inferFundamentalsAssetClass({ ticker: normalizedTicker, universe, fundamentals: base });
  const hasScopeDoc = Boolean(scopeDoc && Array.isArray(scopeDoc.members));
  const member = resolveFundamentalsScopeMember(scopeDoc, normalizedTicker);
  const scopeName = String(scopeDoc?.scope_name || DEFAULT_FUNDAMENTALS_SCOPE_NAME);
  const freshnessLimitTradingDays = Number(scopeDoc?.freshness_limit_trading_days || DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS);
  const expectedTargetMarketDate = normalizeDateId(targetMarketDate || scopeDoc?.target_market_date || null);
  const freshnessTradingDays = (base.updatedAt && expectedTargetMarketDate)
    ? tradingDaysBetween(base.updatedAt, expectedTargetMarketDate)
    : null;
  const meaningfulFields = countMeaningfulFundamentals(base);
  const coverageExpected = !hasScopeDoc
    ? resolvedAssetClass === 'Stock'
    : (typeof member?.coverage_expected === 'boolean' ? member.coverage_expected : false);
  const freshnessOk = freshnessTradingDays != null && freshnessTradingDays <= freshnessLimitTradingDays;

  let scopeStatus = 'ready';
  let typedStatus = base.typed_status || 'READY';
  let typedReason = base.typed_reason || null;

  if (resolvedAssetClass === 'Index') {
    scopeStatus = 'not_applicable';
    typedStatus = 'NOT_APPLICABLE';
    typedReason = 'Index fundamentals are not applicable for this UI contract.';
  } else if (!hasScopeDoc && resolvedAssetClass === 'ETF' && meaningfulFields < 2) {
    scopeStatus = 'not_applicable';
    typedStatus = 'NOT_APPLICABLE';
    typedReason = 'ETF fundamentals feed is optional for this UI contract.';
  } else if (hasScopeDoc && !member) {
    scopeStatus = 'out_of_scope';
    typedStatus = 'OUT_OF_SCOPE';
    typedReason = 'This asset is not currently part of the prioritized fundamentals universe.';
  } else if (hasScopeDoc && !coverageExpected) {
    scopeStatus = 'not_applicable';
    typedStatus = 'NOT_APPLICABLE';
    typedReason = resolvedAssetClass === 'ETF'
      ? 'ETF fundamentals are optional for this prioritized scope member.'
      : 'Fundamentals are not expected for this asset in the current scope policy.';
  } else if (hasScopeDoc && (meaningfulFields < 2 || !freshnessOk)) {
    scopeStatus = 'updating';
    typedStatus = 'UPDATING';
    typedReason = meaningfulFields < 2
      ? 'Fundamentals refresh is in progress for this in-scope asset.'
      : `Fundamentals are ${freshnessTradingDays} trading days old and waiting for refresh.`;
  }

  return {
    ...base,
    assetClass: resolvedAssetClass,
    securityType: base.securityType || resolvedAssetClass,
    typed_status: typedStatus,
    typed_reason: typedReason,
    scope_name: scopeName,
    scope_status: scopeStatus,
    scope_rank: Number.isFinite(Number(member?.scope_rank)) ? Number(member.scope_rank) : null,
    scope_target_market_date: expectedTargetMarketDate,
    coverage_expected: coverageExpected,
    freshness_trading_days: freshnessTradingDays,
    freshness_limit_trading_days: freshnessLimitTradingDays,
  };
}
