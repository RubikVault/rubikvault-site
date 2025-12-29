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

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.data?.signals || []).length,
    reason: "STALE_FALLBACK"
  });
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const signals = data.signals || data.items || [];
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Volume Anomaly konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!signals.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Volume-Anomalien gefunden.</div>
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
          <th>RVOL</th>
          <th>Signal</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${signals
          .map((item) => {
            return `
              <tr>
                <td>${item.symbol || "N/A"}</td>
                <td>${formatNumber(item.rvol, { maximumFractionDigits: 2 })}</td>
                <td title="${item.signal}">${item.signal || "N/A"}</td>
                <td>${formatNumber(item.score, { maximumFractionDigits: 0 })}</td>
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
  return fetchJSON("/volume-anomaly", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-volume-anomaly", traceId, logger } = context;
  const data = await getOrFetch("rv-volume-anomaly", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-volume-anomaly", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
