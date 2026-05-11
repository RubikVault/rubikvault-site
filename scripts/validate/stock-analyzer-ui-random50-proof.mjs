#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  pageCoreClaimsOperational,
  pageCoreStrictOperationalReasons,
} from '../../functions/api/_shared/page-core-reader.js';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/stock-analyzer-ui-random50-proof-latest.json');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const CANONICAL_IDS_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const PAGE_CORE_LATEST_PATH = path.join(ROOT, 'public/data/page-core/latest.json');
const REQUIRED = Object.freeze({ INDEX: 5, ETF: 25, STOCK: 20 });

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

function normalizeDate(value) {
  const out = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
}

function normalizeAssetClass(row) {
  const raw = String(row?.type_norm || row?.asset_class || row?.assetClass || '').trim().toUpperCase();
  if (raw === 'INDEX' || raw === 'ETF' || raw === 'STOCK') return raw;
  const id = String(row?.canonical_id || '').toUpperCase();
  if (id.includes('.INDX') || id.endsWith(':INDX')) return 'INDEX';
  return raw || 'UNKNOWN';
}

function readCanonicalIds() {
  const doc = readJson(CANONICAL_IDS_PATH);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : (Array.isArray(doc?.ids) ? doc.ids : []);
  return new Set(ids.map((id) => String(id || '').toUpperCase()).filter(Boolean));
}

function readRegistryMeta() {
  const meta = new Map();
  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const canonicalId = String(row?.canonical_id || '').toUpperCase();
    if (!canonicalId) continue;
    meta.set(canonicalId, {
      canonical_id: canonicalId,
      symbol: row.symbol || canonicalId.split(':').pop(),
      name: row.name || row.company_name || null,
      country: row.country || null,
      exchange: row.exchange || canonicalId.split(':')[0],
      asset_class: normalizeAssetClass(row),
    });
  }
  return meta;
}

function readPageCoreIds(latest) {
  const snapshotPath = String(latest?.snapshot_path || '').replace(/^\/data\/page-core\//, '');
  if (!snapshotPath) return null;
  const dir = path.join(ROOT, 'public/data/page-core', snapshotPath, 'page-shards');
  if (!fs.existsSync(dir)) return null;
  const ids = new Set();
  for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.json.gz')).sort()) {
    const shard = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8'));
    for (const id of Object.keys(shard || {})) ids.add(String(id || '').toUpperCase());
  }
  return ids;
}

function deterministicPick(rows, count, seed) {
  return rows
    .map((row) => ({
      row,
      rank: createHash('sha256').update(`${seed}:${row.canonical_id}`).digest('hex'),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .slice(0, count)
    .map((item) => item.row);
}

function buildSample({ seed }) {
  const canonicalIds = readCanonicalIds();
  const registryMeta = readRegistryMeta();
  const latest = readJson(PAGE_CORE_LATEST_PATH);
  const pageCoreIds = readPageCoreIds(latest);
  const rows = [...canonicalIds]
    .map((id) => registryMeta.get(id))
    .filter(Boolean)
    .filter((row) => !pageCoreIds || pageCoreIds.has(row.canonical_id));

  const selected = [];
  const availability = {};
  for (const [assetClass, count] of Object.entries(REQUIRED)) {
    const pool = rows.filter((row) => row.asset_class === assetClass);
    availability[assetClass] = pool.length;
    if (pool.length < count) throw new Error(`RANDOM50_POOL_TOO_SMALL:${assetClass}:${pool.length}:${count}`);
    selected.push(...deterministicPick(pool, count, `${seed}:${assetClass}`));
  }
  return { latest, pageCoreIds: pageCoreIds?.size || null, availability, selected };
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

async function fetchJson(url, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP_${res.status}:${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  throw lastError || new Error(`HTTP_UNKNOWN:${url}`);
}

function routePath(value) {
  return encodeURIComponent(String(value || '')).replace(/%3A/gi, ':');
}

function expectedPriceDate(data) {
  return normalizeDate(
    data?.market_stats_min?.price_date
    || data?.market_stats_min?.latest_bar_date
    || data?.latest_bar_date
    || data?.freshness?.as_of
    || null,
  );
}

function decisionAction(data) {
  return String(
    data?.decision_core_min?.decision?.primary_action
    || data?.summary_min?.decision_verdict
    || '',
  ).toUpperCase() || null;
}

async function validateAsset({ browser, baseUrl, asset, targetMarketDate, latest }) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const result = {
    canonical_id: asset.canonical_id,
    symbol: asset.symbol,
    name: asset.name,
    asset_class: asset.asset_class,
    ok: false,
    assertions: {},
    errors: [],
  };
  try {
    const routeId = asset.canonical_id;
    await page.goto(`${baseUrl}/analyze/${routePath(routeId)}?rv_dev=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () => Boolean(window._rvVisibleAction) || /EXECUTIVE DECISION|Decision-grade|System Status/i.test(document.body?.innerText || ''),
      { timeout: 25000 },
    ).catch(() => {});
    await page.waitForTimeout(600);
    const [bodyText, pageCore] = await Promise.all([
      page.locator('body').innerText({ timeout: 15000 }),
      page.evaluate(async (id) => {
        const res = await fetch(`/api/v2/page/${encodeURIComponent(id).replace(/%3A/gi, ':')}?rv_random50_proof=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return { ok: false, status: res.status };
        return await res.json();
      }, routeId),
    ]);
    const visible = await page.evaluate(() => ({
      action: String(window._rvVisibleAction || '').toUpperCase(),
      blocked: Boolean(window._rvDecisionIntegrityBlocked),
      priceText: document.getElementById('sc-price')?.textContent || '',
      asOfText: document.getElementById('rv-data-asof')?.textContent || '',
      updatedText: document.getElementById('rv-data-updated-date')?.textContent || '',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    }));
    const data = pageCore?.data || {};
    const close = Number(data?.summary_min?.last_close);
    const priceDate = expectedPriceDate(data);
    const coreAction = decisionAction(data);
    const strictReasons = pageCoreStrictOperationalReasons(data, { latest })
      .filter((reason) => reason !== 'ui_banner_not_operational');
    const visibleAction = visible.action || null;
    result.page_core_action = coreAction;
    result.visible_action = visibleAction;
    result.expected_price_date = priceDate;
    result.visible_price_asof = visible.asOfText || null;
    result.expected_close = Number.isFinite(close) ? close : null;
    result.visible_price = visible.priceText || null;
    result.strict_operational_reasons = strictReasons;
    result.console_errors = consoleErrors.slice(0, 10);
    result.assertions.api_page_core_ok = pageCore?.ok === true && data?.schema_version === 'rv.page_core.v1';
    result.assertions.canonical_id_matches = String(data?.canonical_asset_id || '').toUpperCase() === asset.canonical_id;
    result.assertions.page_core_operational = pageCoreClaimsOperational(data) && strictReasons.length === 0;
    result.assertions.target_market_date_matches = !targetMarketDate || normalizeDate(data?.target_market_date) === targetMarketDate;
    result.assertions.price_date_current = !targetMarketDate || Boolean(priceDate && priceDate >= targetMarketDate);
    result.assertions.close_numeric = Number.isFinite(close);
    result.assertions.visible_price_matches_page_core = Number.isFinite(close) && visible.priceText.includes(close.toFixed(2));
    result.assertions.visible_asof_matches_page_core = Boolean(priceDate && visible.asOfText.includes(priceDate));
    result.assertions.visible_action_exists = /\b(BUY|WAIT|AVOID|UNAVAILABLE|INCUBATING)\b/i.test(bodyText);
    result.assertions.visible_action_matches_page_core = Boolean(coreAction && visibleAction === coreAction && !visible.blocked);
    result.assertions.decision_basis_visible = /Decision Basis|Why not now|Conditional BUY|Analysis incomplete/i.test(bodyText);
    result.assertions.reliability_visible = /Reliability|Analysis reliability/i.test(bodyText);
    result.assertions.horizons_visible = /Short/i.test(bodyText) && /Mid|Medium/i.test(bodyText) && /Long/i.test(bodyText);
    result.assertions.system_status_visible = /System Status|All Systems Operational|Analysis degraded|Analysis incomplete/i.test(bodyText);
    result.assertions.key_text_not_placeholder = !/Loading|\.\.\./.test(`${visible.priceText} ${visible.asOfText} ${visible.updatedText}`);
    result.assertions.buy_guard_complete_when_buy = coreAction !== 'BUY'
      || (/Max entry/i.test(bodyText)
        && /Invalidation/i.test(bodyText)
        && /Conditional BUY|valid only below|Buy only/i.test(bodyText)
        && data?.decision_core_min?.trade_guard?.max_entry_price != null
        && data?.decision_core_min?.trade_guard?.invalidation_level != null);
    result.assertions.no_horizontal_overflow = !visible.overflow;
    result.assertions.no_german_text = !/\b(kaufen|verkaufen|warte|wartet|Öffne|Treffer|Wahrscheinlichkeit)\b/i.test(bodyText);
    result.assertions.no_console_errors = consoleErrors.length === 0;
    result.ok = Object.values(result.assertions).every(Boolean);
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    await page.close();
  }
  return result;
}

async function main() {
  const seed = cliValue('seed') || process.env.RV_RANDOM50_SEED || new Date().toISOString().slice(0, 10);
  const { latest, pageCoreIds, availability, selected } = buildSample({ seed });
  const targetMarketDate = normalizeDate(cliValue('date') || cliValue('target-market-date') || process.env.RV_TARGET_MARKET_DATE || latest?.target_market_date);
  const baseArg = cliValue('base-url') || process.env.RV_UI_PROOF_BASE_URL || '';
  let baseUrl = String(baseArg || '').replace(/\/+$/, '');
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
  const remoteLatest = await fetchJson(`${baseUrl}/data/page-core/latest.json`).catch(() => latest);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const asset of selected) {
      results.push(await validateAsset({
        browser,
        baseUrl,
        asset,
        targetMarketDate,
        latest: remoteLatest || latest,
      }));
    }
    const counts = results.reduce((acc, row) => {
      acc[row.asset_class] = (acc[row.asset_class] || 0) + 1;
      return acc;
    }, {});
    const failedResults = results.filter((row) => !row.ok);
    const report = {
      schema: 'rv.stock_analyzer_ui_random50_proof.v1',
      generated_at: new Date().toISOString(),
      status: failedResults.length === 0 ? 'OK' : 'FAILED',
      base_url: baseUrl,
      target_market_date: targetMarketDate,
      local_page_core_snapshot: latest?.snapshot_id || null,
      served_page_core_snapshot: remoteLatest?.snapshot_id || null,
      seed,
      required_counts: REQUIRED,
      sample_counts: counts,
      page_core_ids,
      pool_availability: availability,
      ok: results.filter((row) => row.ok).length,
      total: results.length,
      failed: failedResults.length,
      failed_results: failedResults,
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
    schema: 'rv.stock_analyzer_ui_random50_proof.v1',
    generated_at: new Date().toISOString(),
    status: 'FAILED',
    error: error.message,
  };
  writeJsonAtomic(REPORT_PATH, report);
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
