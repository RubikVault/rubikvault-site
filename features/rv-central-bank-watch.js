import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some feeds unavailable."
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
        Central Bank Watch konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
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
        Keine Zentralbank-Updates verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload.ts,
      source: data.source || "FED,ECB",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-bank-list" data-rv-field="items">
      ${items
        .slice(0, 8)
        .map(
          (item) => `
          <div class="rv-bank-item">
            <div class="rv-bank-title">
              ${item.title}
              ${item.breaking ? `<span class="rv-break-dot">Breaking</span>` : ""}
            </div>
            <div class="rv-bank-meta">
              <span>${item.source}</span>
              <span>${formatTime(item.publishedAt)}</span>
            </div>
            <a href="${item.link}" target="_blank" rel="noopener noreferrer">Open</a>
          </div>
        `
        )
        .join("")}
    </div>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()}</div>
  `;

  const status = payload?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, payload?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "FED,ECB",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/central-bank-watch", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-central-bank-watch", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-central-bank-watch",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 30 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-central-bank-watch", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
