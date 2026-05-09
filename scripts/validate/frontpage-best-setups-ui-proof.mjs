#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const SNAPSHOT_PATH = path.join(ROOT, 'public/data/snapshots/best-setups-v4.json');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/frontpage-best-setups-ui-proof-latest.json');
const REQUIRED_REGIONS = ['US', 'EU', 'ASIA'];
const REQUIRED_CLASSES = ['stock', 'etf'];

function cliValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return res.json();
      lastError = new Error(`HTTP_${res.status}:${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(500 * attempt);
  }
  throw lastError || new Error(`HTTP_UNKNOWN:${url}`);
}

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

async function waitFor(baseUrl, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/stock`, { cache: 'no-store' });
      if (res.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`SERVER_NOT_READY:${baseUrl}`);
}

function flattenBestSetups(snapshot) {
  const rows = [];
  for (const [bucket, byHorizon] of Object.entries(snapshot?.data || {})) {
    const assetClass = bucket === 'etfs' ? 'etf' : 'stock';
    for (const [horizon, entries] of Object.entries(byHorizon || {})) {
      for (const row of entries || []) {
        rows.push({ ...row, asset_class: row.asset_class || assetClass, horizon });
      }
    }
  }
  return rows;
}

function regionClassCoverage(rows) {
  const out = {};
  for (const region of REQUIRED_REGIONS) {
    out[region] = {};
    for (const assetClass of REQUIRED_CLASSES) {
      out[region][assetClass] = rows.filter((row) => row.region === region && row.asset_class === assetClass).length;
    }
  }
  return out;
}

function uniqueRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = row.canonical_id || row.canonical_asset_id || `${row.region}:${row.ticker}`;
    if (!map.has(id)) map.set(id, row);
  }
  return [...map.values()];
}

async function validateAnalyzerPage(browser, baseUrl, row) {
  const ticker = String(row.ticker || row.canonical_id?.split(':').pop() || '').trim();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const result = {
    ticker,
    canonical_id: row.canonical_id || row.canonical_asset_id || null,
    region: row.region || null,
    asset_class: row.asset_class || null,
    horizons: [row.horizon].filter(Boolean),
    ok: false,
    assertions: {},
    errors: [],
  };
  try {
    const routeId = row.canonical_id || row.canonical_asset_id || ticker;
    const routePath = encodeURIComponent(routeId).replace(/%3A/gi, ':');
    await page.goto(`${baseUrl}/analyze/${routePath}?rv_dev=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => Boolean(window._rvVisibleAction) || /EXECUTIVE DECISION|Decision-grade|System Status/i.test(document.body?.innerText || ''),
      { timeout: 20000 },
    ).catch(() => {});
    await page.waitForTimeout(500);
    const bodyText = await page.locator('body').innerText({ timeout: 15000 });
    const visible = await page.evaluate(() => ({
      action: String(window._rvVisibleAction || '').toUpperCase(),
      blocked: Boolean(window._rvDecisionIntegrityBlocked),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      priceText: document.getElementById('sc-price')?.textContent || '',
      asOfText: document.getElementById('rv-data-asof')?.textContent || '',
    }));
    const pageCore = await page.evaluate(async (symbol) => {
      let last = { ok: false, status: 'NOT_ATTEMPTED' };
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const res = await fetch(`/api/v2/page/${encodeURIComponent(symbol).replace(/%3A/gi, ':')}?rv_best_setup_ui_proof=${Date.now()}_${attempt}`, { cache: 'no-store' });
        if (res.ok) return res.json();
        last = { ok: false, status: res.status };
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
      return last;
    }, routeId);
    const data = pageCore?.data || {};
    const coreAction = String(data?.decision_core_min?.decision?.primary_action || data?.summary_min?.decision_verdict || '').toUpperCase();
    const expectedDate = String(data?.market_stats_min?.price_date || data?.latest_bar_date || data?.freshness?.as_of || '').slice(0, 10);
    const expectedClose = Number(data?.summary_min?.last_close);
    result.visible_action = visible.action || null;
    result.page_core_action = coreAction || null;
    result.expected_price_date = expectedDate || null;
    result.visible_price_asof = visible.asOfText || null;
    result.expected_close = Number.isFinite(expectedClose) ? expectedClose : null;
    result.visible_price = visible.priceText || null;
    result.assertions.frontpage_row_is_buy = row.verdict === 'BUY' && row.price_basis === 'decision-core';
    result.assertions.visible_action_buy = visible.action === 'BUY' && !visible.blocked;
    result.assertions.page_core_buy = coreAction === 'BUY';
    result.assertions.max_entry_visible = /Max entry/i.test(bodyText);
    result.assertions.invalidation_visible = /Invalidation/i.test(bodyText);
    result.assertions.conditional_caveat_visible = /Conditional BUY|valid only below|Buy only/i.test(bodyText);
    result.assertions.reliability_visible = /Reliability/i.test(bodyText);
    result.assertions.no_german_text = !/\b(kaufen|verkaufen|warte|wartet|Öffne|Treffer|Wahrscheinlichkeit)\b/i.test(bodyText);
    result.assertions.no_horizontal_overflow = !visible.overflow;
    result.assertions.no_legacy_buy_narrative = !/data quality score|legacy buy|score_0_100/i.test(bodyText);
    result.assertions.price_asof_matches_page_core = Boolean(expectedDate && visible.asOfText.includes(expectedDate));
    result.assertions.price_matches_page_core = Number.isFinite(expectedClose) && visible.priceText.includes(expectedClose.toFixed(2));
    result.ok = Object.values(result.assertions).every(Boolean);
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    await page.close();
  }
  return result;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      out[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()));
  return out;
}

async function main() {
  const baseArg = cliValue('base-url');
  let baseUrl = baseArg ? baseArg.replace(/\/+$/, '') : null;
  let server = null;
  if (!baseUrl) {
    const port = Number(process.env.PORT || await freePort());
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn('npm', ['run', 'dev:pages:port'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), RV_DECISION_CORE_SOURCE: 'core' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitFor(baseUrl);
  }
  let browser;
  try {
    const snapshot = baseArg
      ? await fetchJson(`${baseUrl}/data/snapshots/best-setups-v4.json`)
      : readJson(SNAPSHOT_PATH);
    const rows = flattenBestSetups(snapshot);
    const coverage = regionClassCoverage(rows);
    const missingCoverage = [];
    for (const region of REQUIRED_REGIONS) {
      for (const assetClass of REQUIRED_CLASSES) {
        if (!coverage[region][assetClass]) missingCoverage.push(`${region}:${assetClass}`);
      }
    }
    browser = await chromium.launch({ headless: true });
    const proofRows = uniqueRows(rows);
    const results = await mapLimit(proofRows, 3, (row) => validateAnalyzerPage(browser, baseUrl, row));
    const report = {
      schema: 'rv.frontpage_best_setups_ui_proof.v1',
      generated_at: new Date().toISOString(),
      base_url: baseUrl,
      source: snapshot?.meta?.source || null,
      target_market_date: snapshot?.meta?.data_asof || null,
      status: missingCoverage.length === 0 && results.every((row) => row.ok) ? 'OK' : 'FAILED',
      counts: {
        frontpage_rows: rows.length,
        unique_analyzer_pages: proofRows.length,
        ok: results.filter((row) => row.ok).length,
        failed: results.filter((row) => !row.ok).length,
      },
      region_class_coverage: coverage,
      missing_region_class_coverage: missingCoverage,
      failed_results: results.filter((row) => !row.ok),
      results,
    };
    writeJsonAtomic(REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'OK') process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) server.kill('SIGTERM');
  }
}

main().catch((error) => {
  const report = {
    schema: 'rv.frontpage_best_setups_ui_proof.v1',
    generated_at: new Date().toISOString(),
    status: 'FAILED',
    error: error.message,
  };
  writeJsonAtomic(REPORT_PATH, report);
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
