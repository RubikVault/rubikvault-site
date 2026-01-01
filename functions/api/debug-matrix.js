import { createTraceId, makeResponse } from "./_shared.js";
import { BLOCK_REGISTRY } from "../../features/blocks-registry.js";
import { FEATURES } from "../../rv-config.js";

const FEATURE_ID = "debug-matrix";
const TIMEOUT_MS = 8000;
const CONCURRENCY = 3;

function isHtmlLike(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

function pickItemsCount(payload) {
  const candidates = [
    payload?.data?.items,
    payload?.items,
    payload?.data?.rows,
    payload?.rows,
    payload?.data?.data?.items,
    payload?.data?.data?.rows
  ];
  for (const entry of candidates) {
    if (Array.isArray(entry)) return entry.length;
  }
  return 0;
}

function normalizeDataQuality(payload) {
  return (
    payload?.dataQuality?.status ||
    payload?.dataQuality ||
    payload?.data?.dataQuality?.status ||
    payload?.data?.dataQuality ||
    ""
  );
}

function buildFixHint({ isHtml, itemsCount, dataQuality, upstreamStatus, httpStatus, cacheLayer, emptyPolicy }) {
  if (isHtml) return "ROUTING_HTML (API returns HTML)";
  if ([401, 403].includes(upstreamStatus) || [401, 403].includes(httpStatus)) {
    return "UPSTREAM_AUTH (key/plan)";
  }
  if ((upstreamStatus && upstreamStatus >= 500) || (httpStatus && httpStatus >= 500)) {
    return "UPSTREAM_DOWN (provider outage)";
  }
  if (!cacheLayer) return "CACHE_MISSING (KV binding?)";
  if (itemsCount === 0) {
    if (emptyPolicy === "CLIENT_ONLY") return "CLIENT_ONLY (local block)";
    if (emptyPolicy === "EMPTY_OK_WITH_CONTEXT") return "EVENT_NO_EVENTS (legit empty)";
    return "EMPTY_DATA (threshold/universe/cache)";
  }
  if (String(dataQuality || "").toUpperCase().includes("EMPTY")) {
    return "EMPTY_DATA (threshold/universe/cache)";
  }
  return "";
}

function buildEmptyReason({ isHtml, itemsCount, dataQuality, upstreamStatus, httpStatus, cacheLayer, emptyPolicy }) {
  if (isHtml) return "ROUTING_HTML";
  if ([401, 403].includes(upstreamStatus) || [401, 403].includes(httpStatus)) return "UPSTREAM_AUTH";
  if ((upstreamStatus && upstreamStatus >= 500) || (httpStatus && httpStatus >= 500)) return "UPSTREAM_DOWN";
  if (itemsCount === 0) {
    if (emptyPolicy === "CLIENT_ONLY") return "CLIENT_ONLY";
    if (emptyPolicy === "EMPTY_OK_WITH_CONTEXT") return "EVENT_NO_EVENTS";
    if (!cacheLayer || cacheLayer === "none") return "CACHE_EMPTY";
    return "THRESHOLD_TOO_STRICT";
  }
  if (String(dataQuality || "").toUpperCase().includes("EMPTY")) return "EMPTY_DATA";
  return "";
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "" };
  }
}

function getFeatureMap() {
  const map = new Map();
  (FEATURES || []).forEach((entry) => {
    if (!entry?.id) return;
    if (entry.api) map.set(entry.id, entry.api);
  });
  return map;
}

async function runWithLimit(tasks, limit) {
  const results = [];
  const queue = [...tasks];
  const workers = new Array(Math.min(limit, tasks.length)).fill(null).map(async () => {
    while (queue.length) {
      const task = queue.shift();
      if (!task) return;
      results.push(await task());
    }
  });
  await Promise.all(workers);
  return results;
}

export async function onRequestGet({ request }) {
  const traceId = createTraceId(request);
  const origin = new URL(request.url).origin;
  const apiMap = getFeatureMap();

  const tasks = Object.values(BLOCK_REGISTRY).map((entry) => async () => {
    const endpoint = apiMap.get(entry.blockId);
    if (!endpoint) {
      return {
        feature: entry.blockId,
        endpoint: null,
        httpStatus: null,
        contentType: "",
        ok: true,
        dataQuality: "CLIENT_ONLY",
        itemsCount: 0,
        cache: { layer: "none", ttl: 0 },
        upstreamStatus: null,
        emptyReason: "CLIENT_ONLY",
        fixHint: "CLIENT_ONLY (local block)"
      };
    }

    const url = `${origin}/api/${endpoint}`;
    const { response, text } = await fetchWithTimeout(url);
    const httpStatus = response?.status ?? 0;
    const contentType = response?.headers?.get("Content-Type") || "";
    const isHtml = isHtmlLike(text) || contentType.includes("text/html");
    let payload = null;
    try {
      payload = text && text.trim().startsWith("{") ? JSON.parse(text) : null;
    } catch (error) {
      payload = null;
    }

    const ok = payload?.ok ?? false;
    const dataQuality = normalizeDataQuality(payload);
    const itemsCount = pickItemsCount(payload);
    const cacheLayer = payload?.cache?.layer || payload?.data?.cache?.layer || "";
    const cacheTtl = payload?.cache?.ttl ?? payload?.data?.cache?.ttl ?? 0;
    const upstreamStatus =
      payload?.upstream?.status ?? payload?.data?.upstream?.status ?? null;

    const emptyPolicy = entry.emptyPolicy || "";
    const emptyReason = buildEmptyReason({
      isHtml,
      itemsCount,
      dataQuality,
      upstreamStatus,
      httpStatus,
      cacheLayer,
      emptyPolicy
    });
    const fixHint = buildFixHint({
      isHtml,
      itemsCount,
      dataQuality,
      upstreamStatus,
      httpStatus,
      cacheLayer,
      emptyPolicy
    });

    return {
      feature: entry.blockId,
      endpoint: `/api/${endpoint}`,
      httpStatus,
      contentType,
      ok,
      dataQuality: dataQuality || "",
      itemsCount,
      cache: { layer: cacheLayer || "none", ttl: cacheTtl ?? 0 },
      upstreamStatus,
      emptyReason,
      fixHint
    };
  });

  const entries = await runWithLimit(tasks, CONCURRENCY);
  const sorted = entries.sort((a, b) => String(a.feature).localeCompare(String(b.feature)));

  return makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: {
      generatedAt: new Date().toISOString(),
      entries: sorted,
      blockCount: sorted.length
    }
  });
}
