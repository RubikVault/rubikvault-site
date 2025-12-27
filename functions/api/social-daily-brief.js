import {
  assertBindings,
  createTraceId,
  kvGetJson,
  logServer,
  makeResponse
} from "./_shared.js";

const FEATURE_ID = "social-daily-brief";

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function clampText(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function extractIndex(indices, labelMatch, symbolMatch) {
  const list = Array.isArray(indices) ? indices : [];
  return (
    list.find((item) => item.label === labelMatch) ||
    list.find((item) => item.symbol === symbolMatch) ||
    null
  );
}

function extractYield(series, id) {
  const list = Array.isArray(series) ? series : [];
  return list.find((item) => item.seriesId === id) || null;
}

export async function buildBrief(env) {
  const market = await kvGetJson(env, "market_health:last_ok");
  const macro = await kvGetJson(env, "macro-rates:v2");

  const marketData = market?.value?.data || null;
  const macroData = macro?.value?.data || null;
  const indices = marketData?.indices || [];
  const crypto = marketData?.crypto || [];
  const fngStocks = marketData?.fngStocks?.value ?? null;
  const fngCrypto = marketData?.fng?.value ?? null;
  const spx = extractIndex(indices, "S&P 500", "^GSPC");
  const btc = crypto.find((item) => item.symbol === "BTC") || null;
  const us10y = extractYield(macroData?.series, "DGS10");

  const segments = [];
  if (Number.isFinite(fngStocks)) segments.push(`Stocks F&G ${Math.round(fngStocks)}`);
  if (Number.isFinite(fngCrypto)) segments.push(`Crypto F&G ${Math.round(fngCrypto)}`);
  if (Number.isFinite(spx?.changePercent)) {
    segments.push(`S&P 500 ${spx.changePercent.toFixed(2)}%`);
  }
  if (Number.isFinite(btc?.price)) segments.push(`BTC $${btc.price.toFixed(0)}`);
  if (Number.isFinite(us10y?.value)) segments.push(`US10Y ${us10y.value.toFixed(2)}%`);

  const date = new Date().toISOString().slice(0, 10);
  const base = `RubikVault Brief ${date}`;
  const short = clampText(`${base} • ${segments.join(" | ")}`, 280);
  const medium = clampText(
    `${base} UTC\n${segments.join(" | ")}\nSources: market-health + macro-rates KV`,
    600
  );
  const idempotencyKey = hashString(`${date}|${segments.join("|")}`);
  const metrics = {
    fngStocks,
    fngCrypto,
    spxChange: spx?.changePercent ?? null,
    btcPrice: btc?.price ?? null,
    us10y: us10y?.value ?? null
  };

  const hasMetrics = Object.values(metrics).some((value) => Number.isFinite(value));
  return {
    ok: hasMetrics,
    data: {
      updatedAt: new Date().toISOString(),
      text_short: short,
      text_medium: medium,
      idempotencyKey,
      metrics
    },
    error: hasMetrics
      ? {}
      : {
          code: "SCHEMA_INVALID",
          message: "No metrics available",
          details: { missing: ["market-health:last_ok", "macro-rates:v2"] }
        }
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    return bindingResponse;
  }

  const brief = await buildBrief(env);
  const response = makeResponse({
    ok: brief.ok,
    feature: FEATURE_ID,
    traceId,
    data: brief.ok ? brief.data : {},
    cache: { hit: true, ttl: 0, layer: "kv" },
    upstream: { url: "kv:last_ok", status: null, snippet: "" },
    error: brief.error || {}
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
