#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/analyzer-detail-audit-latest.json');
const DEFAULT_PORT = Number(process.env.PORT || 8788);
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_RETRIES = 2;

const CHECKS = [
  { ticker: 'AAPL', requireStock: true, requireInsights: true, requirePage: true },
  { ticker: 'EXX', requireStock: true, requireInsights: false, requirePage: true },
  { ticker: 'VOW3.XETR', requireStock: false, requireInsights: false, requirePage: true },
  { ticker: 'SPY', requireStock: true, requireInsights: false, requirePage: false },
];

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function findRepoWrangler() {
  const wranglerBin = path.join(ROOT, 'node_modules', '.bin', 'wrangler');
  return fs.existsSync(wranglerBin) ? wranglerBin : null;
}

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    baseUrl: null,
    keepServer: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--port=')) options.port = Number(arg.split('=')[1]) || DEFAULT_PORT;
    else if (arg.startsWith('--base-url=')) options.baseUrl = String(arg.split('=')[1] || '').trim() || null;
    else if (arg === '--keep-server') options.keepServer = true;
  }
  if (!options.baseUrl) options.baseUrl = `http://127.0.0.1:${options.port}`;
  return options;
}

async function fetchWithTimeout(url, as = 'json') {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === 'text' ? await response.text() : await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('request_failed');
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`no_open_port_from_${startPort}`);
}

async function canUseExistingServer(baseUrl) {
  try {
    const payload = await fetchWithTimeout(`${baseUrl}/api/stock?ticker=AAPL`);
    return Boolean(payload?.data?.ticker);
  } catch {
    return false;
  }
}

function spawnLocalServer(port) {
  const wranglerBin = findRepoWrangler();
  if (!wranglerBin) {
    throw new Error('repo_wrangler_missing');
  }
  const child = spawn(process.execPath, [
    wranglerBin,
    'pages',
    'dev',
    'public',
    '--port',
    String(port),
    '--kv',
    'RV_KV',
    '--persist-to',
    '.wrangler/state',
    '--compatibility-date=2025-12-17',
  ], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const info = { child, logs: [], exited: false, exitCode: null };
  const capture = (stream) => {
    stream?.on('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (!text) return;
      info.logs.push(text);
      if (info.logs.length > 20) info.logs.shift();
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

async function waitForServer(baseUrl, childInfo = null, timeoutMs = 120_000) {
  const started = Date.now();
  let lastError = null;
  while ((Date.now() - started) < timeoutMs) {
    if (childInfo?.exited) {
      throw new Error(`server_process_exited:${childInfo.exitCode ?? 'unknown'}`);
    }
    try {
      if (await canUseExistingServer(baseUrl)) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`server_not_ready${lastError ? `:${lastError.message}` : ''}`);
}

async function stopLocalServer(info) {
  if (!info?.child) return;
  info.child.stdout?.destroy();
  info.child.stderr?.destroy();
  if (!info.exited) {
    info.child.kill('SIGTERM');
    const exited = await Promise.race([
      once(info.child, 'exit').catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
    ]);
    if (exited === false && !info.exited) {
      info.child.kill('SIGKILL');
      await Promise.race([
        once(info.child, 'exit').catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  }
}

function validateStockPayload(ticker, payload) {
  if (!payload || typeof payload !== 'object') return `stock_payload_missing:${ticker}`;
  if (String(payload?.data?.ticker || '').toUpperCase() !== String(ticker).toUpperCase()) {
    return `stock_payload_ticker_mismatch:${ticker}`;
  }
  if (typeof payload?.meta?.status !== 'string') return `stock_meta_status_missing:${ticker}`;
  const hasRenderableData = Boolean(
    payload?.data?.name
      || payload?.data?.market_prices?.date
      || (Array.isArray(payload?.data?.bars) && payload.data.bars.length > 0)
  );
  if (!hasRenderableData) return `stock_payload_non_renderable:${ticker}`;
  return null;
}

function validateInsightsPayload(ticker, payload) {
  if (!payload || typeof payload !== 'object') return `insights_payload_missing:${ticker}`;
  if (payload?.schema_version !== 'rv.stock-insights.v4') return `insights_schema_invalid:${ticker}`;
  const contract = payload?.v4_contract;
  if (!contract || typeof contract !== 'object') return `insights_contract_missing:${ticker}`;
  for (const key of ['scientific', 'forecast', 'elliott', 'fallback_state', 'decision_trace']) {
    if (!contract[key]) return `insights_contract_row_missing:${ticker}:${key}`;
  }
  return null;
}

function validatePageHtml(ticker, html) {
  if (typeof html !== 'string' || html.length < 1000) return `page_html_short:${ticker}`;
  if (!html.includes('/analyze/')) return `page_route_marker_missing:${ticker}`;
  if (/Internal Server Error|Application error/i.test(html)) return `page_error_marker:${ticker}`;
  return null;
}

async function validateCheck(baseUrl, check) {
  const row = {
    ticker: check.ticker,
    stock_api: { ok: null, error: null },
    insights_api: { ok: null, error: null },
    analyze_page: { ok: null, error: null },
  };

  if (check.requireStock) {
    try {
      const payload = await fetchWithTimeout(`${baseUrl}/api/stock?ticker=${encodeURIComponent(check.ticker)}`);
      const error = validateStockPayload(check.ticker, payload);
      row.stock_api = { ok: !error, error };
    } catch (error) {
      row.stock_api = { ok: false, error: String(error?.message || error) };
    }
  }

  if (check.requireInsights) {
    try {
      const payload = await fetchWithTimeout(`${baseUrl}/api/stock-insights-v4?ticker=${encodeURIComponent(check.ticker)}`);
      const error = validateInsightsPayload(check.ticker, payload);
      row.insights_api = { ok: !error, error };
    } catch (error) {
      row.insights_api = { ok: false, error: String(error?.message || error) };
    }
  }

  if (check.requirePage) {
    try {
      const html = await fetchWithTimeout(`${baseUrl}/analyze/${encodeURIComponent(check.ticker)}`, 'text');
      const error = validatePageHtml(check.ticker, html);
      row.analyze_page = { ok: !error, error };
    } catch (error) {
      row.analyze_page = { ok: false, error: String(error?.message || error) };
    }
  }

  return row;
}

async function main() {
  const options = parseArgs(process.argv);
  let baseUrl = options.baseUrl;
  let childInfo = null;
  let usingExistingServer = await canUseExistingServer(baseUrl);

  if (!usingExistingServer) {
    const port = await findOpenPort(options.port);
    baseUrl = `http://127.0.0.1:${port}`;
    childInfo = spawnLocalServer(port);
    await waitForServer(baseUrl, childInfo);
  }

  const rows = [];
  for (const check of CHECKS) {
    rows.push(await validateCheck(baseUrl, check));
  }

  const failures = rows.flatMap((row) => {
    const issues = [];
    for (const key of ['stock_api', 'insights_api', 'analyze_page']) {
      if (row[key].ok === false) issues.push({ ticker: row.ticker, area: key, error: row[key].error });
    }
    return issues;
  });

  const report = {
    schema: 'rv.analyzer_detail_audit.v1',
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    used_existing_server: usingExistingServer,
    rows,
    total_failures: failures.length,
    failures,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
  };
  writeJson(REPORT_PATH, report);

  if (childInfo && !options.keepServer) {
    await stopLocalServer(childInfo);
  }

  if (failures.length > 0) process.exit(1);
}

main().catch(async (error) => {
  writeJson(REPORT_PATH, {
    schema: 'rv.analyzer_detail_audit.v1',
    generated_at: new Date().toISOString(),
    status: 'FAIL',
    total_failures: 1,
    failures: [{ ticker: 'SYSTEM', area: 'audit', error: String(error?.message || error) }],
  });
  console.error(error);
  process.exit(1);
});
