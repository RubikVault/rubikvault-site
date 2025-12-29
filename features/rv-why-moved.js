import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import {
  normalizeResponse,
  unwrapFeatureData,
  formatMetaLines
} from "./utils/feature-contract.js";

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
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const movers = data.movers || data.items || data.signals || [];
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Why This Stock Moved konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!movers.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Movers verfügbar.</div>
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
    ${formatMetaLines({ meta, envelope })}
  `;

  const status = envelope?.isStale || quality.status !== "LIVE" ? "PARTIAL" : "OK";
  logger?.setStatus(status, quality.reason || quality.status);
  logger?.setMeta({
    updatedAt: meta.updatedAt || envelope?.ts,
    source: meta.source || "stooq",
    isStale: envelope?.isStale
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
