#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import { evaluateTickerViaSharedCore } from '../lib/best-setups-local-loader.mjs';

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'mirrors/learning/reports/best-setups-ssot-parity-latest.json');
const DEFAULT_PORT = Number(process.env.PORT || 8788);
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const DEFAULT_TICKERS = ['AAPL', 'ERAS', 'NVDA'];
const HORIZONS = ['short', 'medium', 'long'];

function parseArgs(argv) {
  const out = {
    port: DEFAULT_PORT,
    baseUrl: null,
    tickers: [],
    timeoutMs: 90_000,
    keepServer: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--port=')) out.port = Number(arg.split('=')[1]) || DEFAULT_PORT;
    else if (arg.startsWith('--base-url=')) out.baseUrl = String(arg.split('=')[1] || '').trim() || null;
    else if (arg.startsWith('--tickers=')) out.tickers = String(arg.split('=')[1] || '').split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
    else if (arg.startsWith('--timeout-ms=')) out.timeoutMs = Number(arg.split('=')[1]) || out.timeoutMs;
    else if (arg === '--keep-server') out.keepServer = true;
  }
  if (!out.baseUrl) out.baseUrl = `http://127.0.0.1:${out.port}`;
  return out;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function loadSnapshotTickers() {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'), 'utf8'));
    const stocks = doc?.data?.stocks || {};
    const out = new Set();
    for (const horizon of HORIZONS) {
      for (const row of (stocks[horizon] || []).slice(0, 3)) {
        const ticker = String(row?.ticker || '').trim().toUpperCase();
        if (ticker) out.add(ticker);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

function normalizeContract(doc) {
  const rows = doc?.v4_contract || {};
  const out = {};
  for (const key of ['scientific', 'forecast', 'elliott', 'quantlab', 'fallback_state', 'scientific_eligibility', 'timeframe_confluence', 'decision_trace']) {
    const row = rows[key] || {};
    out[key] = {
      status: row?.status || null,
      reason: row?.reason || null,
      as_of: row?.as_of || null,
      source: row?.source || null,
    };
  }
  return out;
}

function normalizeV4(doc) {
  return {
    decision: doc?.decision || null,
    states: doc?.states || null,
    input_fingerprints: doc?.input_fingerprints || null,
    v4_contract: normalizeContract(doc),
  };
}

function normalizeStockPayload(payload) {
  return normalizeV4(payload?.evaluation_v4 || {});
}

function pickSnapshotPresence(ticker) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'), 'utf8'));
    const stocks = doc?.data?.stocks || {};
    const result = {};
    for (const horizon of HORIZONS) {
      result[horizon] = Boolean((stocks[horizon] || []).some((row) => String(row?.ticker || '').toUpperCase() === ticker));
    }
    return result;
  } catch {
    return { short: false, medium: false, long: false };
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.json();
}

async function waitForServer(baseUrl, timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while ((Date.now() - started) < timeoutMs) {
    try {
      const payload = await fetchJson(`${baseUrl}/api/stock?ticker=SPY`);
      if (payload?.data) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`local server did not become ready within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`);
}

function spawnLocalServer(port) {
  const child = spawn('npm', ['run', 'dev:pages:port'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[parity-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[parity-server] ${chunk}`));
  return child;
}

async function compareTicker(baseUrl, ticker) {
  const [stockPayload, insightsPayload, directPayload] = await Promise.all([
    fetchJson(`${baseUrl}/api/stock?ticker=${encodeURIComponent(ticker)}`),
    fetchJson(`${baseUrl}/api/stock-insights-v4?ticker=${encodeURIComponent(ticker)}`),
    evaluateTickerViaSharedCore(ticker),
  ]);

  const stockV4 = normalizeStockPayload(stockPayload);
  const insightsV4 = normalizeV4(insightsPayload);
  const directV4 = normalizeV4(directPayload);

  let stockVsInsights = true;
  let stockVsDirect = true;
  let insightsVsDirect = true;
  const mismatches = [];

  try { assert.deepStrictEqual(stockV4, insightsV4); } catch (error) {
    stockVsInsights = false;
    mismatches.push({ kind: 'stock_vs_insights', message: error.message });
  }
  try { assert.deepStrictEqual(stockV4, directV4); } catch (error) {
    stockVsDirect = false;
    mismatches.push({ kind: 'stock_vs_direct', message: error.message });
  }
  try { assert.deepStrictEqual(insightsV4, directV4); } catch (error) {
    insightsVsDirect = false;
    mismatches.push({ kind: 'insights_vs_direct', message: error.message });
  }

  const snapshotPresence = pickSnapshotPresence(ticker);
  const snapshotChecks = {};
  for (const horizon of HORIZONS) {
    const slice = stockV4?.decision?.horizons?.[horizon] || {};
    snapshotChecks[horizon] = snapshotPresence[horizon]
      ? {
          snapshot_present: true,
          verdict_ok: String(slice?.verdict || '').toUpperCase() === 'BUY',
          confidence_ok: String(slice?.confidence_bucket || '').toUpperCase() === 'HIGH',
          gates_ok: Array.isArray(slice?.trigger_gates) && slice.trigger_gates.length === 0,
        }
      : { snapshot_present: false };
  }

  return {
    ticker,
    ok: stockVsInsights && stockVsDirect && insightsVsDirect,
    checks: {
      stock_vs_insights: stockVsInsights,
      stock_vs_direct: stockVsDirect,
      insights_vs_direct: insightsVsDirect,
    },
    snapshot_checks: snapshotChecks,
    mismatches,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const tickers = Array.from(new Set([...
    (options.tickers.length ? options.tickers : []),
    ...loadSnapshotTickers(),
    ...DEFAULT_TICKERS,
  ].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)));

  let child = null;
  const startedAt = Date.now();
  try {
    if (!options.baseUrl || options.baseUrl === DEFAULT_BASE_URL || options.baseUrl === `http://127.0.0.1:${options.port}`) {
      child = spawnLocalServer(options.port);
      await waitForServer(options.baseUrl, options.timeoutMs);
    }

    const rows = [];
    for (const ticker of tickers) {
      rows.push(await compareTicker(options.baseUrl, ticker));
    }

    const report = {
      schema_version: 'rv.best-setups.ssot.local-parity.v1',
      generated_at: new Date().toISOString(),
      base_url: options.baseUrl,
      tickers,
      duration_ms: Date.now() - startedAt,
      summary: {
        total: rows.length,
        ok: rows.filter((row) => row.ok).length,
        failed: rows.filter((row) => !row.ok).length,
      },
      rows,
    };
    writeJson(REPORT_PATH, report);

    console.log(`[best-setups-ssot-parity] wrote ${path.relative(ROOT, REPORT_PATH)}`);
    console.log(`[best-setups-ssot-parity] total=${report.summary.total} ok=${report.summary.ok} failed=${report.summary.failed}`);

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (child && !options.keepServer) {
      child.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(`[best-setups-ssot-parity] failed: ${error?.stack || error?.message || String(error)}`);
  process.exit(1);
});
