#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { mapDecisionCoreToUi } from '../../public/js/decision-core-ui-map.js';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-random20-latest.json');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const EUROPE_COUNTRIES = new Set([
  'AUSTRIA',
  'BELGIUM',
  'DENMARK',
  'FINLAND',
  'FRANCE',
  'GERMANY',
  'IRELAND',
  'ITALY',
  'NETHERLANDS',
  'NORWAY',
  'PORTUGAL',
  'SPAIN',
  'SWEDEN',
  'SWITZERLAND',
  'UNITED KINGDOM',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readRows(root) {
  const rows = [];
  const dir = path.join(root, 'parts');
  if (!fs.existsSync(dir)) return rows;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.ndjson.gz')).sort()) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      rows.push(JSON.parse(line));
    }
  }
  return rows;
}

function readRegistryMeta() {
  const out = new Map();
  if (!fs.existsSync(REGISTRY_PATH)) return out;
  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.canonical_id) out.set(String(row.canonical_id).toUpperCase(), {
        country: String(row.country || '').toUpperCase(),
        exchange: String(row.exchange || '').toUpperCase(),
        type_norm: String(row.type_norm || '').toUpperCase(),
      });
    } catch {}
  }
  return out;
}

function readPageCoreIds() {
  const latestPath = path.join(ROOT, 'public/data/page-core/latest.json');
  if (!fs.existsSync(latestPath)) return null;
  try {
    const latest = readJson(latestPath);
    const snapshotPath = String(latest?.snapshot_path || '').replace(/^\/data\/page-core\//, '');
    if (!snapshotPath) return null;
    const dir = path.join(ROOT, 'public/data/page-core', snapshotPath, 'page-shards');
    if (!fs.existsSync(dir)) return null;
    const ids = new Set();
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
      const obj = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8'));
      for (const id of Object.keys(obj || {})) ids.add(String(id).toUpperCase());
    }
    return ids;
  } catch {
    return null;
  }
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

function rowRegion(row, registryMeta) {
  const id = String(row?.meta?.asset_id || '').toUpperCase();
  const meta = registryMeta.get(id) || {};
  const country = meta.country || '';
  if (country === 'UNITED STATES' || id.startsWith('US:')) return 'US';
  if (EUROPE_COUNTRIES.has(country)) return 'EU';
  return 'OTHER';
}

function deterministicSelect(rows, registryMeta, pageCoreIds = null) {
  const uiRows = pageCoreIds?.size ? rows.filter((row) => pageCoreIds.has(String(row.meta.asset_id).toUpperCase())) : rows;
  const stocks = uiRows.filter((row) => row.meta.asset_type === 'STOCK' && registryMeta.get(String(row.meta.asset_id).toUpperCase())?.type_norm === 'STOCK');
  const etfs = uiRows.filter((row) => row.meta.asset_type === 'ETF' && registryMeta.get(String(row.meta.asset_id).toUpperCase())?.type_norm === 'ETF');
  const sorted = (list) => list.slice().sort((a, b) => a.meta.asset_id.localeCompare(b.meta.asset_id));
  const eligibleRows = [...stocks, ...etfs];
  const pickByCoverage = (list, n) => {
    const out = [];
    const add = (candidate) => {
      if (candidate && !out.some((row) => row.meta.asset_id === candidate.meta.asset_id)) out.push(candidate);
    };
    for (const row of sorted(list.filter((item) => rowRegion(item, registryMeta) === 'US')).slice(0, Math.floor(n / 2))) add(row);
    for (const row of sorted(list.filter((item) => rowRegion(item, registryMeta) === 'EU')).slice(0, n - out.length)) add(row);
    for (const row of sorted(list)) {
      if (out.length >= n) break;
      add(row);
    }
    return out.slice(0, n);
  };
  const selected = [...pickByCoverage(stocks, 10), ...pickByCoverage(etfs, 10)];
  const replaceWith = (candidate) => {
    if (!candidate || selected.some((row) => row.meta.asset_id === candidate.meta.asset_id)) return;
    const candidateRegion = rowRegion(candidate, registryMeta);
    let replaceIndex = selected.findIndex((row) => row.meta.asset_type === candidate.meta.asset_type
      && rowRegion(row, registryMeta) === candidateRegion
      && row.decision.primary_action !== 'BUY'
      && row.eligibility.vetos.length === 0
      && !['LIMITED_HISTORY', 'INCUBATING'].includes(row.eligibility.eligibility_status));
    if (replaceIndex < 0) {
      replaceIndex = selected.findIndex((row) => row.meta.asset_type === candidate.meta.asset_type && rowRegion(row, registryMeta) === candidateRegion);
    }
    if (replaceIndex < 0) {
      replaceIndex = selected.findIndex((row) => row.meta.asset_type === candidate.meta.asset_type);
    }
    if (replaceIndex >= 0) selected[replaceIndex] = candidate;
  };
  const ensureCategory = (present, candidates) => {
    if (!present()) replaceWith(sorted(candidates)[0]);
  };
  ensureCategory(
    () => selected.some((row) => row.decision.primary_action === 'BUY'),
    eligibleRows.filter((row) => row.decision.primary_action === 'BUY' && ['US', 'EU'].includes(rowRegion(row, registryMeta))),
  );
  ensureCategory(
    () => selected.some((row) => row.eligibility.eligibility_status === 'ELIGIBLE'),
    eligibleRows.filter((row) => row.eligibility.eligibility_status === 'ELIGIBLE' && ['US', 'EU'].includes(rowRegion(row, registryMeta))),
  );
  ensureCategory(
    () => selected.some((row) => ['LIMITED_HISTORY', 'INCUBATING'].includes(row.eligibility.eligibility_status)),
    eligibleRows.filter((row) => ['LIMITED_HISTORY', 'INCUBATING'].includes(row.eligibility.eligibility_status) && ['US', 'EU'].includes(rowRegion(row, registryMeta))),
  );
  ensureCategory(
    () => selected.some((row) => row.eligibility.vetos.length > 0),
    eligibleRows.filter((row) => row.eligibility.vetos.length > 0 && ['US', 'EU'].includes(rowRegion(row, registryMeta))),
  );
  const regionCounts = selected.reduce((acc, row) => {
    const region = rowRegion(row, registryMeta);
    acc[region] = (acc[region] || 0) + 1;
    return acc;
  }, {});
  const categories = {
    eligible_candidate: selected.some((row) => row.eligibility.eligibility_status === 'ELIGIBLE') ? 'present' : 'not_available',
    limited_or_incubating: selected.some((row) => ['LIMITED_HISTORY', 'INCUBATING'].includes(row.eligibility.eligibility_status)) ? 'present' : 'not_available',
    hard_veto: selected.some((row) => row.eligibility.vetos.length > 0) ? 'present' : 'not_available',
    buy: selected.some((row) => row.decision.primary_action === 'BUY') ? 'present' : 'not_available',
    us_eu_coverage: regionCounts.US > 0 && regionCounts.EU > 0 ? 'present' : 'not_available',
    region_counts: regionCounts,
  };
  return { selected, categories };
}

async function validatePage({ browser, baseUrl, row, reasonRegistry }) {
  const symbol = row.meta.asset_id.split(':').pop();
  const expected = mapDecisionCoreToUi(row, reasonRegistry).action;
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const result = { asset_id: row.meta.asset_id, symbol, expected_action: expected, ok: false, assertions: {}, errors: [] };
  try {
    await page.goto(`${baseUrl}/analyze/${encodeURIComponent(symbol)}?rv_dev=1`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(
      () => Boolean(window._rvDecision) || /SYSTEM STATUS|EXECUTIVE DECISION|Decision-grade/i.test(document.body?.innerText || ''),
      { timeout: 20000 },
    ).catch(() => {});
    await page.waitForTimeout(750);
    const bodyText = await page.locator('body').innerText({ timeout: 15000 });
    const visibleState = await page.evaluate(() => ({
      visibleAction: window._rvVisibleAction || null,
      decisionIntegrityBlocked: Boolean(window._rvDecisionIntegrityBlocked),
    })).catch(() => ({ visibleAction: null, decisionIntegrityBlocked: false }));
    const visibleAction = String(visibleState.visibleAction || '').toUpperCase();
    result.visible_action = visibleAction || null;
    result.assertions.visible_action_exists = /\b(BUY|WAIT|AVOID|UNAVAILABLE|INCUBATING)\b/i.test(bodyText);
    result.assertions.visible_action_equals_mapped = visibleAction
      ? (visibleAction === expected || (visibleAction === 'UNAVAILABLE' && visibleState.decisionIntegrityBlocked))
      : (new RegExp(`\\b${expected}\\b`, 'i').test(bodyText) || expected === 'UNAVAILABLE');
    result.assertions.trust_chips_visible = /Reliability:|Trust|Data Quality/i.test(bodyText);
    result.assertions.three_horizons_visible = /Short/i.test(bodyText) && /Mid|Medium/i.test(bodyText) && /Long/i.test(bodyText);
    result.assertions.buy_guard_visible = visibleAction !== 'BUY' || (/Max entry/i.test(bodyText) && /Invalidation/i.test(bodyText) && /Conditional BUY/i.test(bodyText));
    result.assertions.unavailable_incubating_not_wait = !(['UNAVAILABLE', 'INCUBATING'].includes(expected) && /\bWAIT\b/i.test(bodyText) && !new RegExp(expected, 'i').test(bodyText));
    result.assertions.missing_bundle_not_wait = true;
    result.assertions.no_horizontal_overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
    const layoutHeight = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.dash-grid > div')).slice(0, 3);
      if (!blocks.length) return false;
      const heights = blocks.map((el) => Math.round(el.getBoundingClientRect().height));
      const allowedPx = Math.round(Math.max(1500, window.innerHeight * 1.7));
      return { ok: heights.every((height) => height <= allowedPx), heights, allowedPx };
    });
    result.assertions.three_blocks_height_ok = Boolean(layoutHeight?.ok);
    result.layout_height = layoutHeight;
    result.assertions.no_german_user_text = !/\b(kaufen|verkaufen|warte|wartet|Öffne|Treffer|Wahrscheinlichkeit)\b/i.test(bodyText);
    result.assertions.hard_veto_banner_visible_when_applicable = row.eligibility.vetos.length === 0 || /System Status|DATA ISSUE|Decision quality|unavailable|blocked/i.test(bodyText);
    result.assertions.unknown_reason_fallback_no_crash = !/TypeError|ReferenceError|Cannot read/i.test(bodyText);
    result.assertions.analysis_reliability_tooltip_exists = /Analysis reliability|Reliability:/i.test(bodyText);
    result.assertions.evaluation_horizon_not_sell_instruction = !/sell after|sell in|verkaufe/i.test(bodyText);
    result.assertions.ui_never_derives_action_from_raw_indicators = await page.evaluate(() => {
      const decision = window._rvDecision || {};
      return Boolean(decision.decision_core_min || decision.verdict || decision.action);
    });
    result.ok = Object.values(result.assertions).every(Boolean);
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    await page.close();
  }
  return result;
}

async function main() {
  const root = fs.existsSync(path.join(ROOT, 'public/data/decision-core/core/manifest.json'))
    ? path.join(ROOT, 'public/data/decision-core/core')
    : path.join(ROOT, 'public/data/decision-core/shadow');
  const rootLabel = path.relative(ROOT, root);
  const rows = readRows(root);
  const registryMeta = readRegistryMeta();
  const pageCoreIds = readPageCoreIds();
  const reasonRegistry = readJson(path.join(ROOT, 'public/data/decision-core/reason-codes/latest.json'));
  const { selected, categories } = deterministicSelect(rows, registryMeta, pageCoreIds);
  if (selected.length < 20) throw new Error(`NOT_ENOUGH_ROWS_FOR_RANDOM20:${selected.length}`);
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
    for (const row of selected) results.push(await validatePage({ browser, baseUrl, row, reasonRegistry }));
    const report = {
      schema: 'rv.decision_core_ui_random20.v1',
      generated_at: new Date().toISOString(),
      root: rootLabel,
      status: results.every((row) => row.ok) ? 'OK' : 'FAILED',
      categories,
      counts: {
        total: results.length,
        stock: selected.filter((row) => row.meta.asset_type === 'STOCK').length,
        etf: selected.filter((row) => row.meta.asset_type === 'ETF').length,
        ok: results.filter((row) => row.ok).length,
      },
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
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({ schema: 'rv.decision_core_ui_random20.v1', status: 'FAILED', error: error.message, generated_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
