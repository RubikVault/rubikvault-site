// Additive v2 insights endpoint (shadow path).
// Non-breaking by design: existing /api/stock-insights stays canonical.

let _sciCache = null;
let _sciTime = 0;
let _fcCache = null;
let _fcTime = 0;
let _idxCache = null;
let _idxTime = 0;
const TTL = 600_000; // 10 min cache

function pickAsOf(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return null;
}

function makeState(value, meta = {}) {
  const hasValue = value != null;
  const status = String(meta.status || (hasValue ? "ok" : "unavailable")).toLowerCase();
  const reason = String(meta.reason || (hasValue ? "" : "NO_DATA")).trim() || null;
  const asOf = pickAsOf(meta.as_of, meta.asOf, meta.timestamp);
  const source = String(meta.source || "unknown").trim() || "unknown";
  return {
    value: hasValue ? value : null,
    as_of: asOf,
    source,
    status,
    reason,
  };
}

function summarizeStatus(states) {
  const vals = Object.values(states || {});
  if (!vals.length) return "unavailable";
  if (vals.every((s) => s.status === "ok")) return "ok";
  if (vals.some((s) => s.status === "blocked")) return "blocked";
  if (vals.some((s) => s.status === "stale")) return "stale";
  if (vals.some((s) => s.status === "unavailable")) return "partial";
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

  const assetFetcher = context.env?.ASSETS;
  const origin = url.origin;

  async function fetchJson(path) {
    try {
      let res;
      if (assetFetcher) {
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
  const srcPaths = {
    scientific: "/data/snapshots/stock-analysis.json",
    forecast: "/data/forecast/latest.json",
    elliott: `/data/marketphase/${ticker}.json`,
    v2_index: "/data/features-v2/stock-insights/index.json",
  };

  const [sciResult, fcResult, ewResult, idxResult] = await Promise.allSettled([
    (async () => {
      if (!_sciCache || now - _sciTime > TTL) {
        _sciCache = await fetchJson(srcPaths.scientific);
        _sciTime = now;
      }
      return _sciCache;
    })(),
    (async () => {
      if (!_fcCache || now - _fcTime > TTL) {
        _fcCache = await fetchJson(srcPaths.forecast);
        _fcTime = now;
      }
      return _fcCache;
    })(),
    fetchJson(srcPaths.elliott),
    (async () => {
      if (!_idxCache || now - _idxTime > TTL) {
        _idxCache = await fetchJson(srcPaths.v2_index);
        _idxTime = now;
      }
      return _idxCache;
    })(),
  ]);

  const sciData = sciResult.status === "fulfilled" ? sciResult.value : null;
  const fcData = fcResult.status === "fulfilled" ? fcResult.value : null;
  const mpDoc = ewResult.status === "fulfilled" ? ewResult.value : null;
  const idxDoc = idxResult.status === "fulfilled" ? idxResult.value : null;
  const idxRow = idxDoc?.rows?.[ticker] || null;

  let scientific = null;
  let scientificReason = "MISSING_SCIENTIFIC_ENTRY";
  if (sciData) {
    const e = sciData[ticker] || sciData[ticker.toUpperCase()] || null;
    if (e && e.status !== "DATA_UNAVAILABLE") {
      scientific = e;
      scientificReason = "";
    } else if (e?.status === "DATA_UNAVAILABLE") {
      scientificReason = String(e.reason || "DATA_UNAVAILABLE");
    }
  }

  const forecasts = fcData?.data?.forecasts || [];
  const forecast = Array.isArray(forecasts)
    ? forecasts.find((f) => String(f.symbol || "").toUpperCase() === ticker) || null
    : null;
  const forecastMeta = forecast
    ? {
        accuracy: fcData?.accuracy || null,
        champion_id: fcData?.champion_id || null,
        freshness: fcData?.freshness || null,
      }
    : null;

  let elliott = null;
  let elliottReason = "MISSING_ELLIOTT_ENTRY";
  if (mpDoc?.ok && mpDoc?.data?.elliott) {
    elliott = mpDoc.data.elliott;
    elliott._meta = {
      symbol: ticker,
      generatedAt: mpDoc?.meta?.generatedAt || null,
      version: mpDoc?.meta?.version || null,
    };
    elliottReason = "";
  } else if (mpDoc?.reason) {
    elliottReason = String(mpDoc.reason);
  }

  const scientificState = makeState(scientific, {
    as_of: pickAsOf(
      idxRow?.scientific?.as_of,
      scientific?.metadata?.as_of,
      scientific?.metadata?.asOf,
      scientific?.metadata?.generated_at
    ),
    source: idxRow?.scientific?.source || "stock-analysis.snapshot",
    status: idxRow?.scientific?.status || (scientific ? "ok" : "unavailable"),
    reason: idxRow?.scientific?.reason || scientificReason,
  });

  const forecastState = makeState(forecast, {
    as_of: pickAsOf(
      idxRow?.forecast?.as_of,
      fcData?.freshness,
      fcData?.generated_at,
      fcData?.as_of
    ),
    source: idxRow?.forecast?.source || "forecast.latest",
    status: idxRow?.forecast?.status || (forecast ? "ok" : "unavailable"),
    reason: idxRow?.forecast?.reason || (forecast ? "" : "MISSING_FORECAST_ENTRY"),
  });

  const elliottState = makeState(elliott, {
    as_of: pickAsOf(
      idxRow?.elliott?.as_of,
      mpDoc?.meta?.generatedAt,
      mpDoc?.meta?.as_of
    ),
    source: idxRow?.elliott?.source || "marketphase.per_ticker",
    status: idxRow?.elliott?.status || (elliott ? "ok" : "unavailable"),
    reason: idxRow?.elliott?.reason || elliottReason,
  });

  const v2Contract = {
    scientific: scientificState,
    forecast: forecastState,
    elliott: elliottState,
  };

  const result = {
    ticker,
    schema_version: "rv.stock-insights.v2",
    generated_at: new Date().toISOString(),
    source_paths: srcPaths,
    status: summarizeStatus(v2Contract),
    // Backward-compatible payload fields:
    scientific: scientificState.value,
    forecast: forecastState.value,
    forecast_meta: forecastMeta,
    elliott: elliottState.value,
    // v2 contract fields:
    feature_states: v2Contract,
    v2_contract: v2Contract,
  };

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
