import { chromium } from 'playwright';
import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const opsUrl = `${base}/ops/?debug=1`;
const latestUrl = `${base}/data/pipeline/nasdaq100.latest.json`;
const truthUrl = `${base}/data/pipeline/nasdaq100.pipeline-truth.json`;

async function fetchJson(url, ctx) {
  const res = await fetchWithContext(url, {}, ctx);
  return res.json();
}

function requireNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected numeric ${label}, got ${value}`);
  return n;
}

function ensureEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: got ${actual}, expected ${expected}`);
  }
}

let browser;
try {
  const [latestDoc, truthDoc] = await Promise.all([
    fetchJson(latestUrl, { name: 'pipeline-latest' }),
    fetchJson(truthUrl, { name: 'pipeline-truth' })
  ]);

  const latestCounts = latestDoc?.counts || {};
  const expectedFetched = requireNumber(latestCounts.fetched, 'latest.counts.fetched');
  const expectedValidated = requireNumber(latestCounts.validated, 'latest.counts.validated');

  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(opsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ops-render-status[data-status="ok"]', { timeout: 20000 });

  const rows = await page.$$eval('#pipeline-marketphase tr', (els) => els.map((row) => {
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim() || '');
    return { label: cells[0] || '', count: cells[1] || '' };
  }));

  const counts = Object.fromEntries(rows.map((row) => [row.label.toLowerCase(), row.count]));
  const fetchedUi = requireNumber(counts['fetched'], 'UI fetched count');
  const validatedUi = requireNumber(counts['validated'], 'UI validated count');

  ensureEqual(fetchedUi, expectedFetched, 'UI fetched vs latest');
  ensureEqual(validatedUi, expectedValidated, 'UI validated vs latest');

  const s1Status = await page.getAttribute('[data-step-id="S1"]', 'data-step-status');
  const s2Status = await page.getAttribute('[data-step-id="S2"]', 'data-step-status');
  const uiBlocker = await page.getAttribute('#truth-chain-steps', 'data-first-blocker');

  const truthSteps = Array.isArray(truthDoc?.steps) ? truthDoc.steps : [];
  const truthS1 = truthSteps.find((s) => s.id === 'S1');
  const truthS2 = truthSteps.find((s) => s.id === 'S2');
  const truthBlocker = truthDoc?.first_blocker_id || truthDoc?.first_blocker?.id || null;

  if (!truthS1 || !truthS2) {
    throw new Error('Truth doc missing S1/S2 steps');
  }

  ensureEqual(s1Status, truthS1.status, 'UI S1 status');
  ensureEqual(s2Status, truthS2.status, 'UI S2 status');
  if (truthBlocker && uiBlocker !== truthBlocker) {
    throw new Error(`First blocker mismatch: UI ${uiBlocker}, truth ${truthBlocker}`);
  }

  console.log('OK: ops UI matches pipeline latest + truth chain');
  await browser.close();
  process.exit(0);
} catch (err) {
  if (browser) await browser.close();
  console.error('FAIL:', err?.message || err);
  process.exit(1);
}
