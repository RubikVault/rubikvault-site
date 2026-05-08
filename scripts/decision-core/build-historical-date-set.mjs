#!/usr/bin/env node

import { isoDate, parseArgs, writeJsonAtomic, ROOT } from './shared.mjs';
import path from 'node:path';

const DEFAULT_MIN_DAYS = 60;
const DEFAULT_PREFER_DAYS = 120;
const MATURITY_CALENDAR_DAYS = 32;

export function isWeekday(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildHistoricalDateSet({
  targetMarketDate,
  minDays = DEFAULT_MIN_DAYS,
  preferDays = DEFAULT_PREFER_DAYS,
  maturityCalendarDays = MATURITY_CALENDAR_DAYS,
} = {}) {
  const target = isoDate(targetMarketDate);
  if (!target) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const limit = Math.max(Number(minDays) || DEFAULT_MIN_DAYS, Number(preferDays) || DEFAULT_PREFER_DAYS);
  const end = addDays(target, -Math.max(1, Number(maturityCalendarDays) || MATURITY_CALENDAR_DAYS));
  const dates = [];
  let cursor = end;
  while (dates.length < limit) {
    if (isWeekday(cursor)) dates.push(cursor);
    cursor = addDays(cursor, -1);
  }
  const stress = dates.filter((_, index) => index % 11 === 0).slice(0, 10);
  const recent = dates.slice(0, Math.min(40, dates.length));
  const stratified = dates.filter((_, index) => index % 7 === 3).slice(0, 10);
  const selected = Array.from(new Set([...recent, ...stress, ...stratified, ...dates])).slice(0, limit).sort();
  return {
    schema: 'rv.decision_core_historical_date_set.v1',
    target_market_date: target,
    min_days: Number(minDays) || DEFAULT_MIN_DAYS,
    prefer_days: Number(preferDays) || DEFAULT_PREFER_DAYS,
    maturity_calendar_days: maturityCalendarDays,
    selected_count: selected.length,
    selected_dates: selected,
    selection_policy: 'latest_matured_plus_stress_plus_stratified_weekdays_v1',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const readNumber = (name, fallback) => {
    const eq = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    if (eq) return Number(eq.split('=')[1] || fallback);
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? Number(process.argv[index + 1] || fallback) : fallback;
  };
  const minDays = readNumber('min-days', 60);
  const preferDays = readNumber('prefer-days', 120);
  const doc = buildHistoricalDateSet({ targetMarketDate: opts.targetMarketDate, minDays, preferDays });
  const out = path.join(ROOT, 'public/data/reports/decision-core-historical-date-set-latest.json');
  writeJsonAtomic(out, doc);
  console.log(JSON.stringify(doc, null, 2));
}
