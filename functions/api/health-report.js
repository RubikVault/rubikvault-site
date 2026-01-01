import { BLOCK_REGISTRY_LIST } from "../../features/blocks-registry.js";
import { normalizeResponse } from "./_shared/feature-contract.js";
import { createTraceId, jsonResponse } from "./_shared.js";

function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".").filter(Boolean);
  return parts.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function resolveValue(payload, field) {
  if (!payload || !field) return undefined;
  const key = field.path || field.key || "";
  if (!key) return undefined;
  const hasRootPrefix =
    key.startsWith("data.") ||
    key.startsWith("meta.") ||
    key.startsWith("error.") ||
    key.startsWith("cache.") ||
    key.startsWith("upstream.") ||
    key.startsWith("trace.");
  const path = hasRootPrefix ? key : `data.${key}`;
  return resolvePath(payload, path);
}

function detectItems(payload) {
  const data = payload?.data ?? {};
  const candidates = [
    data.items,
    data.rows,
    data.data?.items,
    data.data?.rows,
    payload?.items,
    payload?.rows
  ];
  const items = candidates.find((value) => Array.isArray(value));
  return Array.isArray(items) ? items : [];
}

function normalizeEndpointStatus(raw, normalized) {
  const metaStatus = raw?.meta?.status;
  if (metaStatus === "LIVE" || metaStatus === "STALE" || metaStatus === "EMPTY") return metaStatus;
  if (normalized?.dataQuality?.status === "LIVE") return "LIVE";
  if (normalized?.dataQuality?.status === "PARTIAL") return "STALE";
  return "EMPTY";
}

function buildFixHint({
  contentType,
  bodySnippet,
  itemsCount,
  dataQuality,
  cacheLayer,
  upstreamStatus,
  httpStatus
}) {
  const ct = String(contentType || "").toLowerCase();
  const snippet = String(bodySnippet || "").trim();
  if (ct.includes("text/html") || snippet.startsWith("<!doctype") || snippet.startsWith("<html")) {
    return "ROUTING_HTML (API returns HTML)";
  }
  if (upstreamStatus === 401 || httpStatus === 401) {
    return "Upstream requires API key. Configure provider env var or switch source, then seed lastGood in PROD.";
  }
  if (upstreamStatus === 403 || httpStatus === 403) {
    return "UPSTREAM_AUTH (key/plan missing or blocked)";
  }
  if (!cacheLayer || cacheLayer === "none") {
    return "CACHE_MISSING (KV binding or cache miss)";
  }
  if (itemsCount === 0 && (dataQuality?.reason === "NO_DATA" || dataQuality?.status === "PARTIAL")) {
    return "EMPTY_DATA (threshold/universe/cache)";
  }
  return null;
}

function buildEmptyReason({
  contentType,
  bodySnippet,
  itemsCount,
  dataQuality,
  upstreamStatus,
  httpStatus,
  cacheLayer,
  emptyPolicy
}) {
  const ct = String(contentType || "").toLowerCase();
  const snippet = String(bodySnippet || "").trim();
  const isHtml = ct.includes("text/html") || snippet.startsWith("<!doctype") || snippet.startsWith("<html");
  if (isHtml) return "ROUTING_HTML";
  if (upstreamStatus === 401 || httpStatus === 401) return "UPSTREAM_4XX";
  if (upstreamStatus === 403 || httpStatus === 403) return "UPSTREAM_4XX";
  if ((upstreamStatus && upstreamStatus >= 500) || (httpStatus && httpStatus >= 500)) return "UPSTREAM_5XX";
  if (itemsCount === 0) {
    if (emptyPolicy === "CLIENT_ONLY") return "CLIENT_ONLY";
    if (emptyPolicy === "EMPTY_OK_WITH_CONTEXT") return "EVENT_NO_EVENTS";
    if (!cacheLayer || cacheLayer === "none") return "CACHE_EMPTY";
    if (dataQuality?.reason === "NO_DATA") return "NO_DATA_YET";
    return "EMPTY";
  }
  return dataQuality?.reason || null;
}

function isDataEmpty(data) {
  if (!data || typeof data !== "object") return true;
  if (Array.isArray(data)) return data.length === 0;
  return Object.keys(data).length === 0;
}

function hashRegistry(entries) {
  const payload = JSON.stringify(
    (entries || []).map((entry) => ({
      id: entry.id,
      featureId: entry.featureId,
      apiPath: entry.apiPath
    }))
  );
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(8, "0").slice(0, 8);
}

function resolveFieldValidity(value, field, context = {}) {
  if (!field) return { valid: true, reason: null };
  const fieldType = field.type || field.kind || "auto";
  const required = Boolean(field.required);
  if (fieldType === "auto") {
    const itemsCount = Number.isFinite(context.itemsCount) ? context.itemsCount : 0;
    const hasData = !isDataEmpty(context.data);
    if (!required) return { valid: true, reason: null };
    return itemsCount > 0 || hasData ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
  }
  if (field.validator === "nonEmpty") {
    if (!required && (value === undefined || value === null)) return { valid: true, reason: null };
    if (Array.isArray(value)) {
      return value.length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY_ARRAY" };
    }
    if (typeof value === "string") {
      return value.trim().length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY_STRING" };
    }
    if (typeof value === "object") {
      return value && Object.keys(value).length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY_OBJECT" };
    }
    return value !== undefined && value !== null ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
  }
  if (typeof field.validator === "string" && field.validator.startsWith("arrayMin:")) {
    const min = Number(field.validator.split(":")[1] || 0);
    return Array.isArray(value) && value.length >= min
      ? { valid: true, reason: null }
      : { valid: false, reason: "ARRAY_TOO_SMALL" };
  }
  if (field.validator === "numeric") {
    return Number.isFinite(value)
      ? { valid: true, reason: null }
      : { valid: false, reason: "NOT_NUMBER" };
  }
  if (value === undefined || value === null) {
    return required
      ? { valid: false, reason: "MISSING" }
      : { valid: true, reason: null };
  }
  if (fieldType === "number") {
    return Number.isFinite(value)
      ? { valid: true, reason: null }
      : { valid: false, reason: "NOT_NUMBER" };
  }
  if (fieldType === "string") {
    return String(value).trim().length > 0
      ? { valid: true, reason: null }
      : { valid: false, reason: "EMPTY_STRING" };
  }
  if (fieldType === "array") {
    return Array.isArray(value) && (!required || value.length > 0)
      ? { valid: true, reason: null }
      : { valid: false, reason: "EMPTY_ARRAY" };
  }
  if (fieldType === "object") {
    return typeof value === "object"
      ? { valid: true, reason: null }
      : { valid: false, reason: "NOT_OBJECT" };
  }
  if (fieldType === "boolean") {
    return typeof value === "boolean"
      ? { valid: true, reason: null }
      : { valid: false, reason: "NOT_BOOLEAN" };
  }
  return { valid: true, reason: null };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const traceId = createTraceId(request);
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  const registryEntries = (BLOCK_REGISTRY_LIST || []).slice();

  const results = [];
  let fetchFailures = 0;
  for (const entry of registryEntries) {
    const featureId = entry.featureId || entry.blockId || "unknown";
    const endpoint = entry.apiPath || (entry.api ? `/api/${entry.api}` : null);
    const fields = Array.isArray(entry.fields) ? entry.fields : [];
    const block = {
      id: entry.id || "00",
      featureId,
      title: entry.title || featureId,
      endpointStatus: "EMPTY",
      reason: null,
      error: null,
      fields: []
    };

    if (!endpoint) {
      block.endpointStatus = "EMPTY";
      block.reason = "CLIENT_ONLY";
      block.fields = fields.map((field) => ({
        key: field.key,
        valid: !field.required,
        reason: field.required ? "CLIENT_ONLY" : null,
        fix: field.required ? "Client-only block has no API payload." : null
      }));
      results.push(block);
      continue;
    }

    let responseStatus = null;
    let contentType = "";
    let bodySnippet = "";
    let raw = null;
    try {
      const res = await fetch(`${origin}${endpoint}?debug=1`, {
        headers: { "x-rv-trace-id": traceId }
      });
      responseStatus = res.status;
      contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      bodySnippet = text.slice(0, 200);
      raw = text.trim().startsWith("{") ? JSON.parse(text) : null;
    } catch (error) {
      fetchFailures += 1;
      block.endpointStatus = "EMPTY";
      block.reason = "FETCH_ERROR";
      block.error = { code: "FETCH_ERROR", message: error?.message || "Fetch failed" };
      block.fields = fields.map((field) => ({
        key: field.key,
        valid: false,
        reason: "FETCH_ERROR",
        fix: "Check routing or upstream availability."
      }));
      results.push(block);
      continue;
    }

    const normalized = raw ? normalizeResponse(raw, { feature: featureId }) : null;
    const items = normalized ? detectItems(normalized) : [];
    const itemsCount = items.length;
    const endpointStatus = normalizeEndpointStatus(raw, normalized);
    const dataQuality = normalized?.dataQuality || null;
    const upstreamStatus = normalized?.upstream?.status ?? null;
    const cacheLayer = normalized?.cache?.layer || "none";
    const fixHint = buildFixHint({
      contentType,
      bodySnippet,
      itemsCount,
      dataQuality,
      cacheLayer,
      upstreamStatus,
      httpStatus: responseStatus
    });

    block.endpointStatus = endpointStatus;
    const baseReason = raw?.meta?.reason || dataQuality?.reason || null;
    const emptyReason = buildEmptyReason({
      contentType,
      bodySnippet,
      itemsCount,
      dataQuality,
      cacheLayer,
      upstreamStatus,
      httpStatus: responseStatus,
      emptyPolicy: entry.emptyPolicy || ""
    });
    block.reason = baseReason || emptyReason || null;
    block.error = raw?.error ? { code: raw.error.code, message: raw.error.message } : null;

    const isPreviewEmpty = endpointStatus === "EMPTY" && block.reason === "PREVIEW";
    const isClientOnly = block.reason === "CLIENT_ONLY";
    const isEndpointError = endpointStatus === "ERROR";
    const forceEmptyInvalid =
      endpointStatus === "EMPTY" && !isPreviewEmpty && !isClientOnly;

    block.fields = fields.map((field) => {
      const value = normalized ? resolveValue(normalized, field) : undefined;
      let { valid, reason } = resolveFieldValidity(value, field, {
        itemsCount,
        data: normalized?.data
      });
      let fix = null;
      const isOptional = field.required === false && field.optional === true;
      if (isEndpointError) {
        valid = false;
        reason = "ENDPOINT_ERROR";
        fix = "Endpoint error. Check routing, schema, or upstream availability.";
      } else if (forceEmptyInvalid && !isOptional) {
        valid = false;
        if (block.reason === "PREVIEW") {
          reason = "EMPTY_PREVIEW";
          fix =
            "Preview blocks upstream. Seed lastGood by calling PROD /api/<endpoint> once, then Preview shows STALE.";
        } else if (block.reason === "UPSTREAM_4XX") {
          reason = "EMPTY_UPSTREAM";
          fix =
            "Missing/invalid API key; configure env var or switch provider; then seed lastGood in PROD.";
        } else {
          reason = "EMPTY_UPSTREAM";
          fix = "Seed lastGood in PROD or validate upstream response.";
        }
      } else if (isPreviewEmpty || isClientOnly) {
        valid = true;
        reason = null;
      } else if (!valid) {
        fix = entry.fixHints?.[field.key] || fixHint || "Mapper/normalization may be missing.";
      }
      return {
        key: field.key,
        path: field.path || field.key,
        valid,
        reason,
        fix
      };
    });

    results.push(block);
  }

  const okBlocks = results.filter((block) => {
    const isPreviewEmpty = block.endpointStatus === "EMPTY" && block.reason === "PREVIEW";
    const isClientOnly = block.reason === "CLIENT_ONLY";
    if (block.endpointStatus === "ERROR") return false;
    if (block.endpointStatus === "EMPTY" && !isPreviewEmpty && !isClientOnly) return false;
    return (block.fields || []).every((field) => field.valid);
  }).length;
  const badBlocks = results.length - okBlocks;
  const payload = {
    ok: fetchFailures < registryEntries.length,
    generatedAt: now,
    env: {
      branch: env?.CF_PAGES_BRANCH || null,
      preview:
        env?.ENV_HINT === "preview" ||
        (env?.CF_PAGES_BRANCH && env?.CF_PAGES_BRANCH !== "main") ||
        String(request.headers.get("host") || "").includes("pages.dev")
    },
    summary: { blocks: results.length, okBlocks, badBlocks },
    blocks: results,
    meta: {
      generatedAt: now,
      traceId,
      registryHash: hashRegistry(registryEntries)
    }
  };

  return jsonResponse(payload, 200, { "X-RV-Trace": traceId });
}
