import { chromium, expect } from '@playwright/test';
import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const opsUrl = `${base}/ops/?debug=1&t=${Date.now()}`;
const summaryUrl = `${base}/api/mission-control/summary`;

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
  const summaryDoc = await fetchJson(summaryUrl, { name: 'mission-control-summary' });
  const ssot = summaryDoc?.data?.ssot || {};
  const apiChecks = Array.isArray(ssot?.core?.api?.checks)
    ? ssot.core.api.checks
    : (Array.isArray(ssot?.api?.checks) ? ssot.api.checks : []);
  const assetChecks = Array.isArray(ssot?.core?.assets?.checks)
    ? ssot.core.assets.checks
    : (Array.isArray(ssot?.assets?.checks) ? ssot.assets.checks : []);
  const apiRequired = apiChecks.filter((c) => c?.required);
  const assetRequired = assetChecks.filter((c) => c?.required);
  const expectedFetched = apiRequired.filter((c) => c?.status === 'OK').length;
  const expectedValidated = assetRequired.filter((c) => c?.status === 'OK').length;

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(opsUrl, { waitUntil: 'domcontentloaded' });
  const bridge = page.locator('#ops-bridge');
  try {
    await expect(bridge).toHaveAttribute('data-status', /ok|degraded/, { timeout: 20000 });
    await expect(bridge).toHaveAttribute('data-baseline', /ok/, { timeout: 20000 });
  } catch (err) {
    const info = await extractBridgeInfo(page);
    printForensic(info);
    throw new Error('Timeout waiting for ops-bridge readiness');
  }

  const info = await extractBridgeInfo(page);
  const enhOk = await page.evaluate(() => {
    return Boolean(document.querySelector('#enhancer-api-checks')) && Boolean(document.querySelector('#enhancer-asset-checks'));
  });
  if (!enhOk) {
    printForensic(info);
    throw new Error('Enhancer sections missing in OPS UI');
  }
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

  console.log('OK: ops UI matches SSOT check counts');
  await browser.close();
  process.exit(0);
} catch (err) {
  if (browser) await browser.close();
  console.error('FAIL:', err?.message || err);
  process.exit(1);
}
