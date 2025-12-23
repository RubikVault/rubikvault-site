import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "market-health";
const KV_TTL = 420;
const FNG_URL = "https://api.alternative.me/fng/?limit=1&format=json";
const BTC_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function normalize(fngPayload, btcPayload) {
  const fngItem = Array.isArray(fngPayload?.data) ? fngPayload.data[0] : null;
  const btcData = btcPayload?.bitcoin || {};

  return {
    updatedAt: new Date().toISOString(),
    source: "alternative.me, coingecko",
    fng: fngItem
      ? {
          value: Number(fngItem.value),
          valueClassification: fngItem.value_classification || fngItem.valueClassification || null
        }
      : null,
    btc: {
      usd: btcData.usd ?? null,
      usd_24h_change: btcData.usd_24h_change ?? null
    }
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
    return bindingResponse;
  }

  const cacheKey = `${FEATURE_ID}:v1`;

  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
    if (cached?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: `${FNG_URL} | ${BTC_URL}`, status: null, snippet: "" }
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        kv: "hit",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return response;
    }
  }

  let fngStatus = null;
  let btcStatus = null;
  let upstreamSnippet = "";

  try {
    const [fngRes, btcRes] = await Promise.all([fetch(FNG_URL), fetch(BTC_URL)]);
    fngStatus = fngRes.status;
    btcStatus = btcRes.status;
    const fngText = await fngRes.text();
    const btcText = await btcRes.text();
    upstreamSnippet = safeSnippet(!fngRes.ok ? fngText : btcText);

    if (!fngRes.ok || !btcRes.ok) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const failingStatus = fngRes.ok ? btcStatus : fngStatus;
      const errorCode = mapUpstreamCode(failingStatus);
      if (cached?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: {
            url: `${FNG_URL} | ${BTC_URL}`,
            status: failingStatus,
            snippet: upstreamSnippet
          },
          error: {
            code: errorCode,
            message: "Upstream error",
            details: { fngStatus, btcStatus }
          },
          isStale: true
        });
        logServer({
          feature: FEATURE_ID,
          traceId,
          kv: "hit",
          upstreamStatus: failingStatus,
          durationMs: Date.now() - started
        });
        return response;
      }

      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
        upstream: {
          url: `${FNG_URL} | ${BTC_URL}`,
          status: failingStatus,
          snippet: upstreamSnippet
        },
        error: {
          code: errorCode,
          message: "Upstream error",
          details: { fngStatus, btcStatus }
        },
        status: failingStatus === 429 ? 429 : 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        kv: panic ? "bypass" : "miss",
        upstreamStatus: failingStatus,
        durationMs: Date.now() - started
      });
      return response;
    }

    let fngJson;
    let btcJson;
    try {
      fngJson = fngText ? JSON.parse(fngText) : {};
      btcJson = btcText ? JSON.parse(btcText) : {};
    } catch (error) {
      return makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
        upstream: {
          url: `${FNG_URL} | ${BTC_URL}`,
          status: 200,
          snippet: safeSnippet(`${fngText}${btcText}`)
        },
        error: { code: "SCHEMA_INVALID", message: "Invalid JSON", details: {} },
        status: 502
      });
    }

    const dataPayload = normalize(fngJson, btcJson);
    const kvPayload = {
      ts: new Date().toISOString(),
      source: dataPayload.source,
      schemaVersion: 1,
      data: dataPayload
    };

    if (!panic) {
      await kvPutJson(env, cacheKey, kvPayload, KV_TTL);
    }

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: dataPayload,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: {
        url: `${FNG_URL} | ${BTC_URL}`,
        status: 200,
        snippet: safeSnippet(`${fngText}${btcText}`)
      }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      kv: panic ? "bypass" : "miss",
      upstreamStatus: 200,
      durationMs: Date.now() - started
    });
    return response;
  } catch (error) {
    const errorCode = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX";
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: {
        url: `${FNG_URL} | ${BTC_URL}`,
        status: fngStatus || btcStatus,
        snippet: upstreamSnippet
      },
      error: {
        code: errorCode,
        message: error?.message || "Request failed",
        details: { fngStatus, btcStatus }
      }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      kv: panic ? "bypass" : "miss",
      upstreamStatus: fngStatus || btcStatus,
      durationMs: Date.now() - started
    });
    return response;
  }
}
