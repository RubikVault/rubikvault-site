#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { readErrors } from '../lib/hist-probs/error-ledger.mjs';

const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const DEFAULT_OUT = path.join(ROOT, 'public/data/hist-probs/error-triage-latest.json');

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!hit) return fallback;
  if (hit === name) return '1';
  return hit.slice(prefix.length);
}

function classifyError(entry = {}) {
  const error = String(entry.error || '').toUpperCase();
  const message = String(entry.message || '').toUpperCase();
  if (error === 'NO_DATA' || message.includes('NO_DATA')) return 'NO_DATA';
  if (message.includes('STALE_AFTER_REBUILD')) return 'STALE_AFTER_REBUILD';
  if (message.includes('INSUFFICIENT') || message.includes('TOO_SHORT')) return 'TOO_SHORT_HISTORY';
  if (message.includes('NAN')) return 'NAN_PROPAGATION';
  if (message.includes('OOM') || message.includes('HEAP') || message.includes('MEMORY')) return 'OOM';
  if (message.includes('TIMEOUT')) return 'TIMEOUT';
  if (message.includes('PARSE') || message.includes('JSON')) return 'PARSE_ERROR';
  if (error === 'COMPUTE_ERROR') return 'COMPUTE_ERROR';
  return 'UNKNOWN';
}

function actionForClass(errorClass, count) {
  if (errorClass === 'NO_DATA') return 'provider_or_registry_triage';
  if (errorClass === 'STALE_AFTER_REBUILD') return 'history_pack_refresh_or_delist_classification';
  if (errorClass === 'TOO_SHORT_HISTORY') return 'mark_not_eligible_until_min_bars';
  if (['OOM', 'TIMEOUT'].includes(errorClass)) return 'retry_smaller_batch';
  if (count >= 3) return 'dlq_manual_review';
  return 'retry_with_backoff';
}

export function buildHistErrorTriage(entries) {
  const byTicker = new Map();
  for (const entry of entries) {
    const ticker = String(entry.ticker || '').trim().toUpperCase();
    if (!ticker) continue;
    const errorClass = classifyError(entry);
    const existing = byTicker.get(ticker) || {
      ticker,
      count: 0,
      first_seen: entry.ts || null,
      last_seen: entry.ts || null,
      classes: {},
      last_error: null,
      last_message: null,
    };
    existing.count += 1;
    existing.first_seen = [existing.first_seen, entry.ts].filter(Boolean).sort()[0] || null;
    existing.last_seen = [existing.last_seen, entry.ts].filter(Boolean).sort().at(-1) || null;
    existing.classes[errorClass] = (existing.classes[errorClass] || 0) + 1;
    existing.last_error = entry.error || null;
    existing.last_message = entry.message || null;
    byTicker.set(ticker, existing);
  }
  const assets = [...byTicker.values()].map((row) => {
    const dominant = Object.entries(row.classes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';
    return {
      ...row,
      error_class: dominant,
      retry_count: row.count,
      manual_reset_required: row.count >= 3 && !['NO_DATA', 'TOO_SHORT_HISTORY'].includes(dominant),
      recommended_action: actionForClass(dominant, row.count),
    };
  }).sort((a, b) => b.count - a.count || a.ticker.localeCompare(b.ticker));
  const byClass = {};
  const byAction = {};
  for (const row of assets) {
    byClass[row.error_class] = (byClass[row.error_class] || 0) + 1;
    byAction[row.recommended_action] = (byAction[row.recommended_action] || 0) + 1;
  }
  return {
    schema: 'rv.hist_probs.error_triage.v2',
    generated_at: new Date().toISOString(),
    source_entries: entries.length,
    unique_tickers: assets.length,
    by_error_class: byClass,
    by_recommended_action: byAction,
    samples: assets.slice(0, 100),
  };
}

async function main() {
  const maxAgeDays = Number(argValue('--max-age-days', '30'));
  const out = argValue('--out', DEFAULT_OUT);
  const entries = readErrors({ maxAgeDays: Number.isFinite(maxAgeDays) ? maxAgeDays : 30 });
  const doc = buildHistErrorTriage(entries);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2));
  await fs.rename(tmp, out);
  console.log(`[hist-probs:errors] wrote ${path.relative(ROOT, out)} unique=${doc.unique_tickers}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[hist-probs:errors] fatal', error);
    process.exit(1);
  });
}
