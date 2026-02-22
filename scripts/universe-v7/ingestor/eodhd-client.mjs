import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'https://eodhd.com/api';

function key() {
  return String(process.env.EODHD_API_KEY || '').trim();
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function stripExchangeSuffix(raw) {
  const v = String(raw || '').trim().toUpperCase();
  if (!v) return '';
  const dot = v.indexOf('.');
  return dot > 0 ? v.slice(0, dot) : v;
}

function normalizeType(raw, exchangeCode = '') {
  const t = String(raw || '').trim().toUpperCase();
  const ex = String(exchangeCode || '').trim().toUpperCase();
  if (ex === 'FOREX') return 'FOREX';
  if (ex === 'CC') return 'CRYPTO';
  if (ex === 'GBOND') return 'BOND';
  if (ex === 'EUFUND') return 'FUND';
  if (!t) return 'OTHER';
  if (['COMMON STOCK', 'STOCK'].includes(t)) return 'STOCK';
  if (t.includes('ETF')) return 'ETF';
  if (t.includes('FUND')) return 'FUND';
  if (t.includes('BOND')) return 'BOND';
  if (t.includes('INDEX')) return 'INDEX';
  if (t.includes('FOREX') || t.includes('FX')) return 'FOREX';
  if (t.includes('CRYPTO')) return 'CRYPTO';
  return 'OTHER';
}

async function fetchJson(url, { retries = 3, timeoutMs = 15000 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'RubikVault-v7.1/1.0' },
        signal: ctl.signal
      });
      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`HTTP_${res.status}:${body.slice(0, 200)}`);
        err.status = res.status;
        if ([401, 402, 403].includes(res.status)) err.fatal = true;
        if (res.status === 402) err.dailyLimit = true;
        if (res.status === 429) {
          err.rateLimited = true;
          if (attempt >= retries) err.fatal = true;
        }
        throw err;
      }
      return {
        payload: await res.json(),
        attempts: attempt,
        status: res.status
      };
    } catch (err) {
      lastErr = err;
      err.attempts = attempt;
      err.maxAttempts = retries;
      if (err?.fatal) throw err;
      if (attempt < retries) await sleep(300 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('fetch_failed');
}

export async function fetchExchangesList() {
  const apiKey = key();
  if (!apiKey) throw new Error('MISSING_SECRET:EODHD_API_KEY');
  const url = `${BASE}/exchanges-list/?fmt=json&api_token=${encodeURIComponent(apiKey)}`;
  const result = await fetchJson(url, { retries: 3, timeoutMs: 20000 });
  const payload = result?.payload;
  const rows = Array.isArray(payload) ? payload : [];
  return {
    attempts: Number(result?.attempts || 1),
    rows: rows.map((row) => ({
      code: String(row?.Code || row?.code || '').trim().toUpperCase(),
      name: String(row?.Name || row?.name || '').trim() || null,
      mic: String(row?.OperatingMIC || row?.operatingMIC || '').trim().toUpperCase() || null,
      country: String(row?.Country || row?.country || '').trim().toUpperCase() || null,
      currency: String(row?.Currency || row?.currency || '').trim().toUpperCase() || null
    }))
    .filter((row) => row.code)
  };
}

export async function fetchExchangeSymbols(exchangeCode) {
  const apiKey = key();
  if (!apiKey) throw new Error('MISSING_SECRET:EODHD_API_KEY');
  const code = String(exchangeCode || '').trim().toUpperCase();
  const url = `${BASE}/exchange-symbol-list/${encodeURIComponent(code)}?fmt=json&api_token=${encodeURIComponent(apiKey)}`;
  const result = await fetchJson(url, { retries: 3, timeoutMs: 30000 });
  const payload = result?.payload;
  const rows = Array.isArray(payload) ? payload : [];
  return {
    attempts: Number(result?.attempts || 1),
    rows: rows.map((row) => {
      const symbol = normalizeSymbol(row?.Code || row?.code || row?.Symbol || row?.symbol);
      if (!symbol) return null;
      return {
        symbol,
        provider_symbol: String(row?.Code || row?.code || '').trim() || `${symbol}.${code}`,
        name: String(row?.Name || row?.name || '').trim() || null,
        currency: String(row?.Currency || row?.currency || '').trim().toUpperCase() || null,
        country: String(row?.Country || row?.country || '').trim().toUpperCase() || null,
        type_norm: normalizeType(row?.Type || row?.type, code)
      };
    })
    .filter(Boolean)
  };
}

export async function fetchDailyEod(symbol, exchangeCode, { from = null, to = null } = {}) {
  const apiKey = key();
  if (!apiKey) throw new Error('MISSING_SECRET:EODHD_API_KEY');
  const s = normalizeSymbol(symbol);
  const ex = String(exchangeCode || '').trim().toUpperCase();
  const candidates = [];
  if (ex === 'US') {
    const classShare = s.match(/^([A-Z0-9]+)\.([A-Z])$/);
    if (classShare) {
      candidates.push(`${classShare[1]}-${classShare[2]}.US`);
    }
  }
  candidates.push(`${s}.${ex}`);
  // Some Korea symbols are discoverable under KQ but price history resolves under KO.
  if (ex === 'KQ') {
    candidates.push(`${s}.KO`);
  }
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  let attemptsTotal = 0;
  let lastRows = [];

  for (const querySymbol of uniqueCandidates) {
    const url = new URL(`${BASE}/eod/${encodeURIComponent(querySymbol)}`);
    url.searchParams.set('api_token', apiKey);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('order', 'a');
    if (from) url.searchParams.set('from', from);
    if (to) url.searchParams.set('to', to);

    try {
      const result = await fetchJson(url.toString(), { retries: 3, timeoutMs: 25000 });
      attemptsTotal += Number(result?.attempts || 1);
      const payload = result?.payload;
      const rows = (Array.isArray(payload) ? payload : [])
        .map((row) => ({
          date: String(row?.date || '').slice(0, 10) || null,
          open: Number(row?.open),
          high: Number(row?.high),
          low: Number(row?.low),
          close: Number(row?.close),
          volume: Number(row?.volume),
          adjusted_close: Number(row?.adjusted_close ?? row?.adj_close ?? row?.close)
        }))
        .filter((row) => row.date && Number.isFinite(row.close));

      if (rows.length > 0) {
        return {
          attempts: Math.max(1, attemptsTotal),
          rows
        };
      }
      lastRows = rows;
      // Empty payload on this candidate: try next fallback candidate if available.
      continue;
    } catch (error) {
      const status = Number(error?.status || NaN);
      const attempts = Number(error?.attempts || 1);
      attemptsTotal += Number.isFinite(attempts) && attempts > 0 ? attempts : 1;
      // Auth/rate/budget failures must stop immediately.
      if ([401, 402, 403, 429].includes(status)) throw error;
      // 404 on one candidate can still be recoverable via fallback candidate.
      if (status === 404) continue;
      throw error;
    }
  }

  return {
    attempts: Math.max(1, attemptsTotal),
    rows: lastRows
  };
}

export async function fetchBulkLastDay(exchangeCode) {
  const apiKey = key();
  if (!apiKey) throw new Error('MISSING_SECRET:EODHD_API_KEY');
  const ex = String(exchangeCode || '').trim().toUpperCase();
  const url = `${BASE}/eod-bulk-last-day/${encodeURIComponent(ex)}?fmt=json&api_token=${encodeURIComponent(apiKey)}`;
  const result = await fetchJson(url, { retries: 3, timeoutMs: 45000 });
  const payload = result?.payload;
  const rows = Array.isArray(payload) ? payload : [];

  return {
    attempts: Number(result?.attempts || 1),
    rows: rows.map((row) => {
      const symbol = normalizeSymbol(
        row?.code || row?.Code || row?.symbol || row?.Symbol || row?.ticker || row?.Ticker
      );
      const stripped = stripExchangeSuffix(symbol);
      if (!stripped) return null;
      return {
        symbol: stripped,
        provider_symbol: symbol || `${stripped}.${ex}`,
        date: String(row?.date || row?.Date || '').slice(0, 10) || null,
        close: Number(row?.close ?? row?.Close),
        open: Number(row?.open ?? row?.Open),
        high: Number(row?.high ?? row?.High),
        low: Number(row?.low ?? row?.Low),
        volume: Number(row?.volume ?? row?.Volume)
      };
    })
    .filter((row) => row && row.symbol && Number.isFinite(row.close))
  };
}

/**
 * Fetch fundamentals data for a single ticker from EODHD.
 * Endpoint: /fundamentals/{TICKER}.{EXCHANGE}
 * Returns: normalized { highlights, financials, shares, dividends, general }
 */
export async function fetchFundamentals(symbol, exchangeCode = 'US') {
  const apiKey = key();
  if (!apiKey) throw new Error('MISSING_SECRET:EODHD_API_KEY');
  const s = normalizeSymbol(symbol);
  const ex = String(exchangeCode || 'US').trim().toUpperCase();
  const querySymbol = `${s}.${ex}`;
  const url = `${BASE}/fundamentals/${encodeURIComponent(querySymbol)}?fmt=json&api_token=${encodeURIComponent(apiKey)}`;

  const result = await fetchJson(url, { retries: 3, timeoutMs: 30000 });
  const p = result?.payload;
  if (!p || typeof p !== 'object') {
    return { symbol: s, exchange: ex, attempts: result?.attempts || 1, data: null };
  }

  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  // --- Highlights (key ratios) ---
  const hl = p.Highlights || {};
  const highlights = {
    marketCap: toNum(hl.MarketCapitalization),
    pe_ttm: toNum(hl.PERatio),
    eps_ttm: toNum(hl.EarningsShare),
    dividend_share: toNum(hl.DividendShare),
    dividend_yield: toNum(hl.DividendYield),
    revenue_ttm: toNum(hl.RevenueTTM),
    revenue_per_share: toNum(hl.RevenuePerShareTTM),
    profit_margin: toNum(hl.ProfitMargin),
    operating_margin: toNum(hl.OperatingMarginTTM),
    return_on_assets: toNum(hl.ReturnOnAssetsTTM),
    return_on_equity: toNum(hl.ReturnOnEquityTTM),
    gross_profit_ttm: toNum(hl.GrossProfitTTM),
    diluted_eps_ttm: toNum(hl.DilutedEpsTTM),
    quarterly_earnings_growth_yoy: toNum(hl.QuarterlyEarningsGrowthYOY),
    quarterly_revenue_growth_yoy: toNum(hl.QuarterlyRevenueGrowthYOY),
    book_value: toNum(hl.BookValue),
    ebitda: toNum(hl.EBITDA),
    pb: toNum(hl.PriceToBookRatio),
    ps_ttm: toNum(hl.PriceToSalesRatioTTM),
    ev_revenue: toNum(hl.EnterpriseValueRevenue),
    ev_ebitda: toNum(hl.EnterpriseValueEbitda),
    beta: toNum(hl.Beta),
    shares_outstanding: toNum(hl.SharesOutstanding),
    shares_float: toNum(hl.SharesFloat),
    peg_ratio: toNum(hl.PEGRatio),
    forward_pe: toNum(hl.ForwardPE),
    wall_street_target: toNum(hl.WallStreetTargetPrice),
  };

  // --- Income Statement (annual, last 5 years) ---
  const incomeAnnual = p.Financials?.Income_Statement?.yearly || {};
  const financials_income = Object.entries(incomeAnnual)
    .slice(0, 10)
    .map(([date, row]) => ({
      date: String(date).slice(0, 10),
      totalRevenue: toNum(row.totalRevenue),
      grossProfit: toNum(row.grossProfit),
      ebitda: toNum(row.ebitda),
      operatingIncome: toNum(row.operatingIncome),
      netIncome: toNum(row.netIncome),
      costOfRevenue: toNum(row.costOfRevenue),
      researchDevelopment: toNum(row.researchDevelopment),
      sellingGeneralAdministrative: toNum(row.sellingGeneralAdministrative),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Balance Sheet (annual, last 5 years) ---
  const balanceAnnual = p.Financials?.Balance_Sheet?.yearly || {};
  const financials_balance = Object.entries(balanceAnnual)
    .slice(0, 10)
    .map(([date, row]) => ({
      date: String(date).slice(0, 10),
      totalAssets: toNum(row.totalAssets),
      totalLiabilities: toNum(row.totalLiab || row.totalLiabilities),
      totalStockholderEquity: toNum(row.totalStockholderEquity),
      cash: toNum(row.cash || row.cashAndShortTermInvestments),
      totalDebt: toNum(row.shortLongTermDebt || row.totalDebt),
      goodwill: toNum(row.goodWill || row.goodwill),
      intangibleAssets: toNum(row.intangibleAssets),
      netReceivables: toNum(row.netReceivables),
      inventory: toNum(row.inventory),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Cash Flow (annual, last 5 years) ---
  const cashflowAnnual = p.Financials?.Cash_Flow?.yearly || {};
  const financials_cashflow = Object.entries(cashflowAnnual)
    .slice(0, 10)
    .map(([date, row]) => ({
      date: String(date).slice(0, 10),
      operatingCashflow: toNum(row.totalCashFromOperatingActivities),
      capitalExpenditures: toNum(row.capitalExpenditures),
      freeCashFlow: toNum(row.freeCashFlow),
      dividendsPaid: toNum(row.dividendsPaid),
      netBorrowings: toNum(row.netBorrowings),
      salePurchaseOfStock: toNum(row.salePurchaseOfStock),
      issuanceOfStock: toNum(row.issuanceOfStock),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Shares/Outstanding History ---
  const sharesHistory = p.outstandingShares?.annual || [];
  const shares = (Array.isArray(sharesHistory) ? sharesHistory : [])
    .map((row) => ({
      date: String(row?.date || row?.dateFormatted || '').slice(0, 10) || null,
      shares: toNum(row?.shares || row?.sharesMln),
    }))
    .filter((r) => r.date && r.shares !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Dividends ---
  const dividendsRaw = p.SplitsDividends?.NumberDividendsByYear || {};
  const dividends = typeof dividendsRaw === 'object' && !Array.isArray(dividendsRaw)
    ? Object.entries(dividendsRaw).map(([year, obj]) => ({
        year: String(obj?.Year || year),
        count: toNum(obj?.Count),
      })).filter((r) => r.year)
    : [];

  // --- General info ---
  const gen = p.General || {};
  const general = {
    name: gen.Name || null,
    sector: gen.Sector || null,
    industry: gen.Industry || null,
    country: gen.CountryName || gen.Country || null,
    exchange: gen.Exchange || ex,
    currency: gen.CurrencyCode || null,
    isin: gen.ISIN || null,
    cusip: gen.CUSIP || null,
    ipo_date: gen.IPODate || null,
    fiscal_year_end: gen.FiscalYearEnd || null,
    employees: toNum(gen.FullTimeEmployees),
  };

  return {
    symbol: s,
    exchange: ex,
    attempts: Number(result?.attempts || 1),
    data: {
      general,
      highlights,
      financials_income,
      financials_balance,
      financials_cashflow,
      shares,
      dividends,
    }
  };
}
