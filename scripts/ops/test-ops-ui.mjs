import { chromium, expect } from '@playwright/test';
import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const opsUrl = `${base}/ops/?debug=1&t=${Date.now()}`;
const latestUrl = `${base}/data/pipeline/nasdaq100.latest.json`;

async function fetchJson(url, ctx) {
  const res = await fetchWithContext(url, {}, ctx);
  return res.json();
}

function requireNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected numeric ${label}, got ${value}`);
  return n;
}

function parseFirstInt(text) {
  const match = String(text || '').match(/-?\d+/);
  return match ? Number(match[0]) : NaN;
}

async function extractBridgeInfo(page) {
  return page.evaluate(() => {
    const bridge = document.querySelector('#ops-bridge');
    return {
      bridge: {
        status: bridge?.getAttribute('data-status') || '',
        baseline: bridge?.getAttribute('data-baseline') || '',
        health: bridge?.getAttribute('data-health') || '',
        fetched: bridge?.getAttribute('data-count-fetched') || '',
        validated: bridge?.getAttribute('data-count-validated') || '',
        computed: bridge?.getAttribute('data-coverage-computed') || '',
        missing: bridge?.getAttribute('data-coverage-missing') || '',
        reason: bridge?.getAttribute('data-reason') || ''
      }
    };
  });
}

function printForensic(info) {
  console.error('Forensic dump:');
  console.error('Bridge:', info?.bridge || {});
}

let browser;
try {
  const latestDoc = await fetchJson(latestUrl, { name: 'pipeline-latest' });
  const latestCounts = latestDoc?.counts || {};
  const expectedFetched = requireNumber(latestCounts.fetched, 'latest.counts.fetched');
  const expectedValidated = requireNumber(latestCounts.validated, 'latest.counts.validated');

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(opsUrl, { waitUntil: 'domcontentloaded' });
  const bridge = page.locator('#ops-bridge');
  try {
    await expect(bridge).toHaveAttribute('data-status', /ok|degraded/, { timeout: 20000 });
    await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail/, { timeout: 20000 });
  } catch (err) {
    const info = await extractBridgeInfo(page);
    printForensic(info);
    throw new Error('Timeout waiting for ops-bridge readiness');
  }

  const info = await extractBridgeInfo(page);
  const fetchedUi = parseFirstInt(info.bridge?.fetched);
  const validatedUi = parseFirstInt(info.bridge?.validated);
  if (!Number.isFinite(fetchedUi)) {
    printForensic(info);
    throw new Error(`UI fetched count missing or invalid: "${info.bridge?.fetched}"`);
  }
  if (!Number.isFinite(validatedUi)) {
    printForensic(info);
    throw new Error(`UI validated count missing or invalid: "${info.bridge?.validated}"`);
  }

  if (fetchedUi !== expectedFetched) {
    printForensic(info);
    throw new Error(`UI fetched vs latest mismatch: got ${fetchedUi}, expected ${expectedFetched}`);
  }
  if (validatedUi !== expectedValidated) {
    printForensic(info);
    throw new Error(`UI validated vs latest mismatch: got ${validatedUi}, expected ${expectedValidated}`);
  }

  await expect(page.locator('#gate-core')).toHaveAttribute('data-status', /GREEN|YELLOW|RED/);
  await expect(page.locator('#gate-freshness')).toHaveAttribute('data-status', /GREEN|YELLOW|RED/);
  await expect(page.locator('#gate-pipeline')).toHaveAttribute('data-status', /GREEN|YELLOW|RED/);
  await expect(page.locator('#gate-observability')).toHaveAttribute('data-status', /GREEN|YELLOW|RED/);

  console.log('OK: ops UI matches pipeline latest + gate cards');
  await browser.close();
  process.exit(0);
} catch (err) {
  if (browser) await browser.close();
  console.error('FAIL:', err?.message || err);
  process.exit(1);
}
