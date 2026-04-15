#!/usr/bin/env node
/**
 * Error Ledger for hist_probs runs.
 *
 * Append-only NDJSON ledger that records per-ticker errors across runs.
 * Supports retention cleanup (default 7 days via policy).
 *
 * Usage:
 *   import { appendError, readErrors, cleanupLedger } from './error-ledger.mjs';
 *   appendError({ ticker: 'AAPL', error: 'NO_DATA', run_id: '...' });
 *   const recent = readErrors({ maxAgeDays: 7 });
 *   cleanupLedger({ maxAgeDays: 7 });
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const DEFAULT_LEDGER_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/error-ledger.ndjson');
const DEFAULT_MAX_AGE_DAYS = 7;

/**
 * Append a single error entry to the ledger.
 * @param {object} entry - { ticker, error, message?, run_id?, severity? }
 * @param {string} [ledgerPath] - Override ledger file path
 */
export function appendError(entry, ledgerPath = DEFAULT_LEDGER_PATH) {
  const record = {
    ts: new Date().toISOString(),
    ticker: String(entry.ticker || '').toUpperCase(),
    error: String(entry.error || 'UNKNOWN'),
    message: entry.message || null,
    run_id: entry.run_id || null,
    severity: entry.severity || 'error',
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Append multiple errors atomically via a single write.
 * @param {object[]} entries
 * @param {string} [ledgerPath]
 */
export function appendErrors(entries, ledgerPath = DEFAULT_LEDGER_PATH) {
  if (!entries || entries.length === 0) return;
  const lines = entries.map((entry) => {
    return JSON.stringify({
      ts: new Date().toISOString(),
      ticker: String(entry.ticker || '').toUpperCase(),
      error: String(entry.error || 'UNKNOWN'),
      message: entry.message || null,
      run_id: entry.run_id || null,
      severity: entry.severity || 'error',
    });
  });
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, lines.join('\n') + '\n', 'utf8');
}

/**
 * Read all ledger entries, optionally filtering by max age.
 * @param {object} [options]
 * @param {number} [options.maxAgeDays]
 * @param {string} [options.ledgerPath]
 * @returns {object[]}
 */
export function readErrors({ maxAgeDays = null, ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch {
    return [];
  }
  const cutoff = maxAgeDays != null ? Date.now() - maxAgeDays * 86_400_000 : 0;
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (cutoff > 0 && entry.ts && new Date(entry.ts).getTime() < cutoff) continue;
      entries.push(entry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Remove entries older than maxAgeDays. Atomic write via tmp+rename.
 * @param {object} [options]
 * @param {number} [options.maxAgeDays]
 * @param {string} [options.ledgerPath]
 * @returns {{ before: number, after: number, removed: number }}
 */
export function cleanupLedger({ maxAgeDays = DEFAULT_MAX_AGE_DAYS, ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch {
    return { before: 0, after: 0, removed: 0 };
  }
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const lines = raw.split('\n').filter((l) => l.trim());
  const kept = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.ts && new Date(entry.ts).getTime() >= cutoff) {
        kept.push(line);
      }
    } catch {
      // drop malformed
    }
  }
  const removed = lines.length - kept.length;
  if (removed > 0) {
    const tmpPath = `${ledgerPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, kept.length > 0 ? kept.join('\n') + '\n' : '', 'utf8');
    fs.renameSync(tmpPath, ledgerPath);
  }
  return { before: lines.length, after: kept.length, removed };
}

/**
 * Summary of current ledger state.
 * @param {object} [options]
 * @param {number} [options.maxAgeDays]
 * @param {string} [options.ledgerPath]
 * @returns {{ total: number, unique_tickers: number, by_error: Record<string, number> }}
 */
export function ledgerSummary({ maxAgeDays = DEFAULT_MAX_AGE_DAYS, ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  const entries = readErrors({ maxAgeDays, ledgerPath });
  const tickers = new Set();
  const byError = {};
  for (const entry of entries) {
    tickers.add(entry.ticker);
    byError[entry.error] = (byError[entry.error] || 0) + 1;
  }
  return {
    total: entries.length,
    unique_tickers: tickers.size,
    by_error: byError,
  };
}
