// Additive v2 insights endpoint (shadow path).
// Non-breaking by design: existing /api/stock-insights stays canonical.

let _metaCache = null;
let _metaTime = 0;
const _shardCache = new Map();
const TTL = 600_000; // 10 min cache

function pickAsOf(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return null;
}

function shardKeyForTicker(ticker) {
  const first = String(ticker || "").charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(first) ? first : "_";
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
  const tickerBase = ticker.includes(".") ? ticker.split(".")[0] : ticker;
  const sKey = shardKeyForTicker(tickerBase);
  const shardPath = `/data/features-v2/stock-insights/shards/${sKey}.json`;
  const metaPath = "/data/features-v2/stock-insights/index.json";

  const [metaResult, shardResult] = await Promise.allSettled([
    (async () => {
      if (!_metaCache || now - _metaTime > TTL) {
        _metaCache = await fetchJson(metaPath);
        _metaTime = now;
      }
      return _metaCache;
    })(),
    (async () => {
      const cached = _shardCache.get(sKey);
      if (cached && (now - cached.time < TTL)) return cached.data;
      const data = await fetchJson(shardPath);
      if (data) _shardCache.set(sKey, { data, time: now });
      return data;
    })(),
  ]);

  const metaDoc = metaResult.status === "fulfilled" ? metaResult.value : null;
  const shardDoc = shardResult.status === "fulfilled" ? shardResult.value : null;

  const shardRow = shardDoc?.rows?.[ticker] || shardDoc?.rows?.[tickerBase] || null;

  // We no longer fetch monolithic snapshots; data is in shardRow
  const scientific = shardRow?.scientific?.value || null;
  const scientificReason = shardRow?.scientific?.reason || (shardDoc ? "NO_RECOMMENDATION" : "MISSING_SCIENTIFIC_ENTRY");

  const forecast = shardRow?.forecast?.value || null;
  const forecastMeta = forecast ? {
    as_of: shardRow?.forecast?.as_of,
    source: shardRow?.forecast?.source
  } : null;

  const scientificState = makeState(scientific, {
    as_of: shardRow?.scientific?.as_of,
    source: shardRow?.scientific?.source || "stock-analysis.snapshot",
    status: shardRow?.scientific?.status || (scientific ? "ok" : "unavailable"),
    reason: scientificReason === "MISSING_SCIENTIFIC_ENTRY" && shardDoc ? "NO_RECOMMENDATION" : scientificReason,
  });
  const forecastState = makeState(forecast, {
    as_of: shardRow?.forecast?.as_of,
    source: shardRow?.forecast?.source || "forecast.latest",
    status: shardRow?.forecast?.status || (forecast ? "ok" : "unavailable"),
    reason: shardRow?.forecast?.reason || (forecast ? "" : (shardDoc ? "NO_RECOMMENDATION" : "MISSING_FORECAST_ENTRY")),
  });

  const elliottState = makeState(null, {
    as_of: null,
    source: "elliott.removed",
    status: "removed",
    reason: "ELLIOTT_REMOVED",
  });

  const v2Contract = {
    scientific: scientificState,
    forecast: forecastState,
    elliott: elliottState,
  };

  const result = {
    ticker,
    schema_version: "rv.stock-insights.v2.sharded",
    generated_at: new Date().toISOString(),
    status: summarizeStatus(v2Contract),
    scientific: scientificState.value,
    forecast: forecastState.value,
    forecast_meta: forecastMeta,
    elliott: elliottState.value,
    feature_states: v2Contract,
    v2_contract: v2Contract,
    _shard_info: {
      shard: sKey,
      path: shardPath,
      meta_generated_at: metaDoc?.generated_at
    }
  };

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
