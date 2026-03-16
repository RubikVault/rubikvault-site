// Additive v4 insights endpoint (shadow path).
// Non-breaking: existing /api/stock-insights and /api/stock-insights-v2 stay canonical.

import { buildStockInsightsV4Evaluation, makeContractState, REASON_CODES } from "./_shared/stock-insights-v4.js";

let _v2IndexCache = null;
let _v2IndexTs = 0;
const TTL = 600_000; // 10 minutes

function pickAsOf(...values) {
  for (const value of values) {
    const s = String(value || "").trim();
    if (s) return s;
  }
  return null;
}

function summarizeStatus(states) {
  const vals = Object.values(states || {});
  if (!vals.length) return "unavailable";
  if (vals.some((s) => s?.status === "blocked" || s?.status === "suppressed")) return "blocked";
  if (vals.every((s) => s?.status === "ok")) return "ok";
  if (vals.some((s) => s?.status === "stale")) return "stale";
  if (vals.some((s) => s?.status === "unavailable")) return "partial";
  return "partial";
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.\-]{1,15}$/.test(ticker)) {
    return new Response(JSON.stringify({ error: "missing or invalid ticker" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = url.origin;
  const assetFetcher = context.env?.ASSETS;

  async function fetchJson(path) {
    try {
      let res;
      if (assetFetcher && path.startsWith("/data/")) {
        // Static assets can be fetched via ASSETS without loopback.
        res = await assetFetcher.fetch(new URL(path, origin).toString());
      } else {
        res = await fetch(new URL(path, origin).toString());
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const now = Date.now();
  if (!_v2IndexCache || now - _v2IndexTs > TTL) {
    _v2IndexCache = await fetchJson("/data/features-v2/stock-insights/index.json");
    _v2IndexTs = now;
  }
  // Suffix-aware ticker lookup: MALLPLAZA.SN → try both MALLPLAZA.SN and MALLPLAZA
  const tickerBase = ticker.includes(".") ? ticker.split(".")[0] : ticker;
  const idxRow = _v2IndexCache?.rows?.[ticker] || _v2IndexCache?.rows?.[tickerBase] || null;

  // v2 endpoint already wraps scientific/forecast/elliott in a stable contract.
  const [v2Doc, stockDoc] = await Promise.all([
    fetchJson(`/api/stock-insights-v2?ticker=${encodeURIComponent(ticker)}`),
    fetchJson(`/api/stock?ticker=${encodeURIComponent(ticker)}&eval_v4=1`),
  ]);

  const scientificState = makeContractState(v2Doc?.scientific || null, {
    as_of: pickAsOf(idxRow?.scientific?.as_of, v2Doc?.v2_contract?.scientific?.as_of),
    source: idxRow?.scientific?.source || v2Doc?.v2_contract?.scientific?.source || "stock-analysis.snapshot",
    status: idxRow?.scientific?.status || v2Doc?.v2_contract?.scientific?.status || (v2Doc?.scientific ? "ok" : "unavailable"),
    reason: idxRow?.scientific?.reason || v2Doc?.v2_contract?.scientific?.reason || (v2Doc?.scientific ? REASON_CODES.OK : REASON_CODES.MISSING_SCIENTIFIC_ENTRY),
  });
  const forecastState = makeContractState(v2Doc?.forecast || null, {
    as_of: pickAsOf(idxRow?.forecast?.as_of, v2Doc?.v2_contract?.forecast?.as_of),
    source: idxRow?.forecast?.source || v2Doc?.v2_contract?.forecast?.source || "forecast.latest",
    status: idxRow?.forecast?.status || v2Doc?.v2_contract?.forecast?.status || (v2Doc?.forecast ? "ok" : "unavailable"),
    reason: idxRow?.forecast?.reason || v2Doc?.v2_contract?.forecast?.reason || (v2Doc?.forecast ? REASON_CODES.OK : REASON_CODES.MISSING_FORECAST_ENTRY),
  });
  const elliottState = makeContractState(v2Doc?.elliott || null, {
    as_of: pickAsOf(idxRow?.elliott?.as_of, v2Doc?.v2_contract?.elliott?.as_of),
    source: idxRow?.elliott?.source || v2Doc?.v2_contract?.elliott?.source || "marketphase.per_ticker",
    status: idxRow?.elliott?.status || v2Doc?.v2_contract?.elliott?.status || (v2Doc?.elliott ? "ok" : "unavailable"),
    reason: idxRow?.elliott?.reason || v2Doc?.v2_contract?.elliott?.reason || (v2Doc?.elliott ? REASON_CODES.OK : REASON_CODES.MISSING_ELLIOTT_ENTRY),
  });

  const bars = Array.isArray(stockDoc?.data?.bars) ? stockDoc.data.bars : [];
  const stats = stockDoc?.data?.market_stats?.stats || {};
  const universe = stockDoc?.data?.universe || {};

  const evalDoc = buildStockInsightsV4Evaluation({
    ticker,
    bars,
    stats,
    universe,
    scientificState,
    forecastState,
    elliottState,
    forecastMeta: v2Doc?.forecast_meta || null,
  });

  const result = {
    ...evalDoc,
    source_paths: {
      v2: "/api/stock-insights-v2",
      stock: "/api/stock?eval_v4=1",
      v2_index: "/data/features-v2/stock-insights/index.json",
    },
    status: summarizeStatus(evalDoc.v4_contract),
  };

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
