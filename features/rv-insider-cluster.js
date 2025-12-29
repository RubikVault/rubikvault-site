import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.data?.clusters || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data?.data || {};
  const meta = resolved?.data || {};
  const clusters = data.clusters || [];

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Insider Cluster konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!clusters.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Insider Cluster verfügbar.</div>
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
          <th>Insiders</th>
          <th>Filings</th>
          <th>Value</th>
          <th>Flag</th>
        </tr>
      </thead>
      <tbody>
        ${clusters
          .map((item) => {
            return `
              <tr>
                <td>${item.symbol || "N/A"}</td>
                <td>${item.insiderCount ?? "N/A"}</td>
                <td>${item.filings ?? "N/A"}</td>
                <td>${item.totalValue || "N/A"}</td>
                <td>${item.reason || "N/A"}</td>
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
    source: meta.source || "sec-edgar",
    isStale: resolved?.isStale
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/insider-cluster", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-insider-cluster", traceId, logger } = context;
  const data = await getOrFetch("rv-insider-cluster", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 6 * 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-insider-cluster", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
