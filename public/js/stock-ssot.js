function parseIsoDay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function dayToMillis(value) {
  const normalized = parseIsoDay(value);
  if (!normalized) return null;
  return Date.UTC(
    Number(normalized.slice(0, 4)),
    Number(normalized.slice(5, 7)) - 1,
    Number(normalized.slice(8, 10)),
  );
}

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mergeObjectsPreferPrimary(primary, secondary) {
  if (!primary && !secondary) return null;
  if (!primary) return secondary || null;
  if (!secondary) return primary || null;
  const merged = { ...secondary };
  for (const [key, value] of Object.entries(primary)) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

function isStatsRecordComplete(record) {
  const stats = record?.stats;
  if (!stats || typeof stats !== 'object') return false;
  const required = ['rsi14', 'atr14', 'volatility_20d', 'volatility_percentile', 'bb_upper', 'bb_lower', 'high_52w', 'low_52w', 'range_52w_pct'];
  return required.every((key) => Number.isFinite(Number(stats[key])));
}

function isMeaningfulPriceRecord(record) {
  return Boolean(record) && Number.isFinite(Number(record?.close)) && Boolean(parseIsoDay(record?.date));
}

function isPriceWithinRangeEnvelope(price, stats) {
  const close = toFinite(price);
  const high = toFinite(stats?.high_52w);
  const low = toFinite(stats?.low_52w);
  if (close == null || high == null || low == null || !(high > low && low > 0)) return true;
  return close >= low * 0.2 && close <= high * 5;
}

function isGrossScaleMismatch(priceA, priceB) {
  const a = toFinite(priceA);
  const b = toFinite(priceB);
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio >= 5;
}

export function buildMarketPricesFromBar(bar, symbol, providerHint = 'historical-bars') {
  if (!bar || !Number.isFinite(Number(bar?.close))) return null;
  return {
    symbol,
    date: bar?.date || null,
    open: Number.isFinite(Number(bar?.open)) ? Number(bar.open) : null,
    high: Number.isFinite(Number(bar?.high)) ? Number(bar.high) : null,
    low: Number.isFinite(Number(bar?.low)) ? Number(bar.low) : null,
    close: Number.isFinite(Number(bar?.close)) ? Number(bar.close) : null,
    adj_close: Number.isFinite(Number(bar?.adjClose)) ? Number(bar.adjClose) : (Number.isFinite(Number(bar?.close)) ? Number(bar.close) : null),
    volume: Number.isFinite(Number(bar?.volume)) ? Number(bar.volume) : null,
    currency: null,
    source_provider: providerHint || null,
  };
}

export function getIndicatorEntries(indicators) {
  if (Array.isArray(indicators)) return indicators;
  if (Array.isArray(indicators?.indicators)) return indicators.indicators;
  return [];
}

export function buildMarketStatsFromIndicators(indicators, symbol, asOf) {
  const entries = getIndicatorEntries(indicators);
  if (!entries.length) return null;
  const stats = {};
  for (const item of entries) {
    if (!item || typeof item.id !== 'string') continue;
    stats[item.id] = item.value;
  }
  return { symbol, as_of: asOf || null, stats, coverage: null, warnings: [] };
}

export function selectCanonicalMarketPrices(snapshotRecord, liveRecord) {
  if (!snapshotRecord) return liveRecord || null;
  if (!liveRecord) return snapshotRecord || null;

  const snapshotTs = dayToMillis(snapshotRecord.date);
  const liveTs = dayToMillis(liveRecord.date);
  if (liveTs != null && (snapshotTs == null || liveTs > snapshotTs)) {
    return mergeObjectsPreferPrimary(liveRecord, snapshotRecord);
  }
  if (snapshotTs != null && liveTs != null && snapshotTs > liveTs) {
    return mergeObjectsPreferPrimary(snapshotRecord, liveRecord);
  }
  return mergeObjectsPreferPrimary(snapshotRecord, liveRecord);
}

export function selectCanonicalMarketStats(snapshotRecord, liveRecord) {
  if (!snapshotRecord) return liveRecord || null;
  if (!liveRecord) return snapshotRecord || null;

  const snapshotTs = dayToMillis(snapshotRecord.as_of);
  const liveTs = dayToMillis(liveRecord.as_of);
  const snapshotComplete = isStatsRecordComplete(snapshotRecord);
  const liveComplete = isStatsRecordComplete(liveRecord);

  if (liveComplete && !snapshotComplete) return mergeObjectsPreferPrimary(liveRecord, snapshotRecord);
  if (snapshotComplete && !liveComplete) return mergeObjectsPreferPrimary(snapshotRecord, liveRecord);
  if (liveTs != null && (snapshotTs == null || liveTs > snapshotTs)) {
    return mergeObjectsPreferPrimary(liveRecord, snapshotRecord);
  }
  if (snapshotTs != null && liveTs != null && snapshotTs > liveTs) {
    return mergeObjectsPreferPrimary(snapshotRecord, liveRecord);
  }
  return mergeObjectsPreferPrimary(liveRecord, snapshotRecord);
}

export function assessMarketDataConsistency({ marketPrices = null, marketStats = null, latestBar = null } = {}) {
  const issues = [];
  const priceDate = parseIsoDay(marketPrices?.date);
  const barDate = parseIsoDay(latestBar?.date);
  const statsDate = parseIsoDay(marketStats?.as_of);
  const priceClose = toFinite(marketPrices?.close);
  const barClose = toFinite(latestBar?.close ?? latestBar?.adjClose);
  const stats = marketStats?.stats || null;

  if (!isMeaningfulPriceRecord(marketPrices)) issues.push('missing_market_price_record');
  if (!latestBar || barClose == null || !barDate) issues.push('missing_historical_bar_basis');
  if (!marketStats || !statsDate) issues.push('missing_market_stats_basis');

  if (priceDate && barDate && priceDate !== barDate) {
    issues.push(`price_bar_date_mismatch:${priceDate}:${barDate}`);
  }
  if (barDate && statsDate && barDate !== statsDate) {
    issues.push(`bar_stats_date_mismatch:${barDate}:${statsDate}`);
  }
  if (isGrossScaleMismatch(priceClose, barClose)) {
    issues.push(`price_bar_scale_mismatch:${priceClose}:${barClose}`);
  }
  if (!isPriceWithinRangeEnvelope(priceClose, stats)) {
    issues.push(`price_outside_stats_envelope:${priceClose}`);
  }
  if (!isPriceWithinRangeEnvelope(barClose, stats)) {
    issues.push(`bar_close_outside_stats_envelope:${barClose}`);
  }

  const summaryProvider = String(marketPrices?.source_provider || '').toLowerCase();
  const trustedSummaryPrice = ['page-core', 'historical-bars', 'historical'].includes(summaryProvider);
  const useHistoricalBasis = !trustedSummaryPrice && issues.some((issue) =>
    issue.startsWith('price_bar_scale_mismatch')
    || issue.startsWith('price_outside_stats_envelope')
    || issue.startsWith('price_bar_date_mismatch'),
  ) && barClose != null;

  const keyLevelsReady = Boolean(
    barClose != null
    && marketStats
    && !issues.some((issue) =>
      issue.startsWith('missing_')
      || issue.startsWith('bar_stats_date_mismatch')
      || issue.startsWith('price_bar_scale_mismatch')
      || issue.startsWith('price_outside_stats_envelope'),
    ),
  );

  return {
    issues,
    useHistoricalBasis,
    keyLevelsReady,
  };
}

export function buildCanonicalMarketContext({
  ticker,
  summaryPrices = null,
  summaryStats = null,
  historicalBars = [],
  historicalIndicators = null,
  legacyPrices = null,
  legacyStats = null,
} = {}) {
  const bars = Array.isArray(historicalBars) ? historicalBars : [];
  const latestBar = bars.length ? bars[bars.length - 1] : null;
  const barPrices = buildMarketPricesFromBar(latestBar, ticker, 'historical-bars');
  const historicalStats = buildMarketStatsFromIndicators(
    historicalIndicators,
    ticker,
    latestBar?.date || summaryPrices?.date || null,
  );

  let marketPrices = selectCanonicalMarketPrices(summaryPrices, barPrices);
  marketPrices = selectCanonicalMarketPrices(marketPrices, legacyPrices);

  let marketStats = selectCanonicalMarketStats(summaryStats, historicalStats);
  marketStats = selectCanonicalMarketStats(marketStats, legacyStats);

  const initialConsistency = assessMarketDataConsistency({ marketPrices, marketStats, latestBar });
  if (initialConsistency.useHistoricalBasis) {
    if (barPrices) marketPrices = mergeObjectsPreferPrimary(barPrices, marketPrices);
    if (historicalStats) marketStats = mergeObjectsPreferPrimary(historicalStats, marketStats);
  }

  const finalConsistency = assessMarketDataConsistency({ marketPrices, marketStats, latestBar });
  return {
    marketPrices,
    marketStats,
    latestBar,
    usedHistoricalBasis: initialConsistency.useHistoricalBasis,
    consistency: finalConsistency,
    sources: {
      prices: initialConsistency.useHistoricalBasis ? 'historical-bars' : (marketPrices?.source_provider || 'summary'),
      stats: initialConsistency.useHistoricalBasis ? 'historical-indicators' : (marketStats?.source_provider || 'summary'),
    },
  };
}
