import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${formatNumber(value, { maximumFractionDigits: 2 })}%`;
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.data?.movers || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data?.data || {};
  const meta = resolved?.data || {};
  const movers = data.movers || [];

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Why This Stock Moved konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!movers.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Movers verfügbar.</div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${meta.dataQuality || "N/A"}</div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Move %</th>
          <th>Reason</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        ${movers
          .map((item) => {
            return `
              <tr>
                <td>${item.symbol || "N/A"}</td>
                <td>${formatPercent(item.changePercent)}</td>
                <td title="${(item.reasons || []).join(", ")}">${item.reasonLabel || "N/A"}</td>
                <td>${formatPercent((item.confidence || 0) * 100)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  const status = resolved?.isStale || meta.dataQuality === "PARTIAL" ? "PARTIAL" : "OK";
  logger?.setStatus(status, meta.dataQuality || "LIVE");
  logger?.setMeta({
    updatedAt: meta.updatedAt || resolved?.ts,
    source: meta.source || "stooq",
    isStale: resolved?.isStale
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/why-moved", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-why-moved", traceId, logger } = context;
  const data = await getOrFetch("rv-why-moved", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-why-moved", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
