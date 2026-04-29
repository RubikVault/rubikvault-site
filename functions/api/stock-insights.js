import { readPageCoreForTicker } from './_shared/page-core-reader.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.\-]{1,15}$/.test(ticker)) {
    return new Response(JSON.stringify({ error: "missing or invalid ticker" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pageCore = await readPageCoreForTicker(ticker, { request, env });
  const result = {
    ticker,
    page_core: pageCore.ok ? pageCore.pageCore : null,
    scientific: null,
    forecast: null,
    forecast_meta: null,
    error: pageCore.ok ? null : { code: pageCore.code, message: pageCore.message },
  };

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
