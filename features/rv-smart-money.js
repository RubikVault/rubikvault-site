import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

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
  const data = resolved?.data?.data || {};
  const meta = resolved?.data || {};

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Smart Money Score konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!data.availableComponents) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Smart-Money-Daten verfügbar.</div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    return;
  }

  const components = data.components || {};
  const weights = data.weights || {};

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${meta.dataQuality || "N/A"}</div>
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
  `;

  const status = resolved?.isStale || meta.dataQuality === "PARTIAL" ? "PARTIAL" : "OK";
  logger?.setStatus(status, meta.dataQuality || "LIVE");
  logger?.setMeta({
    updatedAt: meta.updatedAt || resolved?.ts,
    source: meta.source || "internal",
    isStale: resolved?.isStale
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
