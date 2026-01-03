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
    isMissing: (value) => {
      const yields = value?.data?.yields || {};
      return !value?.ok || !Object.values(yields).some((item) => item !== null);
    },
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const yields = data.yields || {};
  const spreads = data.spreads || {};
  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some yields unavailable."
      : "";

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const upstreamStatus = resolved?.upstream?.status;
    const upstreamSnippet = resolved?.upstream?.snippet || "";
    const cacheLayer = resolved?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Yield Curve konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    logger?.setMeta({
      updatedAt: resolved?.ts,
      source: data?.source || "--",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: resolved?.cache || {},
      upstreamStatus: upstreamStatus ?? null
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Tenor</th>
          <th>Yield</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1M</td><td data-rv-field="yield-1m">${formatNumber(yields["1m"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>3M</td><td data-rv-field="yield-3m">${formatNumber(yields["3m"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>6M</td><td data-rv-field="yield-6m">${formatNumber(yields["6m"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>1Y</td><td data-rv-field="yield-1y">${formatNumber(yields["1y"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>2Y</td><td data-rv-field="yield-2y">${formatNumber(yields["2y"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>5Y</td><td data-rv-field="yield-5y">${formatNumber(yields["5y"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>10Y</td><td data-rv-field="yield-10y">${formatNumber(yields["10y"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>30Y</td><td data-rv-field="yield-30y">${formatNumber(yields["30y"], { maximumFractionDigits: 2 })}</td></tr>
      </tbody>
    </table>
    <div class="rv-native-note">
      10Y-2Y: ${formatNumber(spreads.tenTwo, { maximumFractionDigits: 2 })} ·
      10Y-3M: ${formatNumber(spreads.tenThreeMonth, { maximumFractionDigits: 2 })}
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Source: ${data.source || "US Treasury"}
    </div>
  `;

  const status = resolved?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, resolved?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "US Treasury",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/yield-curve", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-yield-curve", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-yield-curve",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-yield-curve", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
