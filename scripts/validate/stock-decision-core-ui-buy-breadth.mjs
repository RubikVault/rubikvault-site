#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DEFAULT_INPUT_PATH = path.join(ROOT, 'public/data/reports/decision-core-buy-breadth-latest.json');
const DEFAULT_REPORT_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-buy-breadth-latest.json');

function cliValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const INPUT_PATH = path.resolve(ROOT, cliValue('input') || process.env.RV_BUY_BREADTH_REPORT || DEFAULT_INPUT_PATH);
const REPORT_PATH = path.resolve(ROOT, cliValue('output') || process.env.RV_BUY_BREADTH_UI_REPORT || DEFAULT_REPORT_PATH);

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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

async function validateBuyPage({ browser, baseUrl, asset }) {
  const symbol = asset.symbol || String(asset.asset_id || '').split(':').pop();
  const routeId = asset.asset_id || symbol;
  const routePath = encodeURIComponent(routeId).replace(/%3A/gi, ':');
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const result = { asset_id: asset.asset_id, symbol, region: asset.region, ok: false, assertions: {}, errors: [] };
  try {
    await page.goto(`${baseUrl}/analyze/${routePath}?rv_dev=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => Boolean(window._rvVisibleAction) || /SYSTEM STATUS|EXECUTIVE DECISION|Decision-grade/i.test(document.body?.innerText || ''),
      { timeout: 20000 },
    ).catch(() => {});
    await page.waitForTimeout(750);
    const bodyText = await page.locator('body').innerText({ timeout: 15000 });
    const visibleState = await page.evaluate(() => ({
      visibleAction: window._rvVisibleAction || null,
      decisionIntegrityBlocked: Boolean(window._rvDecisionIntegrityBlocked),
    })).catch(() => ({ visibleAction: null, decisionIntegrityBlocked: false }));
    const pageCoreRuntime = await page.evaluate(async (ticker) => {
      try {
        const res = await fetch(`/api/v2/page/${encodeURIComponent(ticker).replace(/%3A/gi, ':')}?rv_ui_proof=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }, routeId).catch(() => null);
    const pageCoreData = pageCoreRuntime?.data || {};
    const expectedPriceDate = String(
      pageCoreData?.market_stats_min?.price_date
      || pageCoreData?.latest_bar_date
      || pageCoreData?.freshness?.as_of
      || ''
    ).slice(0, 10);
    const expectedClose = Number(pageCoreData?.summary_min?.last_close);
    const visiblePriceState = await page.evaluate(() => ({
      asOfText: document.getElementById('rv-data-asof')?.textContent || '',
      priceText: document.getElementById('sc-price')?.textContent || '',
    })).catch(() => ({ asOfText: '', priceText: '' }));
    result.visible_action = String(visibleState.visibleAction || '').toUpperCase() || null;
    result.assertions.visible_buy = result.visible_action === 'BUY' && !visibleState.decisionIntegrityBlocked;
    result.assertions.max_entry_visible = /Max entry/i.test(bodyText);
    result.assertions.invalidation_visible = /Invalidation/i.test(bodyText);
    result.assertions.conditional_caveat_visible = /Conditional BUY|valid only below|Buy only/i.test(bodyText);
    result.assertions.reliability_tooltip_exists = /Analysis reliability|Reliability:/i.test(bodyText);
    result.assertions.no_ev_guaranteed_return = !/guaranteed return|expected user profit|profit probability/i.test(bodyText);
    result.assertions.no_sell_instruction = !/sell after|sell in|verkaufe/i.test(bodyText);
    result.assertions.no_german_user_text = !/\b(kaufen|verkaufen|warte|wartet|Öffne|Treffer|Wahrscheinlichkeit)\b/i.test(bodyText);
    result.assertions.no_horizontal_overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
    result.assertions.no_legacy_buy_narrative = !/data quality score|legacy buy|score_0_100/i.test(bodyText);
    result.assertions.trust_chips_visible = /Reliability:|Trust|Data Quality/i.test(bodyText);
    result.assertions.three_horizons_visible = /Short/i.test(bodyText) && /Mid|Medium/i.test(bodyText) && /Long/i.test(bodyText);
    result.assertions.visible_price_asof_matches_page_core = Boolean(expectedPriceDate && visiblePriceState.asOfText.includes(expectedPriceDate));
    result.assertions.visible_price_matches_page_core = Number.isFinite(expectedClose)
      && visiblePriceState.priceText.includes(expectedClose.toFixed(2));
    result.ok = Object.values(result.assertions).every(Boolean);
    result.expected_price_date = expectedPriceDate || null;
    result.visible_price_asof = visiblePriceState.asOfText || null;
    result.expected_close = Number.isFinite(expectedClose) ? expectedClose : null;
    result.visible_price = visiblePriceState.priceText || null;
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    await page.close();
  }
  return result;
}

async function main() {
  const proof = readJson(INPUT_PATH);
  if (!proof) throw new Error('BUY_BREADTH_PROOF_MISSING');
  const candidatesByRegion = {
    US: proof.us_buy_assets || [],
    EU: proof.eu_buy_assets || [],
    ASIA: proof.asia_buy_assets || [],
  };
  const requiredRegions = ['US', 'EU', 'ASIA'];
  const missingRegion = requiredRegions.find((region) => candidatesByRegion[region].length < 10);
  if (missingRegion) {
    throw new Error(`BUY_BREADTH_ASSET_COUNT_BELOW_10:${candidatesByRegion.US.length}:${candidatesByRegion.EU.length}:${candidatesByRegion.ASIA.length}`);
  }
  const port = Number(process.env.PORT || await freePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn('npm', ['run', 'dev:pages:port'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), RV_DECISION_CORE_SOURCE: 'core' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await waitFor(`${baseUrl}/analyze`);
    browser = await chromium.launch({ headless: true });
    const results = [];
    const attempts = [];
    for (const region of requiredRegions) {
      let accepted = 0;
      for (const asset of candidatesByRegion[region]) {
        const result = await validateBuyPage({ browser, baseUrl, asset });
        attempts.push(result);
        if (result.ok) {
          results.push(result);
          accepted += 1;
        }
        if (accepted >= 10) break;
      }
    }
    const report = {
      schema: 'rv.decision_core_ui_buy_breadth.v1',
      generated_at: new Date().toISOString(),
      input_report: path.relative(ROOT, INPUT_PATH),
      status: requiredRegions.every((region) => results.filter((row) => row.region === region).length >= 10) ? 'OK' : 'FAILED',
      us_assets: results.filter((row) => row.region === 'US').length,
      eu_assets: results.filter((row) => row.region === 'EU').length,
      asia_assets: results.filter((row) => row.region === 'ASIA').length,
      total: results.length,
      ok: results.filter((row) => row.ok).length,
      attempted: attempts.length,
      failed_attempts: attempts.filter((row) => !row.ok),
      results,
    };
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'OK') process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  const report = {
    schema: 'rv.decision_core_ui_buy_breadth.v1',
    status: 'FAILED',
    generated_at: new Date().toISOString(),
    input_report: path.relative(ROOT, INPUT_PATH),
    error: error.message,
  };
  writeReport(report);
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
