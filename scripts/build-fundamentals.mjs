#!/usr/bin/env node
/**
 * build-fundamentals.mjs
 *
 * Waterfall Fundamentals Ingestor — writes per-ticker JSON to public/data/fundamentals/
 *
 * Provider chain per ticker:
 *   1. EODHD        (EODHD_API_KEY or EODHD_API_TOKEN)
 *   2. FMP Stable   (FMP_API_KEY — dual endpoint: profile + key-metrics-ttm)
 *   3. Finnhub      (FINNHUB_API_KEY — best-effort, skipped if key absent)
 *   4. AlphaVantage (ALPHAVANTAGE_API_KEY — best-effort, skipped if key absent)
 *
 * Usage:
 *   node scripts/build-fundamentals.mjs
 *   node scripts/build-fundamentals.mjs --limit 50
 *   node scripts/build-fundamentals.mjs --ticker AAPL,MSFT
 *   node scripts/build-fundamentals.mjs --published-subset
 *   node scripts/build-fundamentals.mjs --top-scope
 *   node scripts/build-fundamentals.mjs --force   (ignore 23h incremental skip)
 *   node scripts/build-fundamentals.mjs --dry-run
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countMeaningfulFundamentals,
  DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS,
  DEFAULT_FUNDAMENTALS_SCOPE_NAME,
  DEFAULT_FUNDAMENTALS_SCOPE_SIZE,
  normalizeTicker,
} from '../functions/api/_shared/fundamentals-scope.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'fundamentals');
const HP_DIR = path.join(ROOT, 'public', 'data', 'hist-probs');
const US_EU_SCOPE_ROWS_PATH = path.join(ROOT, 'mirrors', 'universe-v7', 'ssot', 'stocks_etfs.us_eu.rows.json');
const BEST_SETUPS_PATH = path.join(ROOT, 'public', 'data', 'snapshots', 'best-setups-v4.json');
const SCOPE_OUT_PATH = path.join(OUT_DIR, '_scope.json');

// Auto-load .dev.vars (Cloudflare Wrangler convention — same as dev-local.sh)
{
  const devVarsPath = path.join(ROOT, '.dev.vars');
  try {
    const raw = await fs.readFile(devVarsPath, 'utf8').catch(() => '');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

const args = process.argv.slice(2);
const FLAG_FORCE = args.includes('--force');
const FLAG_DRY = args.includes('--dry-run');
const FLAG_PUBLISHED_SUBSET = args.includes('--published-subset');
const FLAG_TOP_SCOPE = args.includes('--top-scope');
const FLAG_LIMIT = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : null; })();
const FLAG_TICKER = (() => { const i = args.indexOf('--ticker'); return i !== -1 ? args[i + 1].split(',').map(t => t.trim().toUpperCase()) : null; })();

const env = {
  EODHD_API_KEY: process.env.EODHD_API_KEY || process.env.EODHD_API_TOKEN || '',
  FMP_API_KEY: process.env.FMP_API_KEY || '',
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY || '',
  ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY || '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (res.status === 429) { throw new Error('RATE_LIMITED'); }
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (String(e?.message).includes('RATE_LIMITED')) throw e;
    return null;
  } finally {
    clearTimeout(t);
  }
}

function normalizeDateId(value) {
  const normalized = String(value || '').slice(0, 10).trim();
  return normalized || null;
}

async function readJsonMaybe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function loadUsEuRows() {
  const doc = await readJsonMaybe(US_EU_SCOPE_ROWS_PATH);
  return Array.isArray(doc?.items) ? doc.items : [];
}

function collectBestSetupsTickers(bestSetupsDoc) {
  const ranked = [];
  const groups = bestSetupsDoc?.data || {};
  for (const assetClassKey of ['stocks', 'etfs']) {
    const assetClassGroup = groups?.[assetClassKey] || {};
    for (const horizonKey of ['short', 'medium', 'long']) {
      for (const row of assetClassGroup?.[horizonKey] || []) {
        const ticker = normalizeTicker(row?.ticker || row?.symbol);
        if (ticker) ranked.push(ticker);
      }
    }
  }
  return ranked;
}

async function loadExistingFundamentalsSnapshot() {
  const docs = new Map();
  const files = await fs.readdir(OUT_DIR).catch(() => []);
  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    const ticker = normalizeTicker(file.replace(/\.json$/i, ''));
    if (!ticker) continue;
    const doc = await readJsonMaybe(path.join(OUT_DIR, file));
    if (doc) docs.set(ticker, doc);
  }
  return docs;
}

function buildScopeDocument({ rows, bestSetupsDoc, existingDocs }) {
  const targetMarketDate = normalizeDateId(bestSetupsDoc?.meta?.data_asof)
    || rows.map((row) => normalizeDateId(row?.last_trade_date)).filter(Boolean).sort().slice(-1)[0]
    || null;
  const seededTickers = collectBestSetupsTickers(bestSetupsDoc);
  const seededRank = new Map();
  seededTickers.forEach((ticker, index) => {
    if (!seededRank.has(ticker)) seededRank.set(ticker, index + 1);
  });

  const candidates = rows
    .filter((row) => ['STOCK', 'ETF'].includes(String(row?.type_norm || '').toUpperCase()))
    .map((row) => {
      const ticker = normalizeTicker(row?.symbol);
      if (!ticker) return null;
      const assetClass = String(row?.type_norm || '').toUpperCase();
      const existing = existingDocs.get(ticker) || null;
      const seeded = seededRank.has(ticker);
      const meaningfulFields = countMeaningfulFundamentals(existing);
      return {
        ticker,
        name: row?.name || existing?.companyName || ticker,
        asset_class: assetClass,
        exchange: row?.exchange || null,
        country: row?.country || null,
        scope_region: row?.scope_region || null,
        bars_count: Number(row?.bars_count || 0),
        avg_volume_30d: Number(row?.avg_volume_30d || 0),
        market_cap: Number(existing?.marketCap || 0),
        last_trade_date: normalizeDateId(row?.last_trade_date),
        seeded_by_best_setups: seeded,
        best_setups_seed_rank: seeded ? seededRank.get(ticker) : null,
        existing_fundamentals_fields: meaningfulFields,
        existing_fundamentals_updated_at: normalizeDateId(existing?.updatedAt || existing?.asOf || existing?.date),
        coverage_expected: assetClass === 'STOCK' || meaningfulFields >= 2,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (Number(b.seeded_by_best_setups) !== Number(a.seeded_by_best_setups)) {
        return Number(b.seeded_by_best_setups) - Number(a.seeded_by_best_setups);
      }
      if ((a.best_setups_seed_rank ?? Infinity) !== (b.best_setups_seed_rank ?? Infinity)) {
        return (a.best_setups_seed_rank ?? Infinity) - (b.best_setups_seed_rank ?? Infinity);
      }
      if (b.market_cap !== a.market_cap) return b.market_cap - a.market_cap;
      if (b.avg_volume_30d !== a.avg_volume_30d) return b.avg_volume_30d - a.avg_volume_30d;
      if (b.bars_count !== a.bars_count) return b.bars_count - a.bars_count;
      return a.ticker.localeCompare(b.ticker);
    });

  const scopeSize = Number(process.env.RV_FUNDAMENTALS_SCOPE_SIZE || DEFAULT_FUNDAMENTALS_SCOPE_SIZE);
  const members = candidates.slice(0, scopeSize).map((entry, index) => ({
    ...entry,
    scope_rank: index + 1,
  }));

  return {
    schema: 'rv_fundamentals_scope_v1',
    generated_at: new Date().toISOString(),
    target_market_date: targetMarketDate,
    scope_name: DEFAULT_FUNDAMENTALS_SCOPE_NAME,
    scope_size: scopeSize,
    freshness_limit_trading_days: DEFAULT_FUNDAMENTALS_FRESHNESS_LIMIT_TRADING_DAYS,
    selection_policy: {
      seed: 'best_setups_v4',
      fill: 'market_cap_desc_then_avg_volume_30d_then_bars_count_then_symbol',
    },
    coverage_expected_counts: {
      total: members.filter((entry) => entry.coverage_expected).length,
      stocks: members.filter((entry) => entry.asset_class === 'STOCK' && entry.coverage_expected).length,
      etfs: members.filter((entry) => entry.asset_class === 'ETF' && entry.coverage_expected).length,
    },
    members,
  };
}

// ── Provider: EODHD ──────────────────────────────────────────────────────────

async function fetchEodhd(ticker) {
  if (!env.EODHD_API_KEY) return null;
  let sym = ticker.toUpperCase();
  const classShare = sym.match(/^([A-Z0-9]+)\.([A-Z])$/);
  if (classShare) sym = `${classShare[1]}-${classShare[2]}.US`;
  else if (!sym.includes('.')) sym = `${sym}.US`;

  const url = `https://eodhd.com/api/fundamentals/${encodeURIComponent(sym)}?api_token=${encodeURIComponent(env.EODHD_API_KEY)}&fmt=json`;
  const raw = await fetchJson(url);
  if (!raw || !raw.General) return null;

  const G = raw.General;
  const H = raw.Highlights || {};
  const V = raw.Valuation || {};
  const S = raw.SharesStats || {};
  return {
    ticker,
    companyName: G.Name || null,
    marketCap: toNumber(H.MarketCapitalization),
    pe_ttm: toNumber(H.PERatio),
    ps_ttm: toNumber(V.PriceSalesTTM),
    pb: toNumber(V.PriceBookMRQ),
    ev_ebitda: toNumber(V.EnterpriseValueEbitda),
    revenue_ttm: toNumber(H.RevenueTTM),
    grossMargin: toNumber(H.ProfitMargin),
    operatingMargin: toNumber(H.OperatingMarginTTM),
    netMargin: toNumber(H.ProfitMargin),
    eps_ttm: toNumber(H.EpsTTM),
    nextEarningsDate: null,
    updatedAt: new Date().toISOString().slice(0, 10),
    sector: G.Sector || null,
    industry: G.Industry || null,
    exchange: G.Exchange || null,
    country: G.CountryISO || null,
    dividendYield: toNumber(H.DividendYield),
    beta: toNumber(G.Beta),
    sharesOutstanding: toNumber(S.SharesOutstanding),
    sharesFloat: toNumber(S.SharesFloat),
  };
}

// ── Provider: FMP Stable (dual endpoint) ─────────────────────────────────────

async function fetchFmp(ticker) {
  if (!env.FMP_API_KEY) return null;
  const sym = encodeURIComponent(ticker.toUpperCase());
  const key = encodeURIComponent(env.FMP_API_KEY);
  const base = 'https://financialmodelingprep.com/stable';

  const [profilePayload, ratiosPayload, metricsPayload] = await Promise.all([
    fetchJson(`${base}/profile?symbol=${sym}&apikey=${key}`),
    fetchJson(`${base}/ratios-ttm?symbol=${sym}&apikey=${key}`),
    fetchJson(`${base}/key-metrics-ttm?symbol=${sym}&apikey=${key}`)
  ]);

  const p = Array.isArray(profilePayload) ? profilePayload[0] : profilePayload;
  if (!p) return null;
  const r = Array.isArray(ratiosPayload) ? ratiosPayload[0] : ratiosPayload;
  const m = Array.isArray(metricsPayload) ? metricsPayload[0] : metricsPayload;

  return {
    ticker,
    companyName: p.companyName || null,
    marketCap: toNumber(p.marketCap) || toNumber(p.mktCap) || null,
    pe_ttm: toNumber(r?.priceToEarningsRatioTTM) || toNumber(p.pe) || null,
    ps_ttm: toNumber(r?.priceToSalesRatioTTM) || null,
    pb: toNumber(r?.priceToBookRatioTTM) || null,
    ev_ebitda: toNumber(m?.evToEBITDATTM) || null,
    revenue_ttm: null,
    grossMargin: toNumber(r?.grossProfitMarginTTM) || null,
    operatingMargin: toNumber(r?.operatingProfitMarginTTM) || null,
    netMargin: toNumber(r?.netProfitMarginTTM) || null,
    eps_ttm: toNumber(p.eps) || null,
    nextEarningsDate: null,
    updatedAt: new Date().toISOString().slice(0, 10),
    sector: p.sector || null,
    industry: p.industry || null,
    exchange: p.exchangeShortName || p.exchange || null,
    country: p.country || null,
    dividendYield: toNumber(p.lastDiv) || null,
    beta: toNumber(p.beta) || null,
    returnOnEquity: toNumber(m?.returnOnEquityTTM) || null,
    returnOnAssets: toNumber(m?.returnOnAssetsTTM) || null,
  };
}

// ── Provider: Finnhub ─────────────────────────────────────────────────────────

async function fetchFinnhub(ticker) {
  if (!env.FINNHUB_API_KEY) return null;
  const sym = encodeURIComponent(ticker.toUpperCase());
  const key = encodeURIComponent(env.FINNHUB_API_KEY);

  const [profile, metrics] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${key}`),
    fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${key}`)
  ]);

  if (!profile || !profile.name) return null;
  const m = metrics?.metric || {};

  return {
    ticker,
    companyName: profile.name || null,
    marketCap: toNumber(profile.marketCapitalization) ? toNumber(profile.marketCapitalization) * 1e6 : null,
    pe_ttm: toNumber(m.peTTM) || toNumber(m.peExclExtraTTM) || null,
    ps_ttm: toNumber(m.psTTM) || null,
    pb: toNumber(m.pbQuarterly) || null,
    ev_ebitda: toNumber(m.enterpriseValueEbitdaTTM) || null,
    revenue_ttm: toNumber(m.revenuePerShareTTM) || null,
    grossMargin: toNumber(m.grossMarginTTM) || null,
    operatingMargin: toNumber(m.operatingMarginTTM) || null,
    netMargin: toNumber(m.netMarginTTM) || null,
    eps_ttm: toNumber(m.epsTTM) || null,
    nextEarningsDate: null,
    updatedAt: new Date().toISOString().slice(0, 10),
    sector: profile.finnhubIndustry || null,
    industry: null,
    exchange: profile.exchange || null,
    country: profile.country || null,
    dividendYield: toNumber(m.dividendYieldIndicatedAnnual) || null,
    beta: toNumber(m.beta) || null,
  };
}

// ── Provider: AlphaVantage ────────────────────────────────────────────────────

async function fetchAlphaVantage(ticker) {
  if (!env.ALPHAVANTAGE_API_KEY) return null;
  const sym = encodeURIComponent(ticker.toUpperCase());
  const key = encodeURIComponent(env.ALPHAVANTAGE_API_KEY);

  const raw = await fetchJson(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${sym}&apikey=${key}`);
  if (!raw || !raw.Symbol || raw.Note) return null;

  return {
    ticker,
    companyName: raw.Name || null,
    marketCap: toNumber(raw.MarketCapitalization),
    pe_ttm: toNumber(raw.PERatio),
    ps_ttm: toNumber(raw.PriceToSalesRatioTTM),
    pb: toNumber(raw.PriceToBookRatio),
    ev_ebitda: toNumber(raw.EVToEBITDA),
    revenue_ttm: toNumber(raw.RevenueTTM),
    grossMargin: null,
    operatingMargin: toNumber(raw.OperatingMarginTTM),
    netMargin: toNumber(raw.ProfitMargin),
    eps_ttm: toNumber(raw.EPS),
    nextEarningsDate: raw.NextEarningsDate || null,
    updatedAt: new Date().toISOString().slice(0, 10),
    sector: raw.Sector || null,
    industry: raw.Industry || null,
    exchange: raw.Exchange || null,
    country: raw.Country || null,
    dividendYield: toNumber(raw.DividendYield),
    beta: toNumber(raw.Beta),
    returnOnEquity: toNumber(raw.ReturnOnEquityTTM),
    returnOnAssets: toNumber(raw.ReturnOnAssetsTTM),
  };
}

// ── Waterfall per ticker ──────────────────────────────────────────────────────

function hasData(d) {
  if (!d) return false;
  return d.marketCap || d.pe_ttm || d.eps_ttm || d.companyName;
}

async function fetchWaterfall(ticker) {
  const providers = [
    { name: 'eodhd', fn: fetchEodhd },
    { name: 'fmp', fn: fetchFmp },
    { name: 'finnhub', fn: fetchFinnhub },
    { name: 'alphavantage', fn: fetchAlphaVantage },
  ];

  for (const { name, fn } of providers) {
    try {
      const data = await fn(ticker);
      if (hasData(data)) return { data, provider: name };
    } catch (e) {
      if (String(e?.message).includes('RATE_LIMITED')) {
        process.stdout.write(`  ⏭ ${ticker} (${name} rate limited — trying next provider)\n`);
      }
    }
  }
  return { data: null, provider: null };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CANONICAL_SYMBOLS_PATH = path.join(ROOT, 'public', 'data', 'universe', 'v7', 'ssot', 'stocks.max.symbols.json');

async function loadUsEuStockRows() {
  const rows = await loadUsEuRows();
  return rows.filter((row) => String(row?.type_norm || '').toUpperCase() === 'STOCK');
}

async function loadPublishedSubsetTickers() {
  const files = await fs.readdir(OUT_DIR).catch(() => []);
  const tickers = files
    .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
    .map((name) => normalizeTicker(name.replace(/\.json$/i, '')))
    .filter(Boolean)
    .sort();
  return FLAG_LIMIT ? tickers.slice(0, FLAG_LIMIT) : tickers;
}

async function getTickers() {
  if (FLAG_TICKER) return FLAG_TICKER;
  if (FLAG_TOP_SCOPE) {
    const scopeDoc = await readJsonMaybe(SCOPE_OUT_PATH);
    const tickers = (scopeDoc?.members || []).map((member) => normalizeTicker(member?.ticker)).filter(Boolean);
    if (tickers.length > 0) {
      console.log(`  [fundamentals] Using prioritized scope: ${tickers.length} tickers from public/data/fundamentals/_scope.json`);
      return FLAG_LIMIT ? tickers.slice(0, FLAG_LIMIT) : tickers;
    }
  }
  if (FLAG_PUBLISHED_SUBSET) {
    const published = await loadPublishedSubsetTickers();
    if (published.length > 0) {
      console.log(`  [fundamentals] Using published subset: ${published.length} tickers from public/data/fundamentals`);
      return published;
    }
  }

  const usEuRows = await loadUsEuStockRows();
  if (usEuRows.length > 0) {
    const tickers = usEuRows
      .map((row) => String(row?.symbol || '').trim().toUpperCase())
      .filter(Boolean);
    console.log(`  [fundamentals] Using US+EU stock scope: ${tickers.length} tickers from stocks_etfs.us_eu.rows.json`);
    return FLAG_LIMIT ? tickers.slice(0, FLAG_LIMIT) : tickers;
  }

  // Primary: canonical universe list — robust against hist_probs turbo creating 40k+ files
  try {
    const raw = await fs.readFile(CANONICAL_SYMBOLS_PATH, 'utf8');
    const doc = JSON.parse(raw);
    const symbols = Array.isArray(doc) ? doc : (Array.isArray(doc?.symbols) ? doc.symbols : []);
    const tickers = symbols.map(s => String(s || '').trim().toUpperCase()).filter(Boolean);
    if (tickers.length > 0) {
      console.log(`  [fundamentals] Using canonical universe: ${tickers.length} tickers from stocks.max.symbols.json`);
      return FLAG_LIMIT ? tickers.slice(0, FLAG_LIMIT) : tickers;
    }
  } catch {
    console.warn('  [fundamentals] Could not load canonical symbols, falling back to hist-probs dir');
  }

  // Fallback: hist-probs directory (legacy)
  const files = await fs.readdir(HP_DIR).catch(() => []);
  const tickers = files
    .filter(f => f.endsWith('.json') && !f.startsWith('regime'))
    .map(f => f.replace('.json', '').toUpperCase());

  return FLAG_LIMIT ? tickers.slice(0, FLAG_LIMIT) : tickers;
}

async function buildExpectedDateMap() {
  const map = new Map();
  const rows = await loadUsEuRows();
  for (const row of rows) {
    const ticker = normalizeTicker(row?.symbol);
    if (!ticker) continue;
    const expectedDate = normalizeDateId(row?.last_trade_date);
    if (!map.has(ticker) || (expectedDate && expectedDate > map.get(ticker))) {
      map.set(ticker, expectedDate || null);
    }
  }
  return map;
}

async function isStale(filePath, expectedDate = null) {
  if (FLAG_FORCE) return true;
  try {
    const doc = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const updatedAt = normalizeDateId(doc?.updatedAt || doc?.asOf || doc?.date);
    if (expectedDate && updatedAt && updatedAt >= expectedDate) return false;
    const stat = await fs.stat(filePath);
    const ageH = (Date.now() - stat.mtimeMs) / 3600000;
    return ageH >= 23;
  } catch {
    return true;
  }
}

async function processBatch(batch, stats, expectedDateByTicker) {
  await Promise.all(batch.map(async (ticker) => {
    const outFile = path.join(OUT_DIR, `${ticker}.json`);
    const expectedDate = expectedDateByTicker.get(ticker) || null;
    if (!(await isStale(outFile, expectedDate))) {
      stats.skipped++;
      return;
    }

    const { data, provider } = await fetchWaterfall(ticker);
    stats.total++;

    if (data) {
      stats.success++;
      stats.by_provider[provider] = (stats.by_provider[provider] || 0) + 1;
      if (!FLAG_DRY) {
        await fs.writeFile(outFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
      }
      process.stdout.write(`  ✓ ${ticker} (${provider})\n`);
    } else {
      stats.failed++;
      process.stdout.write(`  ✗ ${ticker} (all providers failed)\n`);
    }
  }));
}

async function main() {
  console.log('── Fundamentals Waterfall Ingestor ──');
  if (FLAG_DRY) console.log('  DRY RUN — no files written');

  await fs.mkdir(OUT_DIR, { recursive: true });

  const [rows, bestSetupsDoc, existingDocs] = await Promise.all([
    loadUsEuRows(),
    readJsonMaybe(BEST_SETUPS_PATH),
    loadExistingFundamentalsSnapshot(),
  ]);
  const scopeDoc = buildScopeDocument({ rows, bestSetupsDoc, existingDocs });
  if (!FLAG_DRY) {
    await fs.writeFile(SCOPE_OUT_PATH, JSON.stringify(scopeDoc, null, 2) + '\n', 'utf8');
  }

  const tickers = await getTickers();
  const expectedDateByTicker = await buildExpectedDateMap();
  console.log(`  Tickers: ${tickers.length} | Providers: EODHD→FMP→Finnhub→AV`);
  console.log(`  Keys: EODHD=${env.EODHD_API_KEY ? 'YES' : 'NO'} FMP=${env.FMP_API_KEY ? 'YES' : 'NO'} Finnhub=${env.FINNHUB_API_KEY ? 'YES' : 'NO'} AV=${env.ALPHAVANTAGE_API_KEY ? 'YES' : 'NO'}`);

  const stats = { total: 0, success: 0, failed: 0, skipped: 0, by_provider: {} };
  const BATCH = 2;
  const DELAY = 800;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    await processBatch(batch, stats, expectedDateByTicker);
    if (i + BATCH < tickers.length) await new Promise(r => setTimeout(r, DELAY));
  }

  const index = {
    schema: 'rv_fundamentals_index_v1',
    generated_at: new Date().toISOString(),
    total: stats.total,
    success: stats.success,
    failed: stats.failed,
    skipped: stats.skipped,
    published_existing: (await loadPublishedSubsetTickers()).length,
    scope: FLAG_TOP_SCOPE
      ? 'top_scope'
      : FLAG_PUBLISHED_SUBSET
        ? 'published_subset'
        : 'us_eu_stock_only',
    scope_ref: 'public/data/fundamentals/_scope.json',
    scope_name: scopeDoc.scope_name,
    scope_size: scopeDoc.scope_size,
    scope_member_count: Array.isArray(scopeDoc.members) ? scopeDoc.members.length : 0,
    scope_target_market_date: scopeDoc.target_market_date || null,
    coverage_expected_count: scopeDoc.coverage_expected_counts?.total ?? null,
    by_provider: stats.by_provider,
  };

  if (!FLAG_DRY) {
    await fs.writeFile(path.join(OUT_DIR, '_index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  }

  console.log(`\n── Done ──`);
  console.log(`  Fetched: ${stats.success}/${stats.total} | Skipped: ${stats.skipped} | Failed: ${stats.failed}`);
  console.log(`  By provider:`, stats.by_provider);
}

main().catch(e => { console.error(e); process.exit(1); });
