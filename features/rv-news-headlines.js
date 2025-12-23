import { fetchJSON } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString();
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const items = data.items || [];

  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    const errorCode = payload?.error?.code || "";
    const upstreamStatus = payload?.upstream?.status;
    const upstreamSnippet = payload?.upstream?.snippet || "";
    const detailLine = [errorCode, upstreamStatus ? `Upstream ${upstreamStatus}` : ""]
      .filter(Boolean)
      .join(" · ");
    root.innerHTML = `
      <div class="rv-native-error">
        News konnten nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", "API error");
    logger?.setMeta({
      updatedAt: payload?.ts,
      source: data?.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
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
    <div class="rv-news-list">
      ${items
        .slice(0, 10)
        .map(
          (item) => `
            <a class="rv-news-item" href="${item.link}" target="_blank" rel="noopener noreferrer">
              <span class="rv-news-title">${item.title}</span>
              <span class="rv-news-meta">${item.source || "news"} · ${formatTime(item.ts)}</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;

  const hasWarning = payload?.ok && payload?.error?.code;
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    payload?.isStale ? "Stale data" : hasWarning ? "Partial data" : "Live"
  );
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "news",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
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
