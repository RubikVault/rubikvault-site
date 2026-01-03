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
    isMissing: (value) => !value?.ok || value?.data?.data?.availableComponents === 0,
    reason: "STALE_FALLBACK"
  });
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Smart Money Score konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!data.availableComponents) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Smart-Money-Daten verfügbar.</div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("PARTIAL", quality.reason || "NO_DATA");
    return;
  }

  const components = data.components || {};
  const weights = data.weights || {};

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${quality.status} · ${quality.reason}</div>
    <div class="rv-native-grid rv-compact">
      <div class="rv-native-kpi">
        <div class="label">Score</div>
        <div class="value">${formatNumber(data.score, { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Components</div>
        <div class="value">${data.availableComponents ?? 0} / 4</div>
      </div>
    </div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Component</th>
          <th>Value</th>
          <th>Weight</th>
        </tr>
      </thead>
      <tbody>
        ${Object.keys(weights)
          .map((key) => {
            return `
              <tr>
                <td>${key}</td>
                <td>${formatNumber(components[key] ?? null, { maximumFractionDigits: 2 })}</td>
                <td>${formatNumber(weights[key] * 100, { maximumFractionDigits: 0 })}%</td>
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
    source: meta.source || "internal",
    isStale: envelope?.isStale
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/smart-money", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-smart-money", traceId, logger } = context;
  const data = await getOrFetch("rv-smart-money", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-smart-money", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
