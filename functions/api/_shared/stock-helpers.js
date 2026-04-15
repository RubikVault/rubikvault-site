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
export {
  computeStatusFromDataDate,
  diffDays,
  isoDay,
  latestUsMarketSessionIso,
  minutesSinceUtcMidnight,
  parseIsoDay,
  tradingDaysBetween,
} from './market-calendar.js';

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

function dayToMillis(value) {
  const normalized = typeof value === 'string' ? value.trim().slice(0, 10) : null;
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
