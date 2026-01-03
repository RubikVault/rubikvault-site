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
    isMissing: (value) =>
      !value?.ok || typeof value?.data?.data?.riskOnScore !== "number",
    reason: "STALE_FALLBACK"
  });
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const reasons = meta.reasons || [];
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Market Regime konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${quality.status} · ${quality.reason}</div>
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
