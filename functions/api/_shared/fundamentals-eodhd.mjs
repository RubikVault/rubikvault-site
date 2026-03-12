function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchEodhdFundamentals(ticker, env) {
  const apiKey = env?.EODHD_API_KEY || env?.EODHD_API_TOKEN;
  if (!apiKey) {
    return {
      ok: false,
      provider: 'eodhd',
      key: { present: false, source: null },
      error: { code: 'MISSING_API_KEY', message: 'Missing EODHD API key' },
      data: null,
      httpStatus: null,
      latencyMs: null
    };
  }

  let querySymbol = String(ticker || '').trim().toUpperCase();
  const classShare = querySymbol.match(/^([A-Z0-9]+)\.([A-Z])$/);
  if (classShare) {
    querySymbol = `${classShare[1]}-${classShare[2]}.US`;
  } else if (!querySymbol.includes('.')) {
    querySymbol = `${querySymbol}.US`;
  }

  const url = new URL(`https://eodhd.com/api/fundamentals/${encodeURIComponent(querySymbol)}`);
  url.searchParams.set('api_token', apiKey);
  url.searchParams.set('fmt', 'json');

  const controller = new AbortController();
  const timeoutMs = 8000;
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });

    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const code = res.status === 403 ? 'AUTH_FAILED' : res.status === 404 ? 'INVALID_TICKER' : 'HTTP_ERROR';
      return {
        ok: false,
        provider: 'eodhd',
        key: { present: true, source: 'env' },
        error: { code, message: `HTTP ${res.status}` },
        data: null,
        httpStatus: res.status,
        latencyMs
      };
    }

    const p = await res.json();
    if (!p || typeof p !== 'object') {
      return {
        ok: false,
        provider: 'eodhd',
        key: { present: true, source: 'env' },
        error: { code: 'BAD_PAYLOAD', message: 'EODHD fundamentals payload invalid' },
        data: null,
        httpStatus: res.status,
        latencyMs
      };
    }

    const hl = p.Highlights || {};
    const gen = p.General || {};

    const data = {
      ticker,
      companyName: gen.Name || gen.LegalName || null,
      marketCap: toNumber(hl.MarketCapitalization),
      pe_ttm: toNumber(hl.PERatio),
      ps_ttm: toNumber(hl.PriceToSalesRatioTTM),
      pb: toNumber(hl.PriceToBookRatio),
      ev_ebitda: toNumber(hl.EnterpriseValueEbitda),
      revenue_ttm: toNumber(hl.RevenueTTM),
      grossMargin: null,
      operatingMargin: toNumber(hl.OperatingMarginTTM),
      netMargin: toNumber(hl.ProfitMargin),
      eps_ttm: toNumber(hl.EarningsShare),
      nextEarningsDate: null,
      updatedAt: gen.UpdatedAt || null,
      // Extra EODHD fields
      sector: gen.Sector || null,
      industry: gen.Industry || null,
      exchange: gen.Exchange || null,
      country: gen.CountryName || gen.Country || null,
      description: gen.Description || null,
      dividendYield: toNumber(hl.DividendYield),
      dividendShare: toNumber(hl.DividendShare),
      beta: toNumber(hl.Beta),
      sharesOutstanding: toNumber(hl.SharesOutstanding),
      sharesFloat: toNumber(hl.SharesFloat),
      forwardPE: toNumber(hl.ForwardPE),
      pegRatio: toNumber(hl.PEGRatio),
      wallStreetTarget: toNumber(hl.WallStreetTargetPrice),
      bookValue: toNumber(hl.BookValue),
      ebitda: toNumber(hl.EBITDA),
      returnOnEquity: toNumber(hl.ReturnOnEquityTTM),
      returnOnAssets: toNumber(hl.ReturnOnAssetsTTM),
      quarterlyEarningsGrowthYOY: toNumber(hl.QuarterlyEarningsGrowthYOY),
      quarterlyRevenueGrowthYOY: toNumber(hl.QuarterlyRevenueGrowthYOY),
      grossProfitTTM: toNumber(hl.GrossProfitTTM),
      revenuePerShare: toNumber(hl.RevenuePerShareTTM)
    };

    return {
      ok: true,
      provider: 'eodhd',
      key: { present: true, source: 'env' },
      error: null,
      data,
      httpStatus: res.status,
      latencyMs
    };
  } catch (error) {
    const msg = String(error?.message || 'network_error');
    const latencyMs = Date.now() - started;
    const lower = msg.toLowerCase();
    const code = lower.includes('abort') || lower.includes('timeout') ? 'TIMEOUT' : 'NETWORK_ERROR';
    return {
      ok: false,
      provider: 'eodhd',
      key: { present: true, source: 'env' },
      error: { code, message: msg },
      data: null,
      httpStatus: null,
      latencyMs
    };
  } finally {
    clearTimeout(timer);
  }
}
