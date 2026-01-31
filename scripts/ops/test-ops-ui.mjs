import { chromium } from 'playwright';
import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const opsUrl = `${base}/ops/?debug=1&t=${Date.now()}`;
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

function parseFirstInt(text) {
  const match = String(text || '').match(/-?\d+/);
  return match ? Number(match[0]) : NaN;
}

async function extractMarketPhaseInfo(page) {
  return page.evaluate(() => {
    const table = document.querySelector('#pipeline-marketphase');
    const renderStatus = document.querySelector('#ops-render-status');
    const rows = Array.from(table?.querySelectorAll('tr') || []);
    const rowData = rows.map((row) => {
      const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim() || '');
      return { label: cells[0] || '', count: cells[1] || '' };
    });
    const labels = rowData.map((row) => row.label);
    const fetchedRow = rowData.find((row) => row.label === 'Fetched');
    const validatedRow = rowData.find((row) => row.label === 'Validated');
    return {
      labels,
      rows: rowData,
      fetchedRaw: fetchedRow?.count || '',
      validatedRaw: validatedRow?.count || '',
      renderStatus: {
        status: renderStatus?.getAttribute('data-status') || '',
        baseline: renderStatus?.getAttribute('data-baseline') || '',
        reason: renderStatus?.getAttribute('data-reason') || ''
      },
      tableText: table?.innerText || '',
      tableHtml: table?.outerHTML || ''
    };
  });
}

function printForensic(info) {
  console.error('Forensic dump:');
  console.error('Labels:', info?.labels || []);
  console.error('Rows:', info?.rows || []);
  console.error('Fetched raw:', info?.fetchedRaw || '');
  console.error('Validated raw:', info?.validatedRaw || '');
  console.error('Table text:', info?.tableText || '');
  console.error('Table html:', info?.tableHtml || '');
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
  try {
    await page.waitForSelector('#ops-render-status[data-status="ok"][data-baseline="ok"]', { timeout: 20000 });
  } catch (err) {
    const info = await extractMarketPhaseInfo(page);
    printForensic(info);
    throw new Error('Timeout waiting for baseline render status');
  }

  try {
    await page.waitForFunction((expected) => {
      const table = document.querySelector('#pipeline-marketphase');
      if (!table) return false;
      const rows = Array.from(table.querySelectorAll('tr'));
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        const label = cells[0]?.textContent?.trim() || '';
        if (label === 'Fetched') {
          const raw = cells[1]?.textContent || '';
          const match = raw.match(/-?\d+/);
          const value = match ? Number(match[0]) : NaN;
          return Number.isFinite(value) && value === expected;
        }
      }
      return false;
    }, { timeout: 15000 }, expectedFetched);
  } catch (err) {
    const info = await extractMarketPhaseInfo(page);
    printForensic(info);
    const lastObserved = parseFirstInt(info.fetchedRaw);
    throw new Error(`Timeout waiting for fetched count=${expectedFetched}. Last observed=${Number.isFinite(lastObserved) ? lastObserved : 'invalid'}`);
  }

  const info = await extractMarketPhaseInfo(page);
  const fetchedUi = parseFirstInt(info.fetchedRaw);
  const validatedUi = parseFirstInt(info.validatedRaw);
  if (!Number.isFinite(fetchedUi)) {
    printForensic(info);
    throw new Error(`UI fetched count missing or invalid: "${info.fetchedRaw}"`);
  }
  if (!Number.isFinite(validatedUi)) {
    printForensic(info);
    throw new Error(`UI validated count missing or invalid: "${info.validatedRaw}"`);
  }

  if (fetchedUi !== expectedFetched) {
    printForensic(info);
    throw new Error(`UI fetched vs latest mismatch: got ${fetchedUi}, expected ${expectedFetched}`);
  }
  if (validatedUi !== expectedValidated) {
    printForensic(info);
    throw new Error(`UI validated vs latest mismatch: got ${validatedUi}, expected ${expectedValidated}`);
  }

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
