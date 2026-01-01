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
    isMissing: (value) => !value?.ok,
    reason: "STALE_FALLBACK"
  });
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };
  const item = Array.isArray(data.items) ? data.items[0] : null;

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Liquidity Pulse konnte nicht geladen werden.<br />
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
        <div class="label">Label</div>
        <div class="value">${item?.label || "N/A"}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">30d Delta</div>
        <div class="value">${formatPercent(item?.delta30dPct)}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Latest Value</div>
        <div class="value">${formatNumber(item?.latestValue, { maximumFractionDigits: 2 })}</div>
      </div>
    </div>
    <ul class="rv-native-list">
      ${(item?.explain || []).map((line) => `<li>${line}</li>`).join("")}
    </ul>
    ${formatMetaLines({ meta, envelope })}
  `;

  const status = envelope?.isStale || quality.status !== "LIVE" ? "PARTIAL" : "OK";
  logger?.setStatus(status, quality.reason || quality.status);
  logger?.setMeta({
    updatedAt: meta.updatedAt || envelope?.ts,
    source: meta.source || "fred",
    isStale: envelope?.isStale
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/arb-liquidity-pulse", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-arb-liquidity-pulse", traceId, logger } = context;
  const data = await getOrFetch("rv-arb-liquidity-pulse", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 6 * 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-arb-liquidity-pulse", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
