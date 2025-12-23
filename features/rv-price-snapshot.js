import { fetchJSON } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const rows = data.assets || [];

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
        Snapshot konnte nicht geladen werden.<br />
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

  if (!rows.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Snapshot-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="rv-native-grid">
      ${rows
        .map((asset) => {
          const changeValue = asset.changePercent ?? asset.change ?? 0;
          const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
          const label = asset.label || asset.symbol || "Asset";
          return `
            <div class="rv-native-kpi">
              <div class="label">${label}</div>
              <div class="value">$${formatNumber(asset.price, { maximumFractionDigits: 0 })}</div>
              <div class="rv-native-note ${changeClass}">${formatNumber(changeValue, { maximumFractionDigits: 2 })}% 24h</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: CoinGecko</div>
  `;

  const hasWarning = payload?.ok && payload?.error?.code;
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    payload?.isStale ? "Stale data" : hasWarning ? "Partial data" : "Live"
  );
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "CoinGecko",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/price-snapshot", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-price-snapshot", traceId, logger } = context;
  const data = await getOrFetch("rv-price-snapshot", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 60_000,
    featureId,
    logger
  });
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-price-snapshot", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
