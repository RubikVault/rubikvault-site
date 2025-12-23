import { fetchJSON } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

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
        Earnings Calendar konnte nicht geladen werden.<br />
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
        Keine Earnings-Daten verfügbar. Bitte später erneut versuchen.
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
    <div class="rv-earnings-list">
      ${items
        .map(
          (item) => `
            <div class="rv-earnings-card">
              <div class="rv-earnings-head">
                <strong>${item.symbol}</strong>
                <span>${item.company || "Unknown"}</span>
              </div>
              <div class="rv-earnings-meta">
                <span>Date: ${item.date || "--"}</span>
                <span>EPS Est: ${item.epsEst ?? "--"}</span>
                <span>EPS Actual: ${item.epsActual ?? "--"}</span>
              </div>
            </div>
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
    source: data.source || "earnings",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/earnings-calendar", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-earnings-calendar", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-earnings-calendar",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 300_000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-earnings-calendar", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
