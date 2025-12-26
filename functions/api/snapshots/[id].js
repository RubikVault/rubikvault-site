import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse
} from "../_shared.js";

const FEATURE_ID = "snapshots";
const KV_TTL = 6 * 60 * 60;

function baseSnapshot({ id, updatedAt, cadence }) {
  return {
    id,
    version: 1,
    updated_utc: updatedAt || new Date().toISOString(),
    cadence: cadence || "daily",
    provenance: [],
    kpis: [],
    series: [],
    tables: [],
    method: "",
    freshness_ok: true,
    errors: []
  };
}

function scoreColor(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  if (value >= 60) return "green";
  if (value >= 40) return "yellow";
  return "red";
}

function buildMarketHealthSnapshot(source) {
  const data = source?.data || null;
  const snapshot = baseSnapshot({
    id: "market_health",
    updatedAt: data?.updatedAt || source?.ts,
    cadence: "hourly"
  });
  snapshot.method = "Derived from /api/market-health KV cache.";
  snapshot.provenance.push({
    source: data?.source || source?.source || "market-health",
    notes: "Cache-derived snapshot"
  });

  if (!data) {
    snapshot.freshness_ok = false;
    snapshot.errors.push("source_cache_missing");
    return snapshot;
  }

  const fngStocks = data.fngStocks;
  const fngCrypto = data.fng;
  if (fngStocks?.value !== null && fngStocks?.value !== undefined) {
    snapshot.kpis.push({
      label: "Fear & Greed (Stocks)",
      value: fngStocks.value,
      unit: "",
      color: scoreColor(fngStocks.value)
    });
  }
  if (fngCrypto?.value !== null && fngCrypto?.value !== undefined) {
    snapshot.kpis.push({
      label: "Fear & Greed (Crypto)",
      value: fngCrypto.value,
      unit: "",
      color: scoreColor(fngCrypto.value)
    });
  }

  const indices = Array.isArray(data.indices) ? data.indices : [];
  if (indices.length) {
    snapshot.tables.push({
      name: "indices",
      columns: ["label", "price", "changePercent", "source"],
      rows: indices.map((entry) => ({
        label: entry.label || entry.symbol,
        price: entry.price ?? null,
        changePercent: entry.changePercent ?? null,
        source: entry.source || "unknown"
      }))
    });
  }

  const commodities = Array.isArray(data.commodities) ? data.commodities : [];
  if (commodities.length) {
    snapshot.tables.push({
      name: "commodities",
      columns: ["label", "price", "changePercent", "source"],
      rows: commodities.map((entry) => ({
        label: entry.label || entry.symbol,
        price: entry.price ?? null,
        changePercent: entry.changePercent ?? null,
        source: entry.source || "unknown"
      }))
    });
  }

  return snapshot;
}

function buildMacroRatesSnapshot(source) {
  const data = source?.data || null;
  const snapshot = baseSnapshot({
    id: "macro_rates",
    updatedAt: data?.updatedAt || source?.ts,
    cadence: "daily"
  });
  snapshot.method = "Derived from /api/macro-rates KV cache.";
  snapshot.provenance.push({
    source: data?.source || source?.source || "macro-rates",
    notes: "Cache-derived snapshot"
  });

  if (!data) {
    snapshot.freshness_ok = false;
    snapshot.errors.push("source_cache_missing");
    return snapshot;
  }

  const series = Array.isArray(data.series) ? data.series : [];
  const findSeries = (id) => series.find((entry) => entry.seriesId === id);
  const fedFunds = findSeries("FEDFUNDS");
  const us10y = findSeries("DGS10");
  const usCpi = findSeries("CPIAUCSL");

  if (fedFunds) {
    snapshot.kpis.push({
      label: "Fed Funds",
      value: fedFunds.value ?? null,
      unit: "%",
      color: "neutral"
    });
  }
  if (us10y) {
    snapshot.kpis.push({
      label: "US 10Y",
      value: us10y.value ?? null,
      unit: "%",
      color: "neutral"
    });
  }
  if (usCpi) {
    snapshot.kpis.push({
      label: "US CPI",
      value: usCpi.value ?? null,
      unit: "",
      color: "neutral"
    });
  }

  const fx = Array.isArray(data.groups?.fx) ? data.groups.fx : [];
  if (fx.length) {
    snapshot.tables.push({
      name: "fx",
      columns: ["label", "value", "changePercent", "source"],
      rows: fx.map((entry) => ({
        label: entry.label || entry.seriesId,
        value: entry.value ?? null,
        changePercent: entry.changePercent ?? null,
        source: entry.source || "unknown"
      }))
    });
  }

  return snapshot;
}

const SNAPSHOT_BUILDERS = {
  market_health: {
    sourceKey: "market-health:v1",
    build: buildMarketHealthSnapshot
  },
  macro_rates: {
    sourceKey: "macro-rates:v2",
    build: buildMacroRatesSnapshot
  }
};

export async function onRequestGet({ request, env, data, params }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const snapshotId = params?.id ? String(params.id) : "";

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    return bindingResponse;
  }

  if (!snapshotId) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "BAD_REQUEST",
        message: "Snapshot id missing",
        details: { supported: Object.keys(SNAPSHOT_BUILDERS) }
      },
      status: 400
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const snapshotKey = `snapshot:${snapshotId}`;
  const cached = await kvGetJson(env, snapshotKey);
  if (cached?.hit && cached.value?.data) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: cached.value.data,
      cache: { hit: true, ttl: KV_TTL, layer: "kv" },
      upstream: { url: snapshotKey, status: null, snippet: "" }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "kv",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const builder = SNAPSHOT_BUILDERS[snapshotId];
  if (!builder) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "BAD_REQUEST",
        message: "Snapshot not supported",
        details: { supported: Object.keys(SNAPSHOT_BUILDERS) }
      },
      status: 400
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const source = await kvGetJson(env, builder.sourceKey);
  const snapshot = builder.build(source.value);
  const kvPayload = {
    ts: new Date().toISOString(),
    source: builder.sourceKey,
    schemaVersion: 1,
    data: snapshot
  };
  await kvPutJson(env, snapshotKey, kvPayload, KV_TTL);

  const errorPayload = snapshot.freshness_ok
    ? {}
    : {
        code: "SOURCE_MISSING",
        message: "Snapshot source unavailable",
        details: { sourceKey: builder.sourceKey }
      };

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: snapshot,
    cache: { hit: false, ttl: KV_TTL, layer: "none" },
    upstream: { url: builder.sourceKey, status: source?.hit ? 200 : null, snippet: "" },
    error: errorPayload
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: source?.hit ? 200 : null,
    durationMs: Date.now() - started
  });
  return response;
}
