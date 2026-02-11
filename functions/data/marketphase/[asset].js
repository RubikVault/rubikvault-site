function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}

function looksLikeJsonContentType(contentType) {
  return String(contentType || "").toLowerCase().includes("application/json");
}

async function readStaticAssetJson(request, env, pathname) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") return null;
  try {
    const url = new URL(request.url);
    url.pathname = pathname;
    const res = await env.ASSETS.fetch(new Request(url.toString(), request));
    if (!res?.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    const trimmed = text.trimStart();
    const isJson = looksLikeJsonContentType(contentType) || trimmed.startsWith("{") || trimmed.startsWith("[");
    if (!isJson) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function universeCount(request, env) {
  const universe = await readStaticAssetJson(request, env, "/data/universe/all.json");
  return Array.isArray(universe) ? universe.length : null;
}

function runtimeMeta(env, asOf) {
  const commit = String(env?.CF_PAGES_COMMIT_SHA || env?.GITHUB_SHA || "").trim() || null;
  const shortCommit = commit ? commit.slice(0, 8) : "unknown";
  const stamp = String(asOf).replace(/[-:]/g, "").slice(0, 13);
  const seq = String(env?.GITHUB_RUN_NUMBER || "runtime");
  return {
    build_id: `${shortCommit}-${stamp}-${seq}`,
    commit
  };
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const asOf = new Date().toISOString();
  const meta = runtimeMeta(env, asOf);
  const rawAsset = String(params?.asset || "");

  if (!rawAsset.endsWith(".json")) {
    return jsonResponse({
      ok: false,
      feature: "marketphase",
      meta: {
        generatedAt: asOf,
        url: `/data/marketphase/${rawAsset || ''}`,
        status: "error",
        circuitOpen: true,
        reason: "UNSUPPORTED_MARKETPHASE_PATH",
        ...meta
      },
      data: null,
      error: {
        code: "UNSUPPORTED_MARKETPHASE_PATH",
        message: `Only .json assets are supported (got: ${rawAsset || "<empty>"})`
      }
    }, 404);
  }

  const staticPath = `/data/marketphase/${rawAsset}`;
  const staticDoc = await readStaticAssetJson(request, env, staticPath);
  if (staticDoc) {
    if (staticDoc.meta && typeof staticDoc.meta === 'object') {
      staticDoc.meta.url = staticDoc.meta.url || `/data/marketphase/${rawAsset}`;
    }
    return jsonResponse(staticDoc, 200);
  }

  if (rawAsset === "index.json") {
    const expected = await universeCount(request, env);
    return jsonResponse({
      ok: false,
      feature: "marketphase",
      meta: {
        generatedAt: asOf,
        url: `/data/marketphase/${rawAsset}`,
        status: "error",
        circuitOpen: true,
        reason: "MARKETPHASE_INDEX_MISSING",
        source: "runtime_fallback",
        expectedUniverse: expected,
        ...meta
      },
      data: {
        symbols: []
      },
      error: {
        code: "MARKETPHASE_INDEX_MISSING",
        message: "Marketphase index artifact is missing; serving explicit fallback envelope."
      }
    });
  }

  const symbol = rawAsset.slice(0, -5).trim().toUpperCase();
  return jsonResponse({
    ok: false,
    feature: "marketphase",
    meta: {
      symbol,
      generatedAt: asOf,
      url: `/data/marketphase/${rawAsset}`,
      status: "error",
      circuitOpen: true,
      reason: "MARKETPHASE_SYMBOL_MISSING",
      source: "runtime_fallback",
      ...meta
    },
    data: null,
    error: {
      code: "MARKETPHASE_SYMBOL_MISSING",
      message: `No marketphase artifact found for symbol ${symbol || "<unknown>"}.`
    }
  });
}
