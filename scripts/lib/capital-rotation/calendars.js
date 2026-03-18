/**
 * Capital Rotation Monitor — Trading Calendar Utilities
 */

const WEEKDAYS = new Set([1, 2, 3, 4, 5]); // Mon=1 .. Fri=5

/**
 * Check if a date string (YYYY-MM-DD) is a weekday trading day.
 * V1: weekday-only heuristic (no exchange holiday calendar).
 */
export function isTradingDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return WEEKDAYS.has(d.getUTCDay() === 0 ? 7 : d.getUTCDay());
}

/**
 * Given a date, return the most recent trading day (inclusive).
 * Rolls back to Friday if Saturday/Sunday.
 */
export function alignToLastTradingDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Check if a symbol trades 24/7 (crypto).
 */
export function isCrypto(symbol) {
  return typeof symbol === 'string' && symbol.endsWith('.CC');
}

/**
 * Filter bars to trading days only (remove weekends).
 * Useful for crypto bars that include weekends.
 */
export function filterToTradingDays(bars) {
  return bars.filter(b => isTradingDay(b.date));
}

/**
 * Count trading days between two date strings.
 */
export function tradingDaysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  let count = 0;
  const current = new Date(Math.min(a, b));
  const end = new Date(Math.max(a, b));
  while (current < end) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dow = current.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
