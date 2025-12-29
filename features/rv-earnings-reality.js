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
    isMissing: (value) => !value?.ok || !(value?.data?.data?.items || []).length,
    reason: "STALE_FALLBACK"
  });
  const meta = resolved?.data || {};
  const data = meta.data || {};
  const items = Array.isArray(data.items) ? data.items : [];

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Earnings Reality konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!items.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Earnings-Daten verfügbar.</div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${meta.dataQuality || "N/A"}</div>
    <div class="rv-native-table-wrap">
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Date</th>
            <th>Implied</th>
            <th>Realized</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const flag = item.flag || "";
              return `
                <tr>
                  <td>${item.symbol || "N/A"}</td>
                  <td>${item.company || "N/A"}</td>
                  <td>${item.date ? new Date(item.date).toLocaleDateString() : "N/A"}</td>
                  <td>${formatPercent(item.impliedMove)}</td>
                  <td>${formatPercent(item.realizedMove)}</td>
                  <td title="${flag}">${flag || "N/A"}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(meta.updatedAt || resolved.ts).toLocaleTimeString()} · Source: ${
        meta.source || "stooq"
      }
    </div>
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
  return fetchJSON("/earnings-reality", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-earnings-reality", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-earnings-reality",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-earnings-reality", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
