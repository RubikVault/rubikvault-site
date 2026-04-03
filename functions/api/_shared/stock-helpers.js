/**
 * Shared helpers extracted from stock.js for V2 endpoint reuse.
 * V1 stock.js retains its own local copies for zero-risk backward compatibility.
 */

export {
  buildMarketPricesFromBar,
  buildMarketStatsFromIndicators,
  selectCanonicalMarketPrices,
  selectCanonicalMarketStats,
} from '../../../public/js/stock-ssot.js';

const TICKER_MAX_LENGTH = 15;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-:^]+$/;

export function normalizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const decoded = raw.includes('%')
    ? (() => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })()
    : raw;
  const trimmed = decoded.trim();
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
  // Standard daily stock data: yesterday's close is 'fresh' until today's close arrives.
  if (ageDays <= 1) return 'fresh';
  if (ageDays <= maxStaleDays) return 'stale';
  return 'error';
}

function dayToMillis(value) {
  const normalized = parseIsoDay(value);
  if (!normalized) return null;
  return Date.UTC(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1, Number(normalized.slice(8, 10)));
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
