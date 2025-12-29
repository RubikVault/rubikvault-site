import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import {
  normalizeResponse,
  unwrapFeatureData,
  formatMetaLines
} from "./utils/feature-contract.js";

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.data?.clusters || []).length,
    reason: "STALE_FALLBACK"
  });
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const clusters = data.clusters || data.items || [];
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Insider Cluster konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!clusters.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Insider Cluster verfügbar.</div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("PARTIAL", quality.reason || "NO_DATA");
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${quality.status} · ${quality.reason}</div>
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
    ${formatMetaLines({ meta, envelope })}
  `;

  const status = envelope?.isStale || quality.status !== "LIVE" ? "PARTIAL" : "OK";
  logger?.setStatus(status, quality.reason || quality.status);
  logger?.setMeta({
    updatedAt: meta.updatedAt || envelope?.ts,
    source: meta.source || "sec-edgar",
    isStale: envelope?.isStale
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
