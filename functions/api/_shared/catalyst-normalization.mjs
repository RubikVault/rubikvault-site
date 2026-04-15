function normalizeTicker(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

function normalizeDate(value) {
  const normalized = typeof value === 'string' ? value.slice(0, 10) : null;
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function inferAssetClass({ ticker, name, universe, fundamentals } = {}) {
  const haystack = `${ticker || ''} ${name || ''} ${universe?.name || ''} ${universe?.asset_class || ''} ${universe?.security_type || ''} ${universe?.industry || ''}`.toLowerCase();
  if (/\betf\b|\bexchange traded fund\b|\btrust\b|\bucits\b/.test(haystack)) return 'ETF';
  return 'STOCK';
}

export function lookupEarningsFeedEntry(earningsFeed, ticker) {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) return null;
  const entry = earningsFeed?.data?.[normalizedTicker];
  return entry && typeof entry === 'object' ? entry : null;
}

export function buildCatalystPayload({
  ticker,
  fundamentals = null,
  earningsFeed = null,
  universe = null,
  name = null,
} = {}) {
  const normalizedTicker = normalizeTicker(ticker);
  const entry = lookupEarningsFeedEntry(earningsFeed, normalizedTicker);
  const assetClass = inferAssetClass({ ticker: normalizedTicker, name, universe, fundamentals });
  const nextEarningsDate = normalizeDate(
    fundamentals?.nextEarningsDate || fundamentals?.earningsDate || entry?.date || null
  );

  if (entry && assetClass !== 'ETF') {
    return {
      status: 'confirmed',
      asset_class: assetClass,
      next_earnings_date: nextEarningsDate,
      source: 'earnings_calendar.latest',
      items: [{
        kind: 'earnings',
        ticker: normalizedTicker,
        date: nextEarningsDate,
        time: entry?.time || null,
        fiscal_quarter: entry?.fiscal_quarter || null,
        fiscal_year: entry?.fiscal_year || null,
        days_to_event: Number.isFinite(Number(entry?.days_to_earnings)) ? Number(entry.days_to_earnings) : null,
        confidence: 'confirmed',
      }],
    };
  }

  if (nextEarningsDate && assetClass !== 'ETF') {
    return {
      status: 'estimated',
      asset_class: assetClass,
      next_earnings_date: nextEarningsDate,
      source: fundamentals?.nextEarningsDate || fundamentals?.earningsDate ? 'fundamentals' : null,
      items: [],
    };
  }

  return {
    status: 'unavailable',
    asset_class: assetClass,
    next_earnings_date: null,
    source: null,
    items: [],
  };
}

export function mergeCatalystFields({
  ticker,
  fundamentals = null,
  earningsFeed = null,
  universe = null,
  name = null,
} = {}) {
  const catalystPayload = buildCatalystPayload({ ticker, fundamentals, earningsFeed, universe, name });
  const mergedFundamentals = fundamentals && typeof fundamentals === 'object' ? { ...fundamentals } : {};
  if (!mergedFundamentals.nextEarningsDate && catalystPayload.next_earnings_date) {
    mergedFundamentals.nextEarningsDate = catalystPayload.next_earnings_date;
  }
  if ((!Array.isArray(mergedFundamentals.confirmedCatalysts) || mergedFundamentals.confirmedCatalysts.length === 0) && catalystPayload.items.length > 0) {
    mergedFundamentals.confirmedCatalysts = catalystPayload.items.map((item) => ({
      type: item.kind,
      label: 'Earnings',
      date: item.date,
      time: item.time || null,
      confidence: item.confidence,
    }));
  }
  return {
    fundamentals: Object.keys(mergedFundamentals).length > 0 ? mergedFundamentals : null,
    catalysts: catalystPayload,
  };
}
