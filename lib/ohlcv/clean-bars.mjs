import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_POLICY_PATH = path.join(process.cwd(), 'lib/ohlcv/ohlcv_policy.json');

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateString(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function nowDayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueSortedDates(rows) {
  const seen = new Set();
  const out = [];
  let duplicateCount = 0;
  for (const row of rows) {
    if (seen.has(row.date)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(row.date);
    out.push(row);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { rows: out, duplicateCount };
}

function buildFailure(reason, meta = {}, warnings = []) {
  return { ok: false, bars: null, meta: { ...meta, warnings }, reason };
}

function buildSuccess(bars, meta = {}, warnings = []) {
  return { ok: true, bars, meta: { ...meta, warnings }, reason: null };
}

function normalizeRowLike(raw, policy) {
  const date = normalizeDateString(raw?.date || raw?.d || raw?.timestamp || raw?.time);
  const open = toFiniteNumber(raw?.open ?? raw?.o);
  const high = toFiniteNumber(raw?.high ?? raw?.h);
  const low = toFiniteNumber(raw?.low ?? raw?.l);
  const close = toFiniteNumber(raw?.close ?? raw?.c);
  const volume = toFiniteNumber(raw?.volume ?? raw?.v ?? 0);

  if (!date) return { ok: false, reason: 'INVALID_ROW_SHAPE' };
  if ([open, high, low, close].some((v) => v === null)) return { ok: false, reason: 'NAN_IN_SERIES' };
  if (!policy?.validation?.allow_zero_or_negative_prices && [open, high, low, close].some((v) => v <= 0)) {
    return { ok: false, reason: 'NON_POSITIVE_PRICE' };
  }
  if (!policy?.validation?.allow_negative_volume && volume !== null && volume < 0) {
    return { ok: false, reason: 'NEGATIVE_VOLUME' };
  }
  if (high < low) return { ok: false, reason: 'INVALID_ROW_SHAPE' };
  if (!policy?.validation?.allow_future_dates && date > nowDayUtc()) {
    return { ok: false, reason: 'FUTURE_DATE' };
  }

  return {
    ok: true,
    row: {
      date,
      open,
      high,
      low,
      close,
      volume: volume ?? 0
    }
  };
}

export async function loadDefaultPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const raw = await fs.readFile(policyPath, 'utf8');
  return JSON.parse(raw);
}

export function validate(bars, policy = {}) {
  const minBars = Number(policy?.min_bars || 0) || 0;
  if (!Array.isArray(bars) || bars.length === 0) {
    return buildFailure('EMPTY_INPUT', { rows_in: 0 });
  }

  const warnings = [];
  const normalized = [];
  const reasonCounts = {};
  for (const raw of bars) {
    const res = normalizeRowLike(raw, policy);
    if (!res.ok) {
      reasonCounts[res.reason] = (reasonCounts[res.reason] || 0) + 1;
      continue;
    }
    normalized.push(res.row);
  }

  if (normalized.length === 0) {
    return buildFailure('NO_VALID_ROWS', { rows_in: bars.length, dropped: reasonCounts }, warnings);
  }

  let deduped = normalized;
  let duplicateCount = 0;
  if (policy?.validation?.dedupe_by_date !== false) {
    const d = uniqueSortedDates(normalized);
    deduped = d.rows;
    duplicateCount = d.duplicateCount;
    if (duplicateCount > 0) warnings.push({ reason: 'DUPLICATE_DATES', count: duplicateCount });
  }

  if (policy?.validation?.require_monotonic_dates !== false) {
    for (let i = 1; i < deduped.length; i += 1) {
      if (deduped[i].date < deduped[i - 1].date) {
        return buildFailure(
          'NON_MONOTONIC_DATES',
          { rows_in: bars.length, rows_valid: deduped.length, dropped: reasonCounts },
          warnings
        );
      }
    }
  }

  if (minBars > 0 && deduped.length < minBars) {
    return buildFailure(
      'INSUFFICIENT_BARS',
      { rows_in: bars.length, rows_valid: deduped.length, min_bars: minBars, dropped: reasonCounts },
      warnings
    );
  }

  return buildSuccess(deduped, {
    rows_in: bars.length,
    rows_valid: deduped.length,
    dropped: reasonCounts,
    policy_version: policy?.version || null
  }, warnings);
}

export function normalizeFromRawBars(rawBars, policy = {}) {
  return validate(rawBars, policy);
}

export function normalizeFromPackRow(packRow, policy = {}) {
  const candidates = [
    packRow?.bars,
    packRow?.data?.bars,
    packRow?.payload?.data?.bars,
    packRow?.payload?.bars
  ];
  const rows = candidates.find((v) => Array.isArray(v)) || [];
  return validate(rows, policy);
}

export function rejectReason(error) {
  if (!error) return 'INVALID_ROW_SHAPE';
  const msg = String(error?.message || error);
  if (/future/i.test(msg)) return 'FUTURE_DATE';
  if (/duplicate/i.test(msg)) return 'DUPLICATE_DATES';
  if (/monotonic/i.test(msg)) return 'NON_MONOTONIC_DATES';
  if (/insufficient/i.test(msg)) return 'INSUFFICIENT_BARS';
  return 'INVALID_ROW_SHAPE';
}

