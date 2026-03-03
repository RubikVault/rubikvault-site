// Server-side ticker-specific insight extraction.
// Instead of the client downloading 210MB of JSON files, this endpoint
// extracts just the data for a single ticker and returns ~2KB.

let _sciCache = null;
let _sciTime = 0;
let _fcCache = null;
let _fcTime = 0;
let _ewCache = null;
let _ewTime = 0;
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

  const origin = url.origin;

  async function fetchJson(path) {
    try {
      const res = await fetch(new URL(path, origin).toString());
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const now = Date.now();
  const result = { ticker, scientific: null, forecast: null, forecast_meta: null, elliott: null };

  // Scientific — dict keyed by ticker
  try {
    if (!_sciCache || now - _sciTime > TTL) {
      _sciCache = await fetchJson("/data/snapshots/stock-analysis.json");
      _sciTime = now;
    }
    if (_sciCache) {
      result.scientific = _sciCache[ticker] || _sciCache[ticker.toUpperCase()] || null;
    }
  } catch { /* ignore */ }

  // Forecast — array of {symbol, horizons}
  try {
    if (!_fcCache || now - _fcTime > TTL) {
      _fcCache = await fetchJson("/data/forecast/latest.json");
      _fcTime = now;
    }
    if (_fcCache) {
      const forecasts = _fcCache?.data?.forecasts || [];
      result.forecast = Array.isArray(forecasts)
        ? forecasts.find((f) => f.symbol === ticker) || null
        : null;
      if (result.forecast) {
        result.forecast_meta = {
          accuracy: _fcCache?.accuracy || null,
          champion_id: _fcCache?.champion_id || null,
          freshness: _fcCache?.freshness || null,
        };
      }
    }
  } catch { /* ignore */ }

  // Elliott — items array
  try {
    if (!_ewCache || now - _ewTime > TTL) {
      _ewCache = await fetchJson("/data/universe/v7/read_models/marketphase_deep_summary.json");
      _ewTime = now;
    }
    if (_ewCache) {
      const items = Array.isArray(_ewCache?.items) ? _ewCache.items : [];
      result.elliott = items.find((i) => i.symbol === ticker || i.key_id === ticker) || null;
    }
  } catch { /* ignore */ }

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
