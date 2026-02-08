import fs from 'node:fs';
import path from 'node:path';

function parseDatePartsInTz(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function loadCalendar(repoRoot, calendarRelPath = 'scripts/forecast/v6/lib/calendar/nyse_holidays.json') {
  const calendarPath = path.join(repoRoot, calendarRelPath);
  const calendar = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));
  return {
    ...calendar,
    _holidaySet: new Set(calendar.holidays || [])
  };
}

export function isTradingDay(dateStr, calendar) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (calendar?._holidaySet?.has(dateStr)) return false;
  return true;
}

export function previousTradingDay(dateStr, calendar, maxLookback = 15) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  for (let i = 0; i < maxLookback; i++) {
    date.setUTCDate(date.getUTCDate() - 1);
    const candidate = date.toISOString().slice(0, 10);
    if (isTradingDay(candidate, calendar)) return candidate;
  }
  throw new Error(`CALENDAR_RESOLUTION_FAILED: previous trading day not found for ${dateStr}`);
}

export function nextTradingDay(dateStr, calendar, maxLookahead = 15) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  for (let i = 0; i < maxLookahead; i++) {
    date.setUTCDate(date.getUTCDate() + 1);
    const candidate = date.toISOString().slice(0, 10);
    if (isTradingDay(candidate, calendar)) return candidate;
  }
  throw new Error(`CALENDAR_RESOLUTION_FAILED: next trading day not found for ${dateStr}`);
}

export function addTradingDays(dateStr, offset, calendar) {
  if (offset === 0) return dateStr;
  let current = dateStr;
  let remaining = Math.abs(offset);
  const step = offset > 0 ? 1 : -1;
  while (remaining > 0) {
    current = step > 0 ? nextTradingDay(current, calendar) : previousTradingDay(current, calendar);
    remaining--;
  }
  return current;
}

export function tradingDaysBetween(startDateExclusive, endDateInclusive, calendar) {
  let count = 0;
  let current = startDateExclusive;
  while (current < endDateInclusive) {
    current = nextTradingDay(current, calendar);
    if (current <= endDateInclusive) count++;
  }
  return count;
}

export function calendarCoverageInfo(dateStr, calendar) {
  const year = Number(dateStr.slice(0, 4));
  const years = Array.isArray(calendar?.years) ? calendar.years : [];
  return {
    year,
    covered: years.includes(year),
    covered_years: years
  };
}

export function resolveTradingDate({
  repoRoot,
  requestedDate = null,
  timestamp = new Date(),
  timeZone = 'America/New_York',
  calendarRelPath = 'scripts/forecast/v6/lib/calendar/nyse_holidays.json'
}) {
  const calendar = loadCalendar(repoRoot, calendarRelPath);
  let baseDate = requestedDate || parseDatePartsInTz(timestamp, timeZone);

  const coverage = calendarCoverageInfo(baseDate, calendar);
  if (!isTradingDay(baseDate, calendar)) {
    baseDate = previousTradingDay(baseDate, calendar);
  }

  return {
    asof_date: baseDate,
    calendar,
    coverage
  };
}

export default {
  loadCalendar,
  isTradingDay,
  previousTradingDay,
  nextTradingDay,
  addTradingDays,
  tradingDaysBetween,
  resolveTradingDate,
  calendarCoverageInfo
};
