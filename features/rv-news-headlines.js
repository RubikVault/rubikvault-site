import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { rvSetText } from "./rv-dom.js";

function formatTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleTimeString();
}

const CATEGORY_ICONS = {
  stocks: "EQ",
  commodities: "CM",
  crypto: "CR",
  etfs: "ETF",
  bonds: "BD"
};

function resolveSource(item) {
  const source = item?.source || {};
  const code = source.code || item?.sourceCode || item?.sourceId || "NEWS";
  const name = source.name || item?.sourceName || item?.source || "news";
  return { code, name };
}

async function fetchStaticJson(pathname) {
  const response = await fetch(pathname, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.items || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const items = data.items || [];
  const meta = data.meta || null;
  const metaLine = meta
    ? `Status: ${meta.status || "--"}${meta.lastSuccess ? ` · lastSuccess: ${meta.lastSuccess}` : ""}`
    : "";
  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const upstreamStatus = resolved?.upstream?.status;
    const upstreamSnippet = resolved?.upstream?.snippet || "";
    const cacheLayer = resolved?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        News konnten nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    const statusHeadline =
      errorCode === "RATE_LIMITED"
        ? "RATE_LIMITED"
        : errorCode === "SCHEMA_INVALID"
          ? "SCHEMA_INVALID"
          : "API error";
    const statusLevel = errorCode === "RATE_LIMITED" ? "PARTIAL" : "FAIL";
    logger?.setStatus(statusLevel, statusHeadline);
    logger?.setMeta({
      updatedAt: resolved?.ts,
      source: data?.source || "--",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: resolved?.cache || {},
      upstreamStatus: upstreamStatus ?? null
    });
    return;
  }

  if (!items.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine News verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || resolved?.ts,
      source: data.source || "--",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    ${metaLine ? `<div class="rv-native-note">${metaLine}</div>` : ""}
    <div class="rv-news-list">
      ${items
        .slice(0, 12)
        .map((item) => {
          const category = item.category || "stocks";
          const icon = CATEGORY_ICONS[category] || "EQ";
          const source = resolveSource(item);
          return `
            <a class="rv-news-item" href="${item.url}" target="_blank" rel="noopener noreferrer">
              <span class="rv-news-icon" data-rv-cat="${category}">${icon}</span>
              <span class="rv-news-title" data-rv-field="news-title">${item.headline}</span>
              <span class="rv-news-meta">
                <span class="rv-news-source" data-rv-source="${source.code}" data-rv-field="news-source">[${source.code}]</span>
                <span data-rv-field="news-meta">${source.name} · ${formatTime(item.publishedAt)}</span>
              </span>
            </a>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note" data-rv-field="news-sources">Sources: ${data.source || "feeds"}</div>
  `;
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

  const warningCode = resolved?.error?.code || "";
  const hasWarning = resolved?.ok && warningCode;
  const isRateLimited = warningCode === "RATE_LIMITED";
  const headline = resolved?.isStale
    ? isRateLimited
      ? "RATE_LIMITED"
      : "Stale data"
    : isRateLimited
      ? "RATE_LIMITED"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(resolved?.isStale || hasWarning ? "PARTIAL" : "OK", headline);
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "news",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  void featureId;
  void traceId;
  void logger;
  try {
    const [snapshot, meta] = await Promise.all([
      fetchStaticJson("/data/news.json"),
      fetchStaticJson("/data/news.meta.json").catch(() => null)
    ]);

    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    return {
      ok: true,
      ts: snapshot?.generatedAt || new Date().toISOString(),
      cache: { hit: false, ttl: 0, layer: "cdn" },
      upstream: { url: "/data/news.json", status: 200, snippet: "" },
      data: {
        updatedAt: snapshot?.generatedAt || new Date().toISOString(),
        source: (meta?.sources || []).map((s) => s.id).filter(Boolean).join(","),
        items: items.map((item) => ({
          headline: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          source: { code: item?.source?.domain || "NEWS", name: item?.source?.name || "news" },
          sourceId: item?.source?.domain || "news",
          category: item?.topic || "stocks",
          categoryLabel: item?.topic || "Stocks"
        })),
        meta
      },
      error: {}
    };
  } catch (error) {
    return {
      ok: false,
      ts: new Date().toISOString(),
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: {
        url: "/data/news.json",
        status: error?.status ?? null,
        snippet: error?.message || "Fetch failed"
      },
      error: { code: "STATIC_NEWS_FETCH_FAILED", message: error?.message || "Fetch failed", details: {} },
      data: { items: [] }
    };
  }
}

export async function init(root, context = {}) {
  const { featureId = "rv-news-headlines", traceId, logger } = context;
  const data = await getOrFetch("rv-news-headlines", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 300_000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-news-headlines", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
