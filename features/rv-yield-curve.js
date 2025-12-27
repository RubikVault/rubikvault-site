import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const yields = data.yields || {};
  const spreads = data.spreads || {};
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some yields unavailable."
      : "";

  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    const errorCode = payload?.error?.code || "";
    const upstreamStatus = payload?.upstream?.status;
    const upstreamSnippet = payload?.upstream?.snippet || "";
    const cacheLayer = payload?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(payload) : "";
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
      updatedAt: payload?.ts,
      source: data?.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: payload?.cache || {},
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
        <tr><td>3M</td><td>${formatNumber(yields["3m"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>2Y</td><td>${formatNumber(yields["2y"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>10Y</td><td>${formatNumber(yields["10y"], { maximumFractionDigits: 2 })}</td></tr>
        <tr><td>30Y</td><td>${formatNumber(yields["30y"], { maximumFractionDigits: 2 })}</td></tr>
      </tbody>
    </table>
    <div class="rv-native-note">
      10Y-2Y: ${formatNumber(spreads.tenTwo, { maximumFractionDigits: 2 })} ·
      10Y-3M: ${formatNumber(spreads.tenThreeMonth, { maximumFractionDigits: 2 })}
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: ${data.source || "US Treasury"}
    </div>
  `;

  const status = payload?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, payload?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "US Treasury",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
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
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-yield-curve", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
