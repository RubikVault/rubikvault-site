#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { histProbsReadCandidates } from '../lib/hist-probs/path-resolver.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public/data/reports');

function parseArgs(argv) {
  const out = { ticker: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--ticker=')) out.ticker = String(arg.split('=')[1] || '').trim().toUpperCase();
  }
  if (!out.ticker) throw new Error('missing_ticker');
  return out;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function findSnapshotRows(doc, ticker) {
  const matches = [];
  for (const section of ['stocks', 'etfs']) {
    for (const horizon of ['short', 'medium', 'long']) {
      const rows = doc?.data?.[section]?.[horizon] || [];
      for (const row of rows) {
        if (String(row?.ticker || '').toUpperCase() === ticker) {
          matches.push({ section, horizon, row });
        }
      }
    }
  }
  return matches;
}

async function maybeFetchApiStock(ticker) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`http://127.0.0.1:8788/api/stock?ticker=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { ticker } = parseArgs(process.argv);
  const learning = readJson(path.join(ROOT, 'public/data/reports/learning-report-latest.json'));
  const runtime = readJson(path.join(ROOT, 'public/data/runtime/stock-analyzer-control.json'));
  const snapshot = readJson(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'));
  const histProbs = histProbsReadCandidates(path.join(ROOT, 'public/data/hist-probs'), ticker)
    .map((candidate) => readJson(candidate))
    .find(Boolean) || null;
  const fundamentals = readJson(path.join(ROOT, 'public/data/fundamentals', `${ticker}.json`));
  const earningsFeed = readJson(path.join(ROOT, 'public/data/earnings-calendar/latest.json'));
  const apiPayload = await maybeFetchApiStock(ticker);
  const trace = {
    schema: 'rv.analyzer_ticker_trace.v1',
    generated_at: new Date().toISOString(),
    ticker,
    run_id: runtime?.run_id || learning?.run_id || null,
    target_market_date: runtime?.target_market_date || learning?.target_market_date || learning?.date || null,
    runtime_control: {
      learning_status: runtime?.learning_status || null,
      learning_gate: runtime?.learning_gate || null,
      minimum_n_status: runtime?.minimum_n_status || null,
    },
    learning_report: {
      learning_status: learning?.features?.stock_analyzer?.learning_status || null,
      learning_gate: learning?.learning_gate || learning?.features?.stock_analyzer?.learning_gate || null,
      summary_status: learning?.summary?.learning_status_current || learning?.summary?.overall_status || null,
    },
    hist_probs: {
      latest_date: histProbs?.latest_date || null,
      computed_at: histProbs?.computed_at || null,
      has_profile: histProbs?.has_profile ?? null,
    },
    fundamentals: {
      nextEarningsDate: fundamentals?.nextEarningsDate || null,
      confirmedCatalysts: fundamentals?.confirmedCatalysts || [],
    },
    earnings_feed: earningsFeed?.data?.[ticker] || null,
    api_decision: apiPayload?.decision || apiPayload?.evaluation_v4?.decision || null,
    api_catalysts: apiPayload?.data?.catalysts || null,
    snapshot_matches: findSnapshotRows(snapshot, ticker),
  };
  writeJson(path.join(OUTPUT_DIR, `${ticker.toLowerCase()}-trace-latest.json`), trace);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
