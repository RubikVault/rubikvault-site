const US_MARKET_HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
]);

export const US_MARKET_CLOSE_UTC = { hour: 20, minute: 15 };

export function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

export function diffDays(fromDay, toDay) {
  const from = Date.UTC(Number(fromDay.slice(0, 4)), Number(fromDay.slice(5, 7)) - 1, Number(fromDay.slice(8, 10)));
  const to = Date.UTC(Number(toDay.slice(0, 4)), Number(toDay.slice(5, 7)) - 1, Number(toDay.slice(8, 10)));
  return Math.floor((to - from) / 86400000);
}

export function minutesSinceUtcMidnight(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function isWeekendIsoDay(isoDate) {
  const parsed = parseIsoDay(isoDate);
  if (!parsed) return false;
  const date = new Date(`${parsed}T12:00:00Z`);
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

export function isUsMarketHoliday(isoDate) {
  const parsed = parseIsoDay(isoDate);
  if (!parsed) return false;
  return US_MARKET_HOLIDAYS_2026.has(parsed);
}

export function isUsTradingDay(isoDate) {
  const parsed = parseIsoDay(isoDate);
  if (!parsed) return false;
  return !isWeekendIsoDay(parsed) && !isUsMarketHoliday(parsed);
}

export function previousUsTradingDay(isoDate) {
  let cursor = parseIsoDay(isoDate);
  if (!cursor) return null;
  const date = new Date(`${cursor}T12:00:00Z`);
  do {
    date.setUTCDate(date.getUTCDate() - 1);
    cursor = isoDay(date);
  } while (cursor && !isUsTradingDay(cursor));
  return cursor;
}

export function latestUsMarketSessionIso(now = new Date(), closeUtc = US_MARKET_CLOSE_UTC) {
  const today = isoDay(now);
  const afterClose = now.getUTCHours() > closeUtc.hour
    || (now.getUTCHours() === closeUtc.hour && now.getUTCMinutes() >= closeUtc.minute);
  if (afterClose && isUsTradingDay(today)) {
    return today;
  }
  return previousUsTradingDay(today);
}

export function tradingDaysBetween(olderIso, newerIso) {
  const older = parseIsoDay(olderIso);
  const newer = parseIsoDay(newerIso);
  if (!older || !newer) return null;
  if (newer <= older) return 0;
  let count = 0;
  const cursor = new Date(`${older}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (isoDay(cursor) <= newer) {
    if (isUsTradingDay(isoDay(cursor))) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function computeStatusFromDataDate(dataDate, now = new Date(), maxStaleDays = 2, pendingWindowMinutes = 0) {
  const normalized = parseIsoDay(dataDate);
  if (!normalized) {
    return minutesSinceUtcMidnight(now) <= pendingWindowMinutes ? 'pending' : 'error';
  }
  const latestSession = latestUsMarketSessionIso(now);
  if (!latestSession) return 'unknown';
  if (normalized === latestSession) return 'fresh';
  const ageTradingDays = tradingDaysBetween(normalized, latestSession);
  if (ageTradingDays == null) return 'unknown';
  if (ageTradingDays <= maxStaleDays) return 'stale';
  return 'error';
}

