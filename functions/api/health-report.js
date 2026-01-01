import { BLOCK_REGISTRY } from "../../features/blocks-registry.js";
import { normalizeResponse } from "./_shared/feature-contract.js";
import { createTraceId, jsonResponse } from "./_shared.js";

function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".").filter(Boolean);
  return parts.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function resolveValue(payload, key) {
  if (!payload || !key) return undefined;
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

function buildFixHint({ contentType, bodySnippet, itemsCount, dataQuality, cacheLayer, upstreamStatus }) {
  const ct = String(contentType || "").toLowerCase();
  const snippet = String(bodySnippet || "").trim();
  if (ct.includes("text/html") || snippet.startsWith("<!doctype") || snippet.startsWith("<html")) {
    return "ROUTING_HTML (API returns HTML)";
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
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

function isDataEmpty(data) {
  if (!data || typeof data !== "object") return true;
  if (Array.isArray(data)) return data.length === 0;
  return Object.keys(data).length === 0;
}

function resolveFieldValidity(value, field, context = {}) {
  if (!field || !field.type) return { valid: true, reason: null };
  const required = Boolean(field.required);
  if (field.type === "auto") {
    const itemsCount = Number.isFinite(context.itemsCount) ? context.itemsCount : 0;
    const hasData = !isDataEmpty(context.data);
    if (!required) return { valid: true, reason: null };
    return itemsCount > 0 || hasData ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
  }
  if (value === undefined || value === null) {
    return required
      ? { valid: false, reason: "MISSING" }
      : { valid: true, reason: null };
  }
  if (field.type === "number") {
    return Number.isFinite(value)
      ? { valid: true, reason: null }
      : { valid: false, reason: "NOT_NUMBER" };
  }
  if (field.type === "string") {
    return String(value).trim().length > 0
      ? { valid: true, reason: null }
      : { valid: false, reason: "EMPTY_STRING" };
  }
  if (field.type === "array") {
    return Array.isArray(value) && (!required || value.length > 0)
      ? { valid: true, reason: null }
      : { valid: false, reason: "EMPTY_ARRAY" };
  }
  if (field.type === "object") {
    return typeof value === "object"
      ? { valid: true, reason: null }
      : { valid: false, reason: "NOT_OBJECT" };
  }
  if (field.type === "boolean") {
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
  const registryEntries = Object.values(BLOCK_REGISTRY).sort((a, b) =>
    String(a.id || "99").localeCompare(String(b.id || "99"))
  );

  const results = [];
  for (const entry of registryEntries) {
    const featureId = entry.featureId || entry.blockId || "unknown";
    const endpoint = entry.api ? `/api/${entry.api}` : null;
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
      upstreamStatus
    });

    block.endpointStatus = endpointStatus;
    block.reason = raw?.meta?.reason || dataQuality?.reason || null;
    block.error = raw?.error ? { code: raw.error.code, message: raw.error.message } : null;

    block.fields = fields.map((field) => {
      const value = normalized ? resolveValue(normalized, field.key) : undefined;
      let { valid, reason } = resolveFieldValidity(value, field, {
        itemsCount,
        data: normalized?.data
      });
      let fix = null;
      if (endpointStatus === "EMPTY" && field.required) {
        valid = false;
        reason = "EMPTY";
        fix = "Seed lastGood in PROD or validate upstream response.";
      } else if (!valid) {
        fix = entry.fixHints?.[field.key] || fixHint || "Mapper/normalization may be missing.";
      }
      return {
        key: field.key,
        valid,
        reason,
        fix
      };
    });

    results.push(block);
  }

  const okBlocks = results.filter((block) => block.fields.every((field) => field.valid)).length;
  const badBlocks = results.length - okBlocks;
  const payload = {
    ok: true,
    generatedAt: now,
    env: {
      branch: env?.CF_PAGES_BRANCH || null,
      preview:
        env?.ENV_HINT === "preview" ||
        (env?.CF_PAGES_BRANCH && env?.CF_PAGES_BRANCH !== "main") ||
        String(request.headers.get("host") || "").includes("pages.dev")
    },
    summary: { blocks: results.length, okBlocks, badBlocks },
    blocks: results
  };

  return jsonResponse(payload, 200, { "X-RV-Trace": traceId });
}
