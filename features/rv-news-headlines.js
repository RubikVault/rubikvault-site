import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString();
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

function render(root, payload, logger) {
  const data = payload?.data || {};
  const items = data.items || [];
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";

  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    const errorCode = payload?.error?.code || "";
    const upstreamStatus = payload?.upstream?.status;
    const upstreamSnippet = payload?.upstream?.snippet || "";
    const cacheLayer = payload?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(payload) : "";
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
      updatedAt: payload?.ts,
      source: data?.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: payload?.cache || {},
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
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
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
              <span class="rv-news-title">${item.headline}</span>
              <span class="rv-news-meta">
                <span class="rv-news-source" data-rv-source="${source.code}">[${source.code}]</span>
                <span>${source.name} · ${formatTime(item.publishedAt)}</span>
              </span>
            </a>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">Data provided by ${data.source || "feeds"}</div>
  `;

  const warningCode = payload?.error?.code || "";
  const hasWarning = payload?.ok && warningCode;
  const isRateLimited = warningCode === "RATE_LIMITED";
  const headline = payload?.isStale
    ? isRateLimited
      ? "RATE_LIMITED"
      : "Stale data"
    : isRateLimited
      ? "RATE_LIMITED"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    headline
  );
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "news",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/news", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-news-headlines", traceId, logger } = context;
  const data = await getOrFetch("rv-news-headlines", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 300_000,
    featureId,
    logger
  });
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-news-headlines", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
