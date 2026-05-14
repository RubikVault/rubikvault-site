#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const REQUIRED_BUCKETS = ['SCANNED', 'SETUP', 'ARMED', 'TRIGGERED', 'CONFIRMED', 'FAILED'];

function cliValue(name, fallback = null) {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const BASE = String(cliValue('base-url') || process.env.RV_BREAKOUT_MAIN_PROOF_BASE_URL || 'https://rubikvault-site.pages.dev').replace(/\/+$/, '');
const TARGET_DATE = String(cliValue('target-date') || process.env.RV_TARGET_MARKET_DATE || '').slice(0, 10);
const SAMPLE_PER_BUCKET = Number(cliValue('sample-per-bucket') || process.env.RV_BREAKOUT_MAIN_PROOF_PER_BUCKET || 20);
const OUTPUT = path.resolve(ROOT, cliValue('output') || process.env.RV_BREAKOUT_MAIN_PROOF_OUTPUT || 'public/data/reports/breakout-main-ui-proof-latest.json');
const ANALYZER_CONCURRENCY = Math.max(1, Math.min(6, Number(cliValue('concurrency') || process.env.RV_BREAKOUT_MAIN_PROOF_CONCURRENCY || 3)));

function normalizeState(item) {
  const raw = String(item?.legacy_state || item?.ui?.legacy_state || item?.state || item?.breakout_status || item?.status || '').toUpperCase();
  if (!raw || ['NO_DATA', 'NONE', 'NO_SETUP', 'DATA_INSUFFICIENT', 'UNELIGIBLE'].includes(raw)) return 'SCANNED';
  if (raw.includes('CONFIRMED')) return 'CONFIRMED';
  if (raw.includes('FAILED') || raw.includes('INVALIDATED')) return 'FAILED';
  if (raw.includes('TRIGGERED')) return 'TRIGGERED';
  if (raw.includes('ARMED') || raw.includes('READY')) return 'ARMED';
  if (raw.includes('SETUP') || raw.includes('BASE') || raw.includes('ACCUMULATION')) return 'SETUP';
  return 'SCANNED';
}

function routeTicker(item) {
  const display = String(item?.display_ticker || '').trim().toUpperCase();
  if (display) return display.includes('.') ? display.split('.')[0] : display;
  const assetId = String(item?.asset_id || item?.canonical_id || '').trim().toUpperCase();
  if (assetId.includes(':')) return assetId;
  return String(item?.symbol || item?.ticker || assetId).trim().toUpperCase();
}

function analyzeTicker(item) {
  const display = String(item?.display_ticker || '').trim().toUpperCase();
  if (display) return display;
  const assetId = String(item?.asset_id || item?.canonical_id || '').trim().toUpperCase();
  if (assetId.includes(':')) {
    const [exchange, symbol] = assetId.split(':');
    return exchange === 'US' ? symbol : `${symbol}.${exchange}`;
  }
  return String(item?.symbol || item?.ticker || assetId).trim().toUpperCase();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`FETCH_FAILED:${url}:${response.status}`);
  return response.json();
}

async function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function pushFailure(failures, id, details = {}) {
  failures.push({ id, ...details });
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      out[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

async function collectArtifacts(failures) {
  const manifest = await fetchJson(`${BASE}/data/breakout/manifests/latest.json`);
  if (TARGET_DATE && manifest.as_of !== TARGET_DATE) {
    pushFailure(failures, 'manifest_as_of_mismatch', { expected: TARGET_DATE, actual: manifest.as_of || null });
  }
  if (manifest?.validation?.publishable !== true) pushFailure(failures, 'manifest_not_publishable');
  if (!manifest?.files?.all_scored) pushFailure(failures, 'manifest_all_scored_missing');
  if (!manifest?.files?.state_summary) pushFailure(failures, 'manifest_state_summary_missing');
  if (!manifest?.files?.state_samples) pushFailure(failures, 'manifest_state_samples_missing');

  const [summary, allScored, samples, publicStatus] = await Promise.all([
    fetchJson(`${BASE}/data/breakout/${manifest.files.state_summary}`),
    fetchJson(`${BASE}/data/breakout/${manifest.files.all_scored}`),
    fetchJson(`${BASE}/data/breakout/${manifest.files.state_samples}`),
    fetchJson(`${BASE}/data/public-status.json`),
  ]);

  if (summary.contract_mode !== 'full_state_distribution') pushFailure(failures, 'state_summary_not_full_state', { contract_mode: summary.contract_mode || null });
  if (summary.full_state_distribution_available !== true) pushFailure(failures, 'state_summary_full_state_false');
  if (summary.candidate_rank_only === true) pushFailure(failures, 'state_summary_candidate_rank_only');
  if (publicStatus.breakout_ready !== true) pushFailure(failures, 'public_status_breakout_not_ready', { breakout_ready: publicStatus.breakout_ready ?? null });
  if (!Array.isArray(allScored.items) || allScored.items.length <= 0) pushFailure(failures, 'all_scored_empty');
  if (Number(summary?.counts?.ALL || 0) !== allScored.items.length) {
    pushFailure(failures, 'summary_all_count_mismatch', { summary_all: summary?.counts?.ALL ?? null, all_scored: allScored.items.length });
  }

  const byAsset = new Map(allScored.items.map((item) => [String(item.asset_id || '').toUpperCase(), item]));
  const selected = [];
  for (const bucket of REQUIRED_BUCKETS) {
    const rows = Array.isArray(samples?.buckets?.[bucket]) ? samples.buckets[bucket] : [];
    if (rows.length !== SAMPLE_PER_BUCKET) {
      pushFailure(failures, 'bucket_sample_count_mismatch', { bucket, expected: SAMPLE_PER_BUCKET, actual: rows.length });
    }
    for (const row of rows.slice(0, SAMPLE_PER_BUCKET)) {
      const assetId = String(row.asset_id || '').toUpperCase();
      const source = byAsset.get(assetId);
      const sourceState = normalizeState(source);
      if (!source) pushFailure(failures, 'sample_missing_from_all_scored', { bucket, asset_id: assetId });
      if (source && sourceState !== bucket) pushFailure(failures, 'sample_state_mismatch_all_scored', { bucket, asset_id: assetId, source_state: sourceState });
      selected.push({ bucket, item: source || row });
    }
  }

  return { manifest, summary, allScored, samples, publicStatus, selected };
}

async function verifyApiParity(selected, failures) {
  await mapLimit(selected, 12, async ({ bucket, item }) => {
    const assetId = String(item.asset_id || '').toUpperCase();
    const route = routeTicker(item);
    const url = `${BASE}/api/v2/page/${encodeURIComponent(route).replace(/%3A/gi, ':')}?asset_id=${encodeURIComponent(assetId)}`;
    const payload = await fetchJson(url);
    if (payload?.ok !== true) {
      pushFailure(failures, 'page_api_not_ok', { bucket, asset_id: assetId, route, code: payload?.error?.code || null, status: payload?.meta?.status || null });
      return;
    }
    const summary = payload?.data?.breakout_summary;
    const apiState = normalizeState(summary);
    if (!summary) pushFailure(failures, 'page_api_breakout_summary_missing', { bucket, asset_id: assetId });
    if (apiState !== bucket) pushFailure(failures, 'page_api_state_mismatch', { bucket, asset_id: assetId, api_state: apiState });
  });
}

async function verifyBrowser(selected, failures) {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await desktop.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await desktop.waitForTimeout(1500);
    const audit = await desktop.evaluate(() => window.__rvUiAudit?.breakout || null).catch(() => null);
    const frontText = await desktop.locator('body').innerText({ timeout: 15000 });
    if (!audit) pushFailure(failures, 'frontpage_breakout_audit_missing');
    if (audit?.candidate_rank_only === true) pushFailure(failures, 'frontpage_candidate_rank_only_true');
    if (audit?.full_state_distribution_available !== true) pushFailure(failures, 'frontpage_full_state_unavailable');
    for (const label of ['SCANNED', 'IN SETUP', 'ARMED', 'TRIGGERED', 'CONFIRMED', 'FAILED']) {
      if (!frontText.toUpperCase().includes(label)) pushFailure(failures, 'frontpage_bucket_label_missing', { label });
    }
    if (/500 ranked candidates/i.test(frontText)) pushFailure(failures, 'frontpage_candidate_rank_warning_visible');
    await desktop.screenshot({ path: path.join(path.dirname(OUTPUT), 'breakout-main-frontpage-desktop.png'), fullPage: true });
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await mobile.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await mobile.waitForTimeout(1500);
    const mobileText = await mobile.locator('body').innerText({ timeout: 15000 });
    if (!mobileText.toUpperCase().includes('BREAKOUT STATE')) pushFailure(failures, 'frontpage_mobile_breakout_missing');
    await mobile.screenshot({ path: path.join(path.dirname(OUTPUT), 'breakout-main-frontpage-mobile.png'), fullPage: true });
    await mobile.close();

    const breakoutAll = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await breakoutAll.goto(`${BASE}/breakout-all`, { waitUntil: 'networkidle', timeout: 45000 });
    await breakoutAll.waitForTimeout(1800);
    const allText = await breakoutAll.locator('body').innerText({ timeout: 15000 });
    if (!/Current full-state contract/i.test(allText)) pushFailure(failures, 'breakout_all_full_state_status_missing');
    if (/Stale legacy fallback/i.test(allText)) pushFailure(failures, 'breakout_all_stale_fallback_visible');
    for (const id of ['card-total', 'card-setup', 'card-armed', 'card-triggered', 'card-confirmed', 'card-failed']) {
      if (await breakoutAll.locator(`#${id}`).count() !== 1) pushFailure(failures, 'breakout_all_card_missing', { id });
    }
    await breakoutAll.screenshot({ path: path.join(path.dirname(OUTPUT), 'breakout-main-breakout-all-desktop.png'), fullPage: true });
    await breakoutAll.close();

    await mapLimit(selected, ANALYZER_CONCURRENCY, async ({ bucket, item }) => {
      const assetId = String(item.asset_id || '').toUpperCase();
      const ticker = analyzeTicker(item);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      try {
        await page.goto(`${BASE}/analyze/${encodeURIComponent(ticker)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2200);
        const text = await page.locator('body').innerText({ timeout: 15000 });
        const upper = text.toUpperCase();
        if (!upper.includes('BREAKOUT')) pushFailure(failures, 'analyzer_breakout_panel_missing', { bucket, asset_id: assetId, ticker });
        if (!upper.includes(bucket === 'SCANNED' ? 'NO ACTIVE SETUP' : bucket)) {
          pushFailure(failures, 'analyzer_state_text_mismatch', { bucket, asset_id: assetId, ticker });
        }
        if (/INPUT DATA INTEGRITY ISSUE|UNAVAILABLE - DATA ISSUE/i.test(text)) {
          pushFailure(failures, 'analyzer_data_issue_visible', { bucket, asset_id: assetId, ticker });
        }
      } finally {
        await page.close();
      }
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const failures = [];
  const artifacts = await collectArtifacts(failures);
  await verifyApiParity(artifacts.selected, failures);
  await verifyBrowser(artifacts.selected, failures);
  const report = {
    schema: 'rv.breakout_main_ui_proof.v1',
    generated_at: new Date().toISOString(),
    base_url: BASE,
    target_date: TARGET_DATE || null,
    manifest_as_of: artifacts.manifest?.as_of || null,
    all_scored_count: artifacts.allScored?.items?.length || 0,
    sample_per_bucket: SAMPLE_PER_BUCKET,
    sample_total: artifacts.selected.length,
    status: failures.length ? 'FAIL' : 'PASS',
    failures,
  };
  await writeJsonAtomic(OUTPUT, report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(1);
}

main().catch(async (error) => {
  const report = {
    schema: 'rv.breakout_main_ui_proof.v1',
    generated_at: new Date().toISOString(),
    base_url: BASE,
    target_date: TARGET_DATE || null,
    status: 'ERROR',
    failures: [{ id: 'proof_exception', message: error?.message || String(error) }],
  };
  await writeJsonAtomic(OUTPUT, report).catch(() => {});
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
