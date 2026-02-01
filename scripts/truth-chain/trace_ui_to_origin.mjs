import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256Hex, hashFile } from './lib/hash.mjs';
import { firstLineRef, findLineRefs } from './lib/line-ref.mjs';
import { computeUiValues } from './lib/ui-values.mjs';
import { pickPaths } from './lib/excerpt.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const ticker = (process.argv[2] || '').trim().toUpperCase();
if (!ticker) {
  fail('Usage: node scripts/truth-chain/trace_ui_to_origin.mjs <TICKER>');
}

const base = process.env.BASE_URL || process.env.TRACE_BASE || process.env.RV_BASE || process.env.OPS_BASE;
if (!base) {
  fail('Missing BASE_URL/TRACE_BASE/RV_BASE/OPS_BASE for API fetch.');
}

const repoRoot = process.cwd();
const uiFile = resolve(repoRoot, 'public/index.html');
const stockHandlerFile = resolve(repoRoot, 'functions/api/stock.js');
const fundamentalsHandlerFile = resolve(repoRoot, 'functions/api/fundamentals.js');

if (!existsSync(uiFile)) fail(`UI file not found: ${uiFile}`);
if (!existsSync(stockHandlerFile)) fail(`Stock handler not found: ${stockHandlerFile}`);
if (!existsSync(fundamentalsHandlerFile)) fail(`Fundamentals handler not found: ${fundamentalsHandlerFile}`);

const uiHash = hashFile(uiFile);
const stockHandlerHash = hashFile(stockHandlerFile);
const fundamentalsHandlerHash = hashFile(fundamentalsHandlerFile);

const uiRefs = {
  loadAnalyze: firstLineRef(uiFile, 'async function loadAnalyze'),
  fetchStock: firstLineRef(uiFile, '/api/stock'),
  fetchFundamentals: firstLineRef(uiFile, '/api/fundamentals'),
  barLine: firstLineRef(uiFile, 'const bar = data?.latest_bar'),
  closeLine: firstLineRef(uiFile, 'const close = bar?.close'),
  changeAbsLine: firstLineRef(uiFile, 'const changeAbs = data?.change?.abs'),
  changePctLine: firstLineRef(uiFile, 'const changePct = data?.change?.pct'),
  volumeLine: firstLineRef(uiFile, 'const volume = bar?.volume'),
  dateLine: firstLineRef(uiFile, 'const date = bar?.date'),
  formatNumber: firstLineRef(uiFile, 'function formatNumber'),
  formatPercent: firstLineRef(uiFile, 'function formatPercent'),
  formatDate: firstLineRef(uiFile, 'const formatDateDDMMYYYY')
};

const stockRefs = {
  handler: firstLineRef(stockHandlerFile, 'export async function onRequestGet'),
  pickLatestBar: firstLineRef(stockHandlerFile, 'function pickLatestBar'),
  computeDayChange: firstLineRef(stockHandlerFile, 'function computeDayChange'),
  latestBarAssign: firstLineRef(stockHandlerFile, 'const latestBar = pickLatestBar'),
  dayChangeAssign: firstLineRef(stockHandlerFile, 'const dayChange = computeDayChange'),
  indicatorsAssign: firstLineRef(stockHandlerFile, 'const indicatorOut = computeIndicators')
};

const fundamentalsRefs = {
  handler: firstLineRef(fundamentalsHandlerFile, 'export async function onRequestGet'),
  normalize: firstLineRef(fundamentalsHandlerFile, 'normalizeFundamentalsFromTiingoRow')
};

const stockUrl = new URL(`/api/stock?ticker=${encodeURIComponent(ticker)}`, base).toString();
const fundamentalsUrl = new URL(`/api/fundamentals?ticker=${encodeURIComponent(ticker)}`, base).toString();
const marketphaseUrl = new URL(`/data/marketphase/${encodeURIComponent(ticker)}.json`, base).toString();
const stockAnalysisUrl = new URL('/data/snapshots/stock-analysis.json', base).toString();
const marketphaseIndexUrl = new URL('/data/marketphase/index.json', base).toString();

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { url, ok: res.ok, status: res.status, text, json, sha256: sha256Hex(text) };
}

const stockRes = await fetchJson(stockUrl);
if (!stockRes.ok || !stockRes.json) {
  fail(`Failed to fetch /api/stock: HTTP ${stockRes.status}`);
}

const fundamentalsRes = await fetchJson(fundamentalsUrl);
const marketphaseRes = await fetchJson(marketphaseUrl);
const stockAnalysisRes = await fetchJson(stockAnalysisUrl);
const marketphaseIndexRes = await fetchJson(marketphaseIndexUrl);

const uiValues = computeUiValues(stockRes.json);

function localArtifact(pathname) {
  if (!pathname) return null;
  const clean = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const full = resolve(repoRoot, 'public', clean);
  if (!existsSync(full)) return { path: pathname, local_path: full, exists: false };
  const raw = readFileSync(full, 'utf8');
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  return {
    path: pathname,
    local_path: full,
    exists: true,
    sha256: sha256Hex(raw),
    schema_version: json?.schema_version || json?.schemaVersion || null,
    excerpt: json ? pickPaths(json, ['schema_version', 'meta.status', 'meta.data_date', 'metadata.module', 'data.symbols', 'data.records']) : null
  };
}

const sourceArtifacts = [];
const sources = stockRes.json?.metadata?.sources || {};
for (const [moduleName, info] of Object.entries(sources)) {
  if (!info?.path) continue;
  const local = localArtifact(info.path);
  sourceArtifacts.push({
    module: moduleName,
    ...local,
    served_from: info.served_from,
    status: info.status,
    error: info.error || null
  });
}

const trace = {
  ticker,
  base,
  ui: {
    file: uiFile,
    sha256: uiHash,
    refs: uiRefs,
    render_values_from: {
      latest_bar_close: `${uiRefs.closeLine.line}:${uiRefs.closeLine.text.trim()}`,
      change_abs: `${uiRefs.changeAbsLine.line}:${uiRefs.changeAbsLine.text.trim()}`,
      change_pct: `${uiRefs.changePctLine.line}:${uiRefs.changePctLine.text.trim()}`,
      volume: `${uiRefs.volumeLine.line}:${uiRefs.volumeLine.text.trim()}`,
      date: `${uiRefs.dateLine.line}:${uiRefs.dateLine.text.trim()}`
    },
    formatters: {
      formatNumber: `${uiRefs.formatNumber.line}:${uiRefs.formatNumber.text.trim()}`,
      formatPercent: `${uiRefs.formatPercent.line}:${uiRefs.formatPercent.text.trim()}`,
      formatDate: `${uiRefs.formatDate.line}:${uiRefs.formatDate.text.trim()}`
    }
  },
  network: {
    stock: { url: stockRes.url, status: stockRes.status, sha256: stockRes.sha256 },
    fundamentals: { url: fundamentalsRes.url, status: fundamentalsRes.status, sha256: fundamentalsRes.sha256 },
    marketphase: { url: marketphaseRes.url, status: marketphaseRes.status, sha256: marketphaseRes.sha256 },
    stock_analysis: { url: stockAnalysisRes.url, status: stockAnalysisRes.status, sha256: stockAnalysisRes.sha256 },
    marketphase_index: { url: marketphaseIndexRes.url, status: marketphaseIndexRes.status, sha256: marketphaseIndexRes.sha256 }
  },
  server: {
    stock_handler: { file: stockHandlerFile, sha256: stockHandlerHash, refs: stockRefs },
    fundamentals_handler: { file: fundamentalsHandlerFile, sha256: fundamentalsHandlerHash, refs: fundamentalsRefs }
  },
  artifacts: {
    sources: sourceArtifacts,
    marketphase_local: localArtifact(`/data/marketphase/${ticker}.json`),
    marketphase_index_local: localArtifact('/data/marketphase/index.json'),
    stock_analysis_local: localArtifact('/data/snapshots/stock-analysis.json')
  },
  transforms: [
    { file: stockHandlerFile, fn: 'pickLatestBar', line: stockRefs.pickLatestBar.line },
    { file: stockHandlerFile, fn: 'computeDayChange', line: stockRefs.computeDayChange.line },
    { file: stockHandlerFile, fn: 'computeIndicators', line: stockRefs.indicatorsAssign.line },
    { file: uiFile, fn: 'formatNumber', line: uiRefs.formatNumber.line },
    { file: uiFile, fn: 'formatPercent', line: uiRefs.formatPercent.line },
    { file: uiFile, fn: 'formatDateDDMMYYYY', line: uiRefs.formatDate.line }
  ],
  response_excerpt: {
    meta: pickPaths(stockRes.json, ['meta.status', 'meta.data_date', 'meta.provider', 'meta.data_source', 'meta.mode', 'meta.asOf', 'meta.freshness']),
    metadata: pickPaths(stockRes.json, ['metadata.status', 'metadata.served_from', 'metadata.request.ticker', 'metadata.request.normalized_ticker']),
    latest_bar: pickPaths(stockRes.json, ['data.latest_bar.close', 'data.latest_bar.volume', 'data.latest_bar.date']),
    change: pickPaths(stockRes.json, ['data.change.abs', 'data.change.pct'])
  },
  final: uiValues
};

const outDir = resolve(repoRoot, 'public/debug/truth-chain');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `${ticker}.trace.json`);
writeFileSync(outPath, JSON.stringify(trace, null, 2) + '\n');

console.log(`TRACE OK: ${ticker}`);
console.log('[1] UI render path');
console.log(`  file: ${uiFile}`);
console.log(`  sha256: ${uiHash}`);
console.log(`  loadAnalyze line: ${uiRefs.loadAnalyze.line}`);
console.log(`  renderStock latest_bar line: ${uiRefs.barLine.line}`);
console.log('[2] Network calls (live)');
console.log(`  /api/stock -> ${stockRes.status} sha256=${stockRes.sha256}`);
console.log(`  /api/fundamentals -> ${fundamentalsRes.status} sha256=${fundamentalsRes.sha256}`);
console.log(`  /data/marketphase/${ticker}.json -> ${marketphaseRes.status} sha256=${marketphaseRes.sha256}`);
console.log(`  /data/snapshots/stock-analysis.json -> ${stockAnalysisRes.status} sha256=${stockAnalysisRes.sha256}`);
console.log(`  stock excerpt: ${JSON.stringify(trace.response_excerpt.latest_bar)} ${JSON.stringify(trace.response_excerpt.change)}`);
console.log('[3] Server handlers');
console.log(`  stock handler: ${stockHandlerFile} (line ${stockRefs.handler.line})`);
console.log(`  fundamentals handler: ${fundamentalsHandlerFile} (line ${fundamentalsRefs.handler.line})`);
console.log('[4] Snapshot sources (from /api/stock metadata.sources)');
if (sourceArtifacts.length) {
  for (const s of sourceArtifacts) {
    console.log(`  ${s.module}: ${s.path} local=${s.exists ? 'yes' : 'no'} sha=${s.sha256 || '—'}`);
  }
} else {
  console.log('  (none)');
}
console.log('[5] UI values (rendered)');
console.log(`  close=${uiValues.closeDisplay} day=${uiValues.dayAbsDisplay} ${uiValues.dayPctDisplay} volume=${uiValues.volumeDisplay} date=${uiValues.dateDisplay}`);
console.log(`[6] Trace report: ${outPath}`);
