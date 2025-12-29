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
    isMissing: (value) => !value?.ok || !(value?.data?.data?.outcomes || []).length,
    reason: "STALE_FALLBACK"
  });
  const meta = resolved?.data || {};
  const data = meta.data || {};
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Alpha Consistency konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!outcomes.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Performance-Daten verfügbar.</div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${meta.dataQuality || "N/A"}</div>
    <div class="rv-native-split">
      <div class="rv-native-kpi">
        <div class="label">Hit Rate</div>
        <div class="value">${formatPercent(data.hitRate * 100)}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Avg Win</div>
        <div class="value">${formatNumber(data.avgWin, { maximumFractionDigits: 2 })}%</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Avg Loss</div>
        <div class="value">${formatNumber(data.avgLoss, { maximumFractionDigits: 2 })}%</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Expectancy</div>
        <div class="value">${formatNumber(data.expectancy, { maximumFractionDigits: 2 })}%</div>
      </div>
    </div>
    <div class="rv-native-table-wrap">
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Result</th>
            <th>Return</th>
          </tr>
        </thead>
        <tbody>
          ${outcomes
            .map((item) => {
              const result = item.result || "N/A";
              const resultClass =
                result === "WIN" ? "rv-native-positive" : result === "LOSS" ? "rv-native-negative" : "";
              return `
                <tr>
                  <td>${item.symbol || "N/A"}</td>
                  <td class="${resultClass}" title="${result}">${result}</td>
                  <td>${formatNumber(item.return, { maximumFractionDigits: 2 })}%</td>
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
    ${data.methodology ? `<div class="rv-native-note">${data.methodology}</div>` : ""}
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
  return fetchJSON("/alpha-performance", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-alpha-performance", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-alpha-performance",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-alpha-performance", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
