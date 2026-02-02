import { getBarNode } from '../../_ops/shape.js';

function buildTraceBase(requestUrl, ticker, payload, status, error) {
  const url = new URL(requestUrl);
  const path = `/api/stock?ticker=${encodeURIComponent(ticker)}`;
  const bar = getBarNode(payload) || {};
  const requiredFields = ['date', 'close', 'volume'];
  const missingFields = requiredFields.filter((key) => bar[key] == null);
  const typeErrors = [];
  if (bar.close != null && !Number.isFinite(Number(bar.close))) typeErrors.push('close');
  if (bar.volume != null && !Number.isFinite(Number(bar.volume))) typeErrors.push('volume');
  if (bar.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(bar.date))) typeErrors.push('date_format');

  return {
    trace_version: 'v1',
    generated_at: new Date().toISOString(),
    base_url: url.origin,
    ticker,
    page_url: new URL(`/analyze/${encodeURIComponent(ticker)}`, url.origin).toString(),
    ui: { values: null },
    network: {
      winning: {
        path,
        status,
        body_keys: payload ? Object.keys(payload) : [],
        contract: {
          checked_path: 'data.latest_bar',
          required_fields: requiredFields,
          missing_fields: missingFields
        },
        error: error || null
      },
      calls: []
    },
    server: {
      endpoint: path,
      handler_file: 'functions/api/stock.js'
    },
    upstream: null,
    error: error || null,
    winning_response: {
      path,
      status,
      error: error || null
    }
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const ticker = String(url.searchParams.get('ticker') || '').trim().toUpperCase();
  if (!ticker) {
    const trace = buildTraceBase(request.url, 'UNKNOWN', null, 400, { stage: 'input', message: 'ticker missing' });
    return new Response(JSON.stringify(trace, null, 2) + '\n', {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  const apiUrl = new URL('/api/stock', request.url);
  apiUrl.searchParams.set('ticker', ticker);
  let payload = null;
  let status = null;
  let error = null;
  try {
    const res = await fetch(apiUrl.toString(), { cache: 'no-store' });
    status = res.status;
    try {
      payload = await res.json();
    } catch (err) {
      error = { stage: 'parse', message: String(err?.message || err) };
    }
    if (!res.ok && !error) {
      error = { stage: 'http', message: `HTTP_${res.status}` };
    }
  } catch (err) {
    status = null;
    error = { stage: 'fetch', message: String(err?.message || err) };
  }

  const trace = buildTraceBase(request.url, ticker, payload, status, error);
  return new Response(JSON.stringify(trace, null, 2) + '\n', {
    status: status && status >= 400 ? 500 : 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
