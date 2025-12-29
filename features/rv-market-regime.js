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
    isMissing: (value) =>
      !value?.ok || typeof value?.data?.data?.riskOnScore !== "number",
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data?.data || {};
  const meta = resolved?.data || {};
  const reasons = meta.reasons || [];

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Market Regime konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (typeof data.riskOnScore !== "number" && !data.label) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Regime-Daten verfügbar.</div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${meta.dataQuality || "N/A"}</div>
    <div class="rv-native-grid rv-compact">
      <div class="rv-native-kpi">
        <div class="label">Risk-On Score</div>
        <div class="value">${formatNumber(data.riskOnScore, { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Label</div>
        <div class="value">${data.label || "N/A"}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Confidence</div>
        <div class="value">${formatPercent(meta.confidence * 100)}</div>
      </div>
    </div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>SPY 5D</td><td>${formatPercent(data.spy?.r5d)}</td></tr>
        <tr><td>QQQ 5D</td><td>${formatPercent(data.qqq?.r5d)}</td></tr>
        <tr><td>IWM 5D</td><td>${formatPercent(data.iwm?.r5d)}</td></tr>
        <tr><td>VIX</td><td>${formatNumber(data.vix?.value, { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>VIX 5D</td><td>${formatPercent(data.vix?.change5d)}</td></tr>
        <tr><td>10Y-2Y</td><td>${formatNumber(data.yields?.tenTwo, { maximumFractionDigits: 2 })}</td></tr>
      </tbody>
    </table>
    ${reasons.length ? `<div class="rv-native-note">Reasons: ${reasons.join(", ")}</div>` : ""}
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
  return fetchJSON("/market-regime", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-market-regime", traceId, logger } = context;
  const data = await getOrFetch("rv-market-regime", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 30 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-market-regime", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
