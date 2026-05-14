#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = process.env.RV_PROOF_BASE_URL || process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://rubikvault-site.pages.dev';
const BREAKOUT_SAMPLE = Number(process.env.RV_PROOF_BREAKOUT_SAMPLE || 40);
const HIST_SAMPLE = Number(process.env.RV_PROOF_HIST_SAMPLE || 50);
const CHART_SAMPLE = Number(process.env.RV_PROOF_CHART_SAMPLE || 50);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FETCH_FAILED:${url}:${res.status}`);
  return res.json();
}

function enc(id) {
  return encodeURIComponent(String(id || ''));
}

async function main() {
  const failures = [];
  const manifest = await fetchJson(`${BASE}/data/breakout/manifests/latest.json`);
  const top500 = await fetchJson(`${BASE}/data/breakout/${manifest.files.top500}`);
  const breakoutAssets = (top500.items || []).map(row => row.asset_id || row.canonical_id).filter(Boolean).slice(0, BREAKOUT_SAMPLE);
  const universe = await fetchJson(`${BASE}/data/universe/v7/ssot/assets.global.canonical.ids.json`);
  const universeIds = new Set(Array.isArray(universe.canonical_ids) ? universe.canonical_ids : []);
  const histManifest = await fetchJson(`${BASE}/data/historical-insights/latest.json`);
  const histShardKeys = Object.keys(histManifest.shards || {});
  const histAssets = [];
  for (const key of histShardKeys) {
    if (histAssets.length >= Math.max(HIST_SAMPLE, CHART_SAMPLE)) break;
    const shard = await fetchJson(`${BASE}/data/historical-insights/${histManifest.shards[key]}`);
    histAssets.push(...Object.keys(shard.by_asset || {}).filter(id => universeIds.size === 0 || universeIds.has(id)));
  }
  const sampleForHist = histAssets.slice(0, HIST_SAMPLE);
  const sampleForChart = [...new Set([...breakoutAssets, ...histAssets])].slice(0, CHART_SAMPLE);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);
    const audit = await page.evaluate(() => window.__rvUiAudit?.breakout || null);
    const body = await page.locator('body').innerText();
    if (!audit) failures.push('frontpage_breakout_audit_missing');
    if (audit?.candidate_rank_only !== true) failures.push(`frontpage_candidate_rank_only_expected:true got:${audit?.candidate_rank_only}`);
    if (!/Top Breakout Candidates/i.test(body)) failures.push('frontpage_candidate_title_missing');
    if (/Stocks Breakouts Tracker \(V2\.0\)/i.test(body)) failures.push('frontpage_legacy_breakout_title_still_visible');
    if (/\n0\nSETUP\n0\nARMED\n0\nTRIGGERED\n0\nCONFIRMED\n0\nFAILED/i.test(body)) failures.push('frontpage_fake_zero_state_tiles_visible');

    for (const assetId of breakoutAssets) {
      const detail = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await detail.goto(`${BASE}/analyze/${enc(assetId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await detail.waitForTimeout(1800);
      const text = await detail.locator('body').innerText({ timeout: 10000 });
      await detail.close();
      if (!/BREAKOUT_CANDIDATE|SETUP|ARMED|TRIGGERED|CONFIRMED|FAILED/i.test(text)) failures.push(`breakout_missing:${assetId}`);
      if (/Not in current V12 signal set/i.test(text)) failures.push(`breakout_false_not_in_set:${assetId}`);
    }

    for (const assetId of sampleForHist) {
      const detail = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await detail.goto(`${BASE}/analyze/${enc(assetId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await detail.waitForTimeout(2600);
      const text = await detail.locator('body').innerText({ timeout: 10000 });
      await detail.close();
      if (!/Historical research insights/i.test(text)) failures.push(`historical_insights_missing:${assetId}`);
      if (!/Win rate:/i.test(text)) failures.push(`historical_insights_rules_missing:${assetId}`);
    }

    for (const assetId of sampleForChart) {
      const detail = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await detail.goto(`${BASE}/analyze/${enc(assetId)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await detail.waitForTimeout(2600);
      for (const label of ['3D', '10Y', 'ALL']) {
        const button = detail.locator(`#tf-btns .tf-btn[data-tf="${label}"]`);
        if (await button.count() === 0) {
          failures.push(`chart_button_missing:${assetId}:${label}`);
          continue;
        }
        await button.first().click();
        await detail.waitForTimeout(250);
      }
      await detail.waitForFunction(() => {
        const chart = document.querySelector('#tf-chart [id^="chart-"]');
        return !!chart?._chartData?.source_bar_count;
      }, null, { timeout: 5000 }).catch(() => {});
      const chartData = await detail.evaluate(() => {
        const chart = document.querySelector('#tf-chart [id^="chart-"]');
        return chart?._chartData || null;
      });
      await detail.close();
      if (!chartData) failures.push(`chart_metadata_missing:${assetId}`);
      else {
        if (!(chartData.source_bar_count >= chartData.rendered_point_count)) failures.push(`chart_counts_invalid:${assetId}`);
        if (!chartData.history_start_date || !chartData.history_end_date) failures.push(`chart_dates_missing:${assetId}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    base: BASE,
    breakout_sample: breakoutAssets.length,
    historical_sample: sampleForHist.length,
    chart_sample: sampleForChart.length,
    status: failures.length ? 'FAIL' : 'PASS',
    failures,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
