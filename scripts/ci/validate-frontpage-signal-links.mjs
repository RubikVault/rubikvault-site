#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, 'public/data/snapshots/best-setups-v4.json');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/frontpage-signal-link-validation-latest.json');
const DEFAULT_PORT = Number(process.env.PORT || 8788);
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_RETRIES = 2;
const VALIDATION_CONCURRENCY = 4;

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

function parseArgs(argv) {
  const out = {
    port: DEFAULT_PORT,
    baseUrl: null,
    keepServer: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--port=')) out.port = Number(arg.split('=')[1]) || DEFAULT_PORT;
    else if (arg.startsWith('--base-url=')) out.baseUrl = String(arg.split('=')[1] || '').trim() || null;
    else if (arg === '--keep-server') out.keepServer = true;
  }
  if (!out.baseUrl) out.baseUrl = `http://127.0.0.1:${out.port}`;
  return out;
}

function collectSnapshotTickers(snapshot) {
  const sections = ['stocks', 'etfs'];
  const horizons = ['short', 'medium', 'long'];
  const tickers = new Set();
  for (const section of sections) {
    for (const horizon of horizons) {
      for (const row of snapshot?.data?.[section]?.[horizon] || []) {
        const ticker = String(row?.ticker || '').trim().toUpperCase();
        if (ticker) tickers.add(ticker);
      }
    }
  }
  return [...tickers];
}

function canReuseReport(existingReport, tickers) {
  if (!existingReport || existingReport?.summary?.failed > 0) return false;
  const generatedDate = String(existingReport?.generated_at || '').slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!generatedDate || generatedDate !== today) return false;
  const reportTickers = Array.isArray(existingReport?.rows)
    ? existingReport.rows.map((row) => String(row?.ticker || '').trim().toUpperCase()).filter(Boolean).sort()
    : [];
  const expectedTickers = [...tickers].map((ticker) => String(ticker || '').trim().toUpperCase()).filter(Boolean).sort();
  return reportTickers.length === expectedTickers.length
    && reportTickers.every((ticker, index) => ticker === expectedTickers[index]);
}

async function fetchJson(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error('request_failed');
}

async function waitForServer(baseUrl, childInfo = null, timeoutMs = 120_000) {
  const started = Date.now();
  let lastError = null;
  while ((Date.now() - started) < timeoutMs) {
    if (childInfo?.exited) {
      const tail = (childInfo.logs || []).slice(-8).join('\n');
      throw new Error(`server_process_exited:${childInfo.exitCode ?? 'unknown'}${tail ? `\n${tail}` : ''}`);
    }
    try {
      const payload = await fetchJson(`${baseUrl}/api/stock?ticker=AAPL`);
      if (payload?.data?.ticker) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`server_not_ready${lastError ? `:${lastError.message}` : ''}`);
}

async function canUseExistingServer(baseUrl) {
  try {
    const payload = await fetchJson(`${baseUrl}/api/stock?ticker=AAPL`);
    return Boolean(payload?.data?.ticker);
  } catch {
    return false;
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`no_open_port_from_${startPort}`);
}

function spawnLocalServer(port) {
  const child = spawn('npm', ['run', 'dev:pages:port'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const info = { child, logs, exited: false, exitCode: null };
  const capture = (stream) => {
    stream?.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;
      logs.push(text);
      if (logs.length > 20) logs.shift();
    });
  };
  capture(child.stdout);
  capture(child.stderr);
  child.on('exit', (code) => {
    info.exited = true;
    info.exitCode = code;
  });
  return info;
}

async function stopLocalServer(childInfo) {
  if (!childInfo?.child) return;
  childInfo.child.stdout?.destroy();
  childInfo.child.stderr?.destroy();
  if (!childInfo.exited) {
    childInfo.child.kill('SIGTERM');
    const exited = await Promise.race([
      once(childInfo.child, 'exit').catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
    ]);
    if (exited === false && !childInfo.exited) {
      childInfo.child.kill('SIGKILL');
      await Promise.race([
        once(childInfo.child, 'exit').catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  }
}

function isRenderablePayload(payload) {
  return Boolean(
    payload?.data?.ticker &&
    (
      payload?.data?.market_prices?.date ||
      (Array.isArray(payload?.data?.bars) && payload.data.bars.length > 0) ||
      payload?.data?.name
    )
  );
}

async function validateTicker(baseUrl, ticker) {
  try {
    const payload = await fetchJson(`${baseUrl}/api/stock?ticker=${encodeURIComponent(ticker)}`);
    return {
      ticker,
      ok: isRenderablePayload(payload),
      source: payload?._rv_source || payload?.data?._rv_source || 'stock_api',
      as_of: payload?.metadata?.as_of || null,
      error: isRenderablePayload(payload) ? null : 'non_renderable_payload',
    };
  } catch (error) {
    return {
      ticker,
      ok: false,
      source: 'stock_api',
      as_of: null,
      error: error instanceof Error ? error.message : String(error || 'request_failed'),
    };
  }
}

async function mapLimit(items, limit, iteratee) {
  const out = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      out[current] = await iteratee(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function main() {
  const options = parseArgs(process.argv);
  const snapshot = readJson(SNAPSHOT_PATH);
  const tickers = collectSnapshotTickers(snapshot);
  const existingReport = readJson(REPORT_PATH);
  if (canReuseReport(existingReport, tickers)) {
    process.exitCode = 0;
    return;
  }
  let childInfo = null;
  try {
    if (options.baseUrl === DEFAULT_BASE_URL) {
      const reuseDefaultServer = await canUseExistingServer(options.baseUrl);
      if (!reuseDefaultServer) {
        const openPort = await findOpenPort(options.port);
        options.port = openPort;
        options.baseUrl = `http://127.0.0.1:${openPort}`;
        childInfo = spawnLocalServer(openPort);
        await waitForServer(options.baseUrl, childInfo);
      }
    }

    const rows = await mapLimit(tickers, VALIDATION_CONCURRENCY, (ticker) => validateTicker(options.baseUrl, ticker));

    const payload = {
      schema: 'rv_frontpage_signal_link_validation_v1',
      generated_at: new Date().toISOString(),
      base_url: options.baseUrl,
      summary: {
        total: rows.length,
        ok: rows.filter((row) => row.ok).length,
        failed: rows.filter((row) => !row.ok).length,
      },
      rows,
    };
    writeJson(REPORT_PATH, payload);
    if (payload.summary.failed > 0) process.exitCode = 1;
  } finally {
    if (childInfo?.child && !options.keepServer) {
      await stopLocalServer(childInfo);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
