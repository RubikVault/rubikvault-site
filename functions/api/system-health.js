import { createTraceId, makeResponse, safeSnippet } from "./_shared.js";

const FEATURE_ID = "system-health";
const MIRROR_PATH = "/mirrors/system-health.json";

function isHtmlFallback(contentType, bodyText) {
  const ct = String(contentType || "").toLowerCase();
  const trimmed = String(bodyText || "").trim().toLowerCase();
  return (
    ct.includes("text/html") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  );
}

async function fetchSystemHealth(targetUrl) {
  let response;
  try {
    response = await fetch(targetUrl, { headers: { Accept: "application/json" } });
  } catch (error) {
    return {
      ok: false,
      reason: "UPSTREAM_FAIL",
      status: 0,
      snippet: error?.message || "Fetch failed",
      url: targetUrl
    };
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (isHtmlFallback(contentType, text)) {
    return {
      ok: false,
      reason: "ROUTING_HTML",
      status: response.status,
      snippet: safeSnippet(text),
      url: targetUrl,
      contentType
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "UPSTREAM_FAIL",
      status: response.status,
      snippet: safeSnippet(text),
      url: targetUrl
    };
  }

  try {
    return { ok: true, status: response.status, data: JSON.parse(text), url: targetUrl };
  } catch (error) {
    return {
      ok: false,
      reason: "SCHEMA_INVALID",
      status: response.status,
      snippet: safeSnippet(text),
      url: targetUrl
    };
  }
}

export async function onRequestGet({ request, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const origin = new URL(request.url).origin;
  const targetUrl = `${origin}${MIRROR_PATH}`;

  const result = await fetchSystemHealth(targetUrl);
  if (result.ok) {
    return makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: result.data,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: result.url, status: result.status, snippet: "" }
    });
  }

  const reason = result.reason || "UPSTREAM_FAIL";
  const isRoutingHtml = reason === "ROUTING_HTML";
  return makeResponse({
    ok: false,
    feature: FEATURE_ID,
    traceId,
    data: {},
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: {
      url: result.url || targetUrl,
      status: result.status ?? null,
      snippet: result.snippet || ""
    },
    meta: {
      status: "ERROR",
      reason,
      hint: isRoutingHtml ? targetUrl : ""
    },
    error: {
      code: reason,
      message: isRoutingHtml ? "Routing HTML returned for system-health" : "Upstream error",
      hint: isRoutingHtml ? `ROUTING_HTML: ${targetUrl}` : "",
      details: { targetUrl }
    }
  });
}
