import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.data?.signals || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data?.data || {};
  const meta = resolved?.data || {};
  const signals = data.signals || [];

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Analyst Stampede konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!signals.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Analysten-Signale verfügbar.</div>
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
          <th>Strong Buy</th>
          <th>Buy</th>
          <th>Hold</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        ${signals
          .map((item) => {
            return `
              <tr>
                <td>${item.symbol || "N/A"}</td>
                <td>${item.strongBuy ?? "N/A"}</td>
                <td>${item.buy ?? "N/A"}</td>
                <td>${item.hold ?? "N/A"}</td>
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
    source: meta.source || "finnhub",
    isStale: resolved?.isStale
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/analyst-stampede", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-analyst-stampede", traceId, logger } = context;
  const data = await getOrFetch("rv-analyst-stampede", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 6 * 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-analyst-stampede", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
