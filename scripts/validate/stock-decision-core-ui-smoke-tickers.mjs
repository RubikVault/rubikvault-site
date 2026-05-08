#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-smoke-tickers-latest.json');
const TICKERS = ['Z', 'AAPL', 'F', 'HOOD'];
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitFor(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`SERVER_NOT_READY:${url}`);
}

async function validateTicker(browser, baseUrl, ticker, viewport) {
  const page = await browser.newPage({ viewport });
  const result = { ticker, viewport: viewport.name, ok: false, assertions: {}, errors: [] };
  try {
    await page.goto(`${baseUrl}/analyze/${encodeURIComponent(ticker)}?rv_dev=1`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(750);
    const bodyText = await page.locator('body').innerText({ timeout: 15000 });
    result.assertions.visible_action_exists = /\b(BUY|WAIT|AVOID|UNAVAILABLE|INCUBATING)\b/i.test(bodyText);
    result.assertions.trust_or_reliability_visible = /Reliability:|Analysis reliability|Trust|Data Quality/i.test(bodyText);
    result.assertions.no_horizontal_overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
    result.assertions.no_german_user_text = !/\b(kaufen|verkaufen|warte|wartet|Öffne|Treffer|Wahrscheinlichkeit)\b/i.test(bodyText);
    result.assertions.no_js_crash_text = !/TypeError|ReferenceError|Cannot read|Error 1102/i.test(bodyText);
    result.assertions.no_sell_instruction = !/sell after|sell in|verkaufe/i.test(bodyText);
    result.assertions.unavailable_not_false_wait = !(/Analysis unavailable|UNAVAILABLE/i.test(bodyText) && /\bWAIT\b/i.test(bodyText) && !/UNAVAILABLE/i.test(bodyText));
    result.ok = Object.values(result.assertions).every(Boolean);
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    await page.close();
  }
  return result;
}

async function main() {
  const port = Number(process.env.PORT || await freePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn('npm', ['run', 'dev:pages:port'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), RV_DECISION_CORE_SOURCE: 'core' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  server.stdout.on('data', (buf) => logs.push(buf.toString()));
  server.stderr.on('data', (buf) => logs.push(buf.toString()));
  let browser;
  try {
    await waitFor(`${baseUrl}/analyze`);
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const ticker of TICKERS) {
      for (const viewport of VIEWPORTS) {
        results.push(await validateTicker(browser, baseUrl, ticker, viewport));
      }
    }
    const report = {
      schema: 'rv.decision_core_ui_smoke_tickers.v1',
      generated_at: new Date().toISOString(),
      status: results.every((row) => row.ok) ? 'OK' : 'FAILED',
      tickers: TICKERS,
      viewports: VIEWPORTS.map((row) => row.name),
      counts: { total: results.length, ok: results.filter((row) => row.ok).length },
      results,
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'OK') process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({ schema: 'rv.decision_core_ui_smoke_tickers.v1', status: 'FAILED', error: error.message, generated_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
