import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const ticker = (process.argv[2] || '').trim().toUpperCase();
if (!ticker) {
  console.error('Usage: node scripts/ui-path/prove_ui_path.mjs <TICKER>');
  process.exit(1);
}

const base = process.env.BASE_URL || 'https://rubikvault.com';
const pageUrl = new URL(`/analyze/${encodeURIComponent(ticker)}`, base).toString();

function sha256Hex(input) {
  const h = createHash('sha256');
  h.update(input);
  return h.digest('hex');
}

function findLineRef(filePath, pattern) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for (let i = 0; i < lines.length; i += 1) {
    if (rx.test(lines[i])) {
      return { file: filePath, line: i + 1, text: lines[i].trim() };
    }
  }
  return null;
}

function parseNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/[$,]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeUiDate(dateText) {
  if (!dateText) return null;
  const parts = dateText.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
}

const browser = await chromium.launch();
const page = await browser.newPage();

const networkCalls = [];
page.on('response', async (response) => {
  try {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json') && !url.endsWith('.json') && !url.includes('/api/')) return;
    const text = await response.text();
    const sha = sha256Hex(text);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const bodyKeys = json && typeof json === 'object' ? Object.keys(json) : [];
    networkCalls.push({
      url,
      method: response.request().method(),
      status: response.status(),
      content_type: ct,
      sha256: sha,
      body_keys: bodyKeys,
      response_excerpt: json ? {
        schema_version: json.schema_version || json.schemaVersion || null,
        meta: json.meta || null,
        data: json.data ? { latest_bar: json.data.latest_bar || null, change: json.data.change || null } : null
      } : { text: text.slice(0, 400) }
    });
  } catch {
    // ignore
  }
});

await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

const uiValuesHandle = await page.waitForFunction(() => {
  const pickByLabel = (label) => {
    const span = Array.from(document.querySelectorAll('span')).find(s => s.textContent.trim() === label);
    if (!span || !span.parentElement) return null;
    const siblings = Array.from(span.parentElement.querySelectorAll('span'));
    if (siblings.length < 2) return null;
    return siblings[1].textContent.trim();
  };

  const closeText = pickByLabel('Close');
  const volumeText = pickByLabel('Volume');
  const dateText = (() => {
    const match = Array.from(document.querySelectorAll('div')).map(el => el.textContent.trim()).find(t => /\d{2}-\d{2}-\d{4}/.test(t));
    if (!match) return null;
    const m = match.match(/\d{2}-\d{2}-\d{4}/);
    return m ? m[0] : null;
  })();

  if (!closeText || closeText === '—') return null;
  return { closeText, volumeText, dateText };
}, null, { timeout: 20000 });

const ui = await uiValuesHandle.jsonValue();
const uiClose = parseNumber(ui.closeText);
const uiVolume = parseNumber(ui.volumeText);
const uiDateIso = normalizeUiDate(ui.dateText);

await page.waitForTimeout(500);
await browser.close();

if (uiClose == null || uiVolume == null || !uiDateIso) {
  console.error('UI values missing:', ui);
  process.exit(1);
}

const winning = networkCalls.find((call) => {
  if (!call.response_excerpt || !call.response_excerpt.data) return false;
  const bar = call.response_excerpt.data.latest_bar || {};
  if (bar.close == null || bar.volume == null || !bar.date) return false;
  const closeMatch = Number(bar.close) === Number(uiClose);
  const volumeMatch = Number(bar.volume) === Number(uiVolume);
  const dateMatch = String(bar.date).slice(0, 10) === uiDateIso;
  return closeMatch && volumeMatch && dateMatch;
});
const winningError = winning
  ? null
  : { code: 'WINNING_RESPONSE_NOT_FOUND', message: 'No response matched UI values', ui };

const handlerFile = resolve(process.cwd(), 'functions/api/stock.js');
const handlerRef = findLineRef(handlerFile, 'export async function onRequestGet');
const latestBarRef = findLineRef(handlerFile, 'const latestBar = pickLatestBar');
const dayChangeRef = findLineRef(handlerFile, 'const dayChange = computeDayChange');

async function inspectSnapshotContainsTicker() {
  try {
    const snapUrl = new URL('/data/snapshots/market-prices/latest.json', base).toString();
    const res = await fetch(snapUrl, { cache: 'no-store' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!json) return { ok: false, status: res.status, contains: null, url: snapUrl };
    const data = json.data || [];
    const found = Array.isArray(data)
      ? data.some((row) => String(row?.symbol || '').toUpperCase() === ticker)
      : Object.prototype.hasOwnProperty.call(data || {}, ticker);
    return { ok: res.ok, status: res.status, contains: found, url: snapUrl };
  } catch {
    return { ok: false, status: null, contains: null, url: null };
  }
}

const upstream = await (async () => {
  const meta = winning?.response_excerpt?.meta || {};
  const dataSource = meta.data_source || null;
  if (dataSource === 'snapshot') {
    const snap = await inspectSnapshotContainsTicker();
    return {
      kind: 'public_data',
      key_or_path: '/data/snapshots/market-prices/latest.json',
      snapshot_probe: snap
    };
  }
  if (dataSource === 'real_provider') {
    return { kind: 'provider', provider_name: meta.provider || null, key_or_path: null };
  }
  if (!winning) {
    return { kind: 'unknown', key_or_path: null, error: 'no winning response' };
  }
  return { kind: 'unknown', key_or_path: null };
})();

const winningPath = (() => {
  if (!winning?.url) return null;
  try {
    const u = new URL(winning.url);
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
})();
const winningBar = winning?.response_excerpt?.data?.latest_bar || null;
const requiredFields = ['date', 'close', 'volume'];
const missingFields = winningBar
  ? requiredFields.filter((key) => winningBar[key] == null)
  : requiredFields.slice();

const trace = {
  trace_version: 'v1',
  generated_at: new Date().toISOString(),
  base_url: base,
  ticker,
  page_url: pageUrl,
  ui: {
    values: {
      close: uiClose,
      volume: uiVolume,
      date: uiDateIso,
      close_text: ui.closeText,
      volume_text: ui.volumeText,
      date_text: ui.dateText
    }
  },
  network: {
    winning: {
      path: winningPath,
      status: winning?.status ?? null,
      sha256: winning?.sha256 || null,
      body_keys: winning?.body_keys || [],
      contract: {
        checked_path: 'data.latest_bar',
        required_fields: requiredFields,
        missing_fields: missingFields
      },
      error: winningError
    },
    calls: networkCalls.sort((a, b) => a.url.localeCompare(b.url))
  },
  server: {
    endpoint: winningPath,
    handler_file: handlerFile,
    handler_line_ref: handlerRef,
    value_line_refs: {
      latest_bar: latestBarRef,
      change: dayChangeRef
    }
  },
  upstream,
  error: winningError,
  winning_response: {
    path: winningPath,
    status: winning?.status ?? null,
    sha256: winning?.sha256 || null,
    error: winningError
  }
};

const outDir = resolve(process.cwd(), 'public/debug/ui-path');
const outPath = resolve(outDir, `${ticker}.ui-path.trace.json`);

try {
  await import('node:fs').then(fs => fs.mkdirSync(outDir, { recursive: true }));
  await import('node:fs').then(fs => fs.writeFileSync(outPath, JSON.stringify(trace, null, 2) + '\n'));
} catch (err) {
  console.error('Failed to write trace file:', err);
  process.exit(1);
}

if (winningError) {
  console.error(winningError.message);
  process.exit(1);
}

console.log(`TRACE OK: ${ticker}`);
console.log(`Winning response: ${winning.url}`);
console.log(`Output: ${outPath}`);
