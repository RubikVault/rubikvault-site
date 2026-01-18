function nowIso() { return new Date().toISOString(); }
function isHtmlLike(text) { return /<!doctype|<html/i.test(text || ""); }

function mkEnvelope({ ok, feature, data, error, staticPath, traceId }) {
  const st = ok ? "OK" : "ERROR";
  const err = ok ? null : (error || { code: "ERROR", message: "unknown error" });
  return {
    ok: Boolean(ok),
    feature: String(feature || "unknown"),
    data: data ?? null,
    error: err,
    meta: {
      status: st,
      reason: ok ? "" : (err?.code || "ERROR"),
      ts: nowIso(),
      schemaVersion: 1,
      traceId: traceId || "api",
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

function json(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const traceId = request.headers.get("x-rv-trace-id") || request.headers.get("x-rv-trace") || "api";
  const staticPath = "/data/render-plan.json";
  const target = new URL(staticPath, url.origin);

  try {
    const res = await fetch(target.toString(), { headers: { "Accept": "application/json" } });
    const text = await res.text();

    if (!res.ok) {
      return json(mkEnvelope({
        ok: false, feature: "render-plan", data: null,
        error: { code: "STATIC_MISSING", message: `${staticPath} unavailable (HTTP ${res.status})` },
        staticPath, traceId
      }));
    }
    if (!text || isHtmlLike(text)) {
      return json(mkEnvelope({
        ok: false, feature: "render-plan", data: null,
        error: { code: "STATIC_NOT_JSON", message: `${staticPath} did not return JSON` },
        staticPath, traceId
      }));
    }

    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      return json(mkEnvelope({
        ok: false, feature: "render-plan", data: null,
        error: { code: "STATIC_INVALID_JSON", message: `${staticPath} returned invalid JSON` },
        staticPath, traceId
      }));
    }

    return json(mkEnvelope({ ok: true, feature: "render-plan", data: parsed, error: null, staticPath, traceId }));
  } catch (e) {
    return json(mkEnvelope({
      ok: false, feature: "render-plan", data: null,
      error: { code: "STATIC_FETCH_FAILED", message: String(e && e.message ? e.message : e) },
      staticPath, traceId
    }));
  }
}
