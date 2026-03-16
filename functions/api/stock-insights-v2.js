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

function classifyElliottPayload(doc) {
  const version = String(doc?.meta?.version || "").trim().toLowerCase();
  const source = String(doc?.meta?.source || "").trim().toLowerCase();
  const bridgeFlag = doc?.data?.debug?.bridge === true;
  let isBridge = bridgeFlag || version.startsWith("rv_marketphase_bridge_") || source === "marketphase_deep_summary";
  // Promote high-quality bridge payloads (>=200 bars + all 4 core features)
  if (isBridge) {
    const barsCount = Number(doc?.data?.debug?.bars_count || 0);
    const f = doc?.data?.features || {};
    const hasCoreFeatures = Number.isFinite(Number(f.RSI)) && Number.isFinite(Number(f.MACDHist))
      && Number.isFinite(Number(f.SMA50)) && Number.isFinite(Number(f.SMA200));
    if (barsCount >= 200 && hasCoreFeatures) {
      return { isBridge: false, sourceKind: "bridge_promoted" };
    }
  }
  return {
    isBridge,
    sourceKind: isBridge ? "bridge" : "deep",
  };
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

  const [metaResult, shardResult, ewResult] = await Promise.allSettled([
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
    (async () => {
      const doc = await fetchJson(`/data/marketphase/${ticker}.json`);
      if (doc) return doc;
      if (ticker.includes(".")) return fetchJson(`/data/marketphase/${tickerBase}.json`);
      return null;
    })(),
  ]);

  const metaDoc = metaResult.status === "fulfilled" ? metaResult.value : null;
  const shardDoc = shardResult.status === "fulfilled" ? shardResult.value : null;
  const mpDoc = ewResult.status === "fulfilled" ? ewResult.value : null;

  const shardRow = shardDoc?.rows?.[ticker] || shardDoc?.rows?.[tickerBase] || null;

  // We no longer fetch monolithic snapshots; data is in shardRow
  const scientific = shardRow?.scientific?.value || null;
  const scientificReason = shardRow?.scientific?.reason || (shardDoc ? "NO_RECOMMENDATION" : "MISSING_SCIENTIFIC_ENTRY");

  const forecast = shardRow?.forecast?.value || null;
  const forecastMeta = forecast ? {
    as_of: shardRow?.forecast?.as_of,
    source: shardRow?.forecast?.source
  } : null;

  let elliott = null;
  let elliottReason = shardRow?.elliott?.reason || "MISSING_ELLIOTT_ENTRY";
  const elliottPayload = classifyElliottPayload(mpDoc);

  if (mpDoc?.ok && mpDoc?.data?.elliott) {
    elliott = {
      ...mpDoc.data.elliott,
      fib: mpDoc?.data?.fib || null,
      features: mpDoc?.data?.features || null,
      debug: mpDoc?.data?.debug || null,
    };
    elliott._meta = {
      symbol: ticker,
      resolved_symbol: mpDoc?.meta?.symbol || tickerBase || ticker,
      generatedAt: mpDoc?.meta?.generatedAt || null,
      version: mpDoc?.meta?.version || null,
      source: mpDoc?.meta?.source || null,
      source_kind: elliottPayload.sourceKind,
      bridge: elliottPayload.isBridge,
      canonical_id: mpDoc?.data?.debug?.canonical_id || null,
    };
    elliottReason = elliottPayload.isBridge ? "BRIDGE_PAYLOAD" : "";
  } else if (mpDoc?.reason) {
    elliottReason = String(mpDoc.reason);
  }

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

  const elliottState = makeState(elliott, {
    as_of: pickAsOf(
      shardRow?.elliott?.as_of,
      mpDoc?.meta?.generatedAt,
      mpDoc?.meta?.as_of
    ),
    source: shardRow?.elliott?.source || (elliottPayload.isBridge ? "marketphase.bridge" : "marketphase.per_ticker"),
    status: shardRow?.elliott?.status || (elliott ? (elliottPayload.isBridge ? "proxy" : "ok") : "unavailable"),
    reason: elliottReason,
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
