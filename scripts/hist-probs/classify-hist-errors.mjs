#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { readErrors } from '../lib/hist-probs/error-ledger.mjs';
import { loadCheckpoints } from '../lib/hist-probs/checkpoint-store.mjs';

const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const DEFAULT_OUT = path.join(ROOT, 'public/data/hist-probs/error-triage-latest.json');
const DEFAULT_CHECKPOINTS = path.join(ROOT, 'public/data/hist-probs/checkpoints.json');
const DEFAULT_RUN_SUMMARY = path.join(ROOT, 'public/data/hist-probs/run-summary.json');

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1';
  }
  return fallback;
}

function classifyError(entry = {}) {
  const error = String(entry.error_class || entry.error || '').toUpperCase();
  const message = String(entry.message || '').toUpperCase();
  if (error === 'NO_DATA' || message.includes('NO_DATA')) return 'NO_DATA';
  if (error === 'STALE_AFTER_REBUILD' || message.includes('STALE_AFTER_REBUILD')) return 'STALE_AFTER_REBUILD';
  if (error === 'TOO_SHORT_HISTORY' || message.includes('INSUFFICIENT') || message.includes('TOO_SHORT')) return 'TOO_SHORT_HISTORY';
  if (message.includes('NAN')) return 'NAN_PROPAGATION';
  if (message.includes('OOM') || message.includes('HEAP') || message.includes('MEMORY')) return 'OOM';
  if (message.includes('TIMEOUT')) return 'TIMEOUT';
  if (message.includes('PARSE') || message.includes('JSON')) return 'PARSE_ERROR';
  if (error === 'COMPUTE_ERROR') return 'COMPUTE_ERROR';
  return 'UNKNOWN';
}

function readJson(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function checkpointEntries(checkpointPath = DEFAULT_CHECKPOINTS) {
  const store = loadCheckpoints(checkpointPath);
  return Object.values(store?.tickers || {})
    .filter((entry) => ['error', 'no_data'].includes(String(entry?.status || '').toLowerCase()))
    .map((entry) => ({
      ticker: normalizeTicker(entry.ticker),
      ts: entry.updated_at || entry.computed_at || store?.updated_at || null,
      error: entry.error_class || entry.status || 'UNKNOWN',
      error_class: entry.error_class || null,
      message: entry.last_error || entry.reason || entry.status || 'checkpoint_residual',
      source: 'checkpoint',
    }))
    .filter((entry) => entry.ticker);
}

function runSummaryEntries(runSummaryPath = DEFAULT_RUN_SUMMARY) {
  const summary = readJson(runSummaryPath) || {};
  const generatedAt = summary.ran_at || null;
  const rows = [];
  for (const sample of Array.isArray(summary.error_samples) ? summary.error_samples : []) {
    rows.push({
      ticker: normalizeTicker(sample.ticker || sample.symbol),
      ts: generatedAt,
      error: sample.error || sample.code || 'COMPUTE_ERROR',
      message: sample.message || sample.reason || 'run_summary_error_sample',
      source: 'run_summary_error_samples',
    });
  }
  for (const sample of Array.isArray(summary.no_data_samples) ? summary.no_data_samples : []) {
    rows.push({
      ticker: normalizeTicker(sample.ticker || sample.symbol),
      ts: generatedAt,
      error: 'NO_DATA',
      message: sample.message || sample.reason || 'run_summary_no_data_sample',
      source: 'run_summary_no_data_samples',
    });
  }
  if (rows.length === 0 && Number(summary.tickers_remaining || 0) > 0) {
    rows.push({
      ticker: 'UNCLASSIFIED_REMAINING',
      ts: generatedAt,
      error: 'UNKNOWN',
      message: `tickers_remaining=${Number(summary.tickers_remaining || 0)}`,
      source: 'run_summary_remaining_sentinel',
    });
  }
  return rows.filter((entry) => entry.ticker);
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
  const bySource = {};
  for (const row of assets) {
    byClass[row.error_class] = (byClass[row.error_class] || 0) + 1;
    byAction[row.recommended_action] = (byAction[row.recommended_action] || 0) + 1;
  }
  for (const entry of entries) {
    const source = String(entry.source || 'ledger');
    bySource[source] = (bySource[source] || 0) + 1;
  }
  return {
    schema: 'rv.hist_probs.error_triage.v2',
    generated_at: new Date().toISOString(),
    source_entries: entries.length,
    unique_tickers: assets.length,
    dlq_count: assets.filter((row) => row.manual_reset_required).length,
    by_error_class: byClass,
    by_recommended_action: byAction,
    source_breakdown: bySource,
    samples: assets.slice(0, 100),
  };
}

async function main() {
  const maxAgeDays = Number(argValue('--max-age-days', '30'));
  const out = argValue('--out', DEFAULT_OUT);
  const entries = [
    ...readErrors({ maxAgeDays: Number.isFinite(maxAgeDays) ? maxAgeDays : 30 }).map((entry) => ({ ...entry, source: entry.source || 'ledger' })),
    ...checkpointEntries(),
    ...runSummaryEntries(),
  ];
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
