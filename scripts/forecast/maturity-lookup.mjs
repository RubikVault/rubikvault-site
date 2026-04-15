import { loadPriceHistory } from './snapshot_ingest.mjs';
import { resolveForecastCalendar } from './calendar-resolver.mjs';
import { canEvaluateOutcomeDate } from './finality.mjs';

const LOOKUP_BATCH_SIZE = 128;
const DATE_INDEX_CACHE = new WeakMap();

function chunk(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

export async function lookupMaturityHistory(repoRoot, forecasts, endDate) {
  const requested = [];
  for (const forecast of forecasts || []) {
    const resolution = resolveForecastCalendar({
      symbol: forecast?.ticker,
      exchange: forecast?.exchange || forecast?.market,
    });
    if (!resolution.supported) continue;
    requested.push(forecast?.ticker);
  }
  const unique = [...new Set(requested.filter(Boolean))];
  const merged = {};
  for (const batch of chunk(unique, LOOKUP_BATCH_SIZE)) {
    Object.assign(
      merged,
      await loadPriceHistory(repoRoot, batch, endDate, { allowLatestFallback: false })
    );
  }
  return merged;
}

export async function resolveMaturityPricePair(repoRoot, forecast, outcomeDate, endDate) {
  const calendar = resolveForecastCalendar({ symbol: forecast?.ticker, exchange: forecast?.exchange || forecast?.market });
  if (!calendar.supported) {
    return { ok: false, reason: calendar.reason || 'unsupported_calendar', calendar };
  }
  const finality = canEvaluateOutcomeDate(repoRoot, outcomeDate, endDate);
  if (!finality.ok) {
    return { ok: false, reason: finality.reason, calendar, finality };
  }
  const history = await loadPriceHistory(repoRoot, [forecast?.ticker], endDate, { allowLatestFallback: false });
  const ticker = String(forecast?.ticker || '').trim().toUpperCase();
  const tickerHistory = history[ticker];
  if (!tickerHistory?.dates?.length) {
    return { ok: false, reason: 'history_unavailable', calendar, finality };
  }
  let dateIndex = DATE_INDEX_CACHE.get(tickerHistory);
  if (!dateIndex) {
    dateIndex = new Map(tickerHistory.dates.map((date, index) => [date, index]));
    DATE_INDEX_CACHE.set(tickerHistory, dateIndex);
  }
  const forecastIdx = dateIndex.get(String(forecast?.trading_date || '')) ?? -1;
  const outcomeIdx = dateIndex.get(String(outcomeDate || '')) ?? -1;
  if (forecastIdx === -1 || outcomeIdx === -1) {
    return { ok: false, reason: 'required_dates_missing', calendar, finality };
  }
  return {
    ok: true,
    calendar,
    finality,
    priceAtForecast: tickerHistory.closes[forecastIdx],
    priceAtOutcome: tickerHistory.closes[outcomeIdx],
  };
}
