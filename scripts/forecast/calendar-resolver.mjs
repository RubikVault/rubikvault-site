import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const US_CALENDAR_PATH = path.join(ROOT, 'policies/calendars/US/2026.json');
const EXCHANGE_MARKET = {
  US: 'US',
  NYSE: 'US',
  NASDAQ: 'US',
  AMEX: 'US',
  ARCA: 'US',
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const US_CALENDAR = readJson(US_CALENDAR_PATH);
const US_HOLIDAYS = new Set(Array.isArray(US_CALENDAR?.holidays) ? US_CALENDAR.holidays : []);

export function resolveForecastCalendar(input = {}) {
  const symbol = String(input.symbol || input.ticker || '').trim().toUpperCase() || null;
  const exchange = String(input.exchange || input.market || '').trim().toUpperCase() || null;
  const inferredMarket = !exchange && symbol && !symbol.includes('.') ? 'US' : null;
  const market = exchange ? (EXCHANGE_MARKET[exchange] || null) : inferredMarket;
  const supported = market === 'US';
  return {
    symbol,
    exchange,
    market,
    calendar: supported ? 'US' : null,
    supported,
    promotable: supported,
    reason: supported ? null : 'not_promotable_unsupported_calendar',
  };
}

export function isCalendarTradingDay(dateStr, calendar = 'US') {
  const date = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (calendar === 'US' && US_HOLIDAYS.has(String(dateStr).slice(0, 10))) return false;
  return calendar === 'US';
}
