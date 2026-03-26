/**
 * Shared helpers extracted from stock.js for V2 endpoint reuse.
 * V1 stock.js retains its own local copies for zero-risk backward compatibility.
 */

const TICKER_MAX_LENGTH = 12;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-:]+$/;

export function normalizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > TICKER_MAX_LENGTH || /\s/.test(trimmed)) return null;
  const normalized = trimmed.toUpperCase();
  return VALID_TICKER_REGEX.test(normalized) ? normalized : null;
}

export function pickLatestBar(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  return bars[bars.length - 1] || null;
}

export function computeDayChange(bars) {
  if (!Array.isArray(bars) || bars.length < 2) {
    return { abs: null, pct: null };
  }
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const latestClose = Number.isFinite(latest?.adjClose) ? latest.adjClose : latest?.close;
  const prevClose = Number.isFinite(prev?.adjClose) ? prev.adjClose : prev?.close;
  if (!Number.isFinite(latestClose) || !Number.isFinite(prevClose) || prevClose === 0) {
    return { abs: null, pct: null };
  }
  const abs = latestClose - prevClose;
  return { abs, pct: abs / prevClose };
}

export function buildSourceChainMetadata(chain) {
  if (!chain || typeof chain !== 'object') {
    return {
      primary: 'eodhd', secondary: 'eodhd', forced: null, selected: null,
      fallbackUsed: false, failureReason: null, primaryFailure: null, circuit: null,
    };
  }
  return {
    primary: chain.primary || 'eodhd',
    secondary: chain.secondary || 'eodhd',
    forced: chain.forced || null,
    selected: chain.selected || null,
    fallbackUsed: Boolean(chain.fallbackUsed),
    failureReason: chain.failureReason || null,
    primaryFailure: chain.primaryFailure || null,
    circuit: chain.circuit || null,
  };
}

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function diffDays(fromDay, toDay) {
  const from = Date.UTC(Number(fromDay.slice(0, 4)), Number(fromDay.slice(5, 7)) - 1, Number(fromDay.slice(8, 10)));
  const to = Date.UTC(Number(toDay.slice(0, 4)), Number(toDay.slice(5, 7)) - 1, Number(toDay.slice(8, 10)));
  return Math.floor((to - from) / 86400000);
}

function minutesSinceUtcMidnight(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function computeStatusFromDataDate(dataDate, now, maxStaleDays, pendingWindowMinutes) {
  const today = isoDay(now);
  const normalized = parseIsoDay(dataDate);
  if (!normalized) {
    return minutesSinceUtcMidnight(now) <= pendingWindowMinutes ? 'pending' : 'error';
  }
  if (normalized === today) return 'fresh';
  const ageDays = diffDays(normalized, today);
  if (ageDays === 1 && minutesSinceUtcMidnight(now) <= pendingWindowMinutes) return 'pending';
  if (ageDays <= maxStaleDays) return 'stale';
  return 'error';
}

export function buildMarketPricesFromBar(bar, symbol, providerHint) {
  if (!bar || !Number.isFinite(bar?.close)) return null;
  return {
    symbol,
    date: bar?.date || null,
    open: Number.isFinite(bar?.open) ? Number(bar.open) : null,
    high: Number.isFinite(bar?.high) ? Number(bar.high) : null,
    low: Number.isFinite(bar?.low) ? Number(bar.low) : null,
    close: Number.isFinite(bar?.close) ? Number(bar.close) : null,
    adj_close: Number.isFinite(bar?.adjClose) ? Number(bar.adjClose) : (Number.isFinite(bar?.close) ? Number(bar.close) : null),
    volume: Number.isFinite(bar?.volume) ? Number(bar.volume) : null,
    currency: 'USD',
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

function dayToMillis(value) {
  const normalized = parseIsoDay(value);
  if (!normalized) return null;
  return Date.UTC(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1, Number(normalized.slice(8, 10)));
}

function isStatsRecordComplete(record) {
  const stats = record?.stats;
  if (!stats || typeof stats !== 'object') return false;
  const required = ['rsi14', 'atr14', 'volatility_20d', 'volatility_percentile', 'bb_upper', 'bb_lower', 'high_52w', 'low_52w', 'range_52w_pct'];
  return required.every((key) => Number.isFinite(stats[key]));
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
  return mergeObjectsPreferPrimary(liveRecord, snapshotRecord);
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
