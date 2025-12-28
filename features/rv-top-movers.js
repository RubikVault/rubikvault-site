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
      const stocks = value?.data?.stocks || {};
      return !value?.ok || !(stocks.gainers || []).length || !(stocks.losers || []).length;
    },
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const stocks = data?.stocks || {};
  const gainers = stocks.gainers || [];
  const losers = stocks.losers || [];
  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some sources unavailable."
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
        Movers konnten nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    const statusHeadline =
      errorCode === "RATE_LIMITED"
        ? "RATE_LIMITED"
        : errorCode === "SCHEMA_INVALID"
          ? "SCHEMA_INVALID"
          : "API error";
    const statusLevel = errorCode === "RATE_LIMITED" ? "PARTIAL" : "FAIL";
    logger?.setStatus(statusLevel, statusHeadline);
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

  if (!gainers.length && !losers.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Movers-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || resolved?.ts,
      source: data.source || "Yahoo",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-native-table-wrap">
      <h4>Stock Movers (Last trading day)</h4>
      <div class="rv-native-split">
        <table class="rv-native-table">
          <thead>
            <tr>
              <th>Gainers</th>
              <th>Price</th>
              <th>Daily %</th>
            </tr>
          </thead>
          <tbody>
            ${gainers
              .map((item) => {
                const changeValue = item.changePercent ?? 0;
                return `
                  <tr>
                    <td>${item.symbol}</td>
                    <td>$${formatNumber(item.price, { maximumFractionDigits: 2 })}</td>
                    <td class="rv-native-positive">${formatNumber(changeValue, { maximumFractionDigits: 2 })}%</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
        <table class="rv-native-table">
          <thead>
            <tr>
              <th>Losers</th>
              <th>Price</th>
              <th>Daily %</th>
            </tr>
          </thead>
          <tbody>
            ${losers
              .map((item) => {
                const changeValue = item.changePercent ?? 0;
                return `
                  <tr>
                    <td>${item.symbol}</td>
                    <td>$${formatNumber(item.price, { maximumFractionDigits: 2 })}</td>
                    <td class="rv-native-negative">${formatNumber(changeValue, { maximumFractionDigits: 2 })}%</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Source: ${data.source || "Yahoo"}
    </div>
    ${data.method ? `<div class="rv-native-note">${data.method}</div>` : ""}
  `;

  const warningCode = resolved?.error?.code || "";
  const hasWarning = resolved?.ok && warningCode;
  const isRateLimited = warningCode === "RATE_LIMITED";
  const headline = resolved?.isStale
    ? isRateLimited
      ? "RATE_LIMITED"
      : "Stale data"
    : isRateLimited
      ? "RATE_LIMITED"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(resolved?.isStale || hasWarning ? "PARTIAL" : "OK", headline);
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "Yahoo",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/top-movers", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-top-movers", traceId, logger } = context;
  const data = await getOrFetch("rv-top-movers", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 60_000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-top-movers", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
