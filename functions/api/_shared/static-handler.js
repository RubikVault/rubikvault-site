function nowIso() {
  return new Date().toISOString();
}

function isHtmlLike(text) {
  return /<!doctype|<html/i.test(text || "");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function buildEnvelope({ ok, feature, data, error, staticPath, traceId }) {
  const st = ok ? "OK" : "ERROR";
  const err = ok ? null : (error || { code: "ERROR", message: "unknown error" });
  const ts = nowIso();
  return {
    ok: Boolean(ok),
    feature: String(feature || "unknown"),
    data: data ?? null,
    error: err,
    meta: {
      status: st,
      reason: ok ? "" : (err?.code || "ERROR"),
      ts,
      schemaVersion: 1,
      traceId: traceId || "static",
      writeMode: "NONE",
      circuitOpen: false,
      warnings: [],
      savedAt: null,
      ageMinutes: null,
      source: "static-first",
      emptyReason: null,
      staticPath: staticPath || null
    }
  };
}

const STATIC_MAP = {
  "bundle": "/data/bundle.json",
  "render-plan": "/data/render-plan.json",
  "system-health": "/data/system-health.json",
  "provider-state": "/data/provider-state.json",
  "usage-report": "/data/usage-report.json",
  "error-summary": "/data/error-summary.json",
  "seed-manifest": "/data/seed-manifest.json",
  "health": "/data/system-health.json",
  "health-report": "/data/system-health.json"
};

function resolveStaticPath(apiName) {
  if (!apiName) return null;
  if (apiName.startsWith("snapshots/")) {
    const id = apiName.slice("snapshots/".length);
    return id ? `/data/snapshots/${id}.json` : null;
  }
  if (STATIC_MAP[apiName]) return STATIC_MAP[apiName];
  return `/data/snapshots/${apiName}.json`;
}

async function fetchStaticJson(request, apiName, staticPath) {
  const traceId =
    request.headers.get("x-rv-trace-id") || request.headers.get("x-rv-trace") || "static";
  if (!staticPath) {
    return json(
      buildEnvelope({
        ok: false,
        feature: apiName,
        data: null,
        error: { code: "STATIC_MISSING", message: "No static mapping" },
        staticPath: null,
        traceId
      })
    );
  }

  const target = new URL(staticPath, new URL(request.url).origin);
  try {
    const res = await fetch(target.toString(), { headers: { Accept: "application/json" } });
    const text = await res.text();

    if (!res.ok) {
      return json(
        buildEnvelope({
          ok: false,
          feature: apiName,
          data: null,
          error: { code: "STATIC_MISSING", message: `${staticPath} unavailable (HTTP ${res.status})` },
          staticPath,
          traceId
        })
      );
    }

    if (!text || isHtmlLike(text)) {
      return json(
        buildEnvelope({
          ok: false,
          feature: apiName,
          data: null,
          error: { code: "STATIC_NOT_JSON", message: `${staticPath} did not return JSON` },
          staticPath,
          traceId
        })
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(
        buildEnvelope({
          ok: false,
          feature: apiName,
          data: null,
          error: { code: "STATIC_INVALID_JSON", message: `${staticPath} returned invalid JSON` },
          staticPath,
          traceId
        })
      );
    }

    return json(
      buildEnvelope({
        ok: true,
        feature: apiName,
        data: parsed,
        error: null,
        staticPath,
        traceId
      })
    );
  } catch (error) {
    return json(
      buildEnvelope({
        ok: false,
        feature: apiName,
        data: null,
        error: { code: "STATIC_FETCH_FAILED", message: String(error?.message || error || "") },
        staticPath,
        traceId
      })
    );
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const apiName = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const staticPath = resolveStaticPath(apiName);
  return fetchStaticJson(request, apiName || "unknown", staticPath);
}

export { resolveStaticPath };
