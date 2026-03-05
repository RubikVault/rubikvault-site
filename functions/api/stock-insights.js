// Server-side ticker-specific insight extraction.
// Instead of the client downloading 210MB of JSON files, this endpoint
// extracts just the data for a single ticker and returns ~2KB.

let _sciCache = null;
let _sciTime = 0;
let _fcCache = null;
let _fcTime = 0;
const TTL = 600_000; // 10 min cache

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

  // Use ASSETS binding to read static files directly (avoids Wrangler
  // single-thread deadlock when the worker fetch()es its own origin).
  const assetFetcher = context.env?.ASSETS;
  const origin = url.origin;

  async function fetchJson(path) {
    try {
      let res;
      if (assetFetcher) {
        // Cloudflare Pages / Wrangler — read asset without HTTP loopback
        res = await assetFetcher.fetch(new URL(path, origin).toString());
      } else {
        // Fallback (e.g. plain Node tests)
        res = await fetch(new URL(path, origin).toString());
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const now = Date.now();
  const result = { ticker, scientific: null, forecast: null, forecast_meta: null, elliott: null };

  // Run all three fetches in parallel — each is independent
  const [sciResult, fcResult, ewResult] = await Promise.allSettled([
    // Scientific — large dict keyed by ticker (cached for 10 min)
    (async () => {
      if (!_sciCache || now - _sciTime > TTL) {
        _sciCache = await fetchJson("/data/snapshots/stock-analysis.json");
        _sciTime = now;
      }
      return _sciCache;
    })(),
    // Forecast — large array (cached for 10 min)
    (async () => {
      if (!_fcCache || now - _fcTime > TTL) {
        _fcCache = await fetchJson("/data/forecast/latest.json");
        _fcTime = now;
      }
      return _fcCache;
    })(),
    // Elliott — per-ticker file (small, ~2KB, no caching needed)
    fetchJson(`/data/marketphase/${ticker}.json`),
  ]);

  // Extract scientific
  try {
    const sciData = sciResult.status === "fulfilled" ? sciResult.value : null;
    if (sciData) {
      result.scientific = sciData[ticker] || sciData[ticker.toUpperCase()] || null;
    }
  } catch { /* ignore */ }

  // Extract forecast
  try {
    const fcData = fcResult.status === "fulfilled" ? fcResult.value : null;
    if (fcData) {
      const forecasts = fcData?.data?.forecasts || [];
      result.forecast = Array.isArray(forecasts)
        ? forecasts.find((f) => f.symbol === ticker) || null
        : null;
      if (result.forecast) {
        result.forecast_meta = {
          accuracy: fcData?.accuracy || null,
          champion_id: fcData?.champion_id || null,
          freshness: fcData?.freshness || null,
        };
      }
    }
  } catch { /* ignore */ }

  // Extract Elliott from per-ticker marketphase file
  try {
    const mpDoc = ewResult.status === "fulfilled" ? ewResult.value : null;
    if (mpDoc?.ok && mpDoc?.data?.elliott) {
      result.elliott = mpDoc.data.elliott;
      result.elliott._meta = {
        symbol: ticker,
        generatedAt: mpDoc?.meta?.generatedAt || null,
        version: mpDoc?.meta?.version || null,
      };
    }
  } catch { /* ignore */ }

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
