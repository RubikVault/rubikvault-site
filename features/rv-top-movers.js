import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value
  );
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => {
      const stocks = value?.data?.stocks || {};
      return !value?.ok || !(stocks.volumeLeaders || stocks.gainers || []).length;
    },
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const stocks = data?.stocks || {};
  const leaders = stocks.volumeLeaders || stocks.gainers || [];
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

  if (!leaders.length) {
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
      <h4>Volume Top Movers (Last trading day)</h4>
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Symbol</th>
            <th>Volume</th>
            <th>Last Close</th>
            <th>Day %</th>
          </tr>
        </thead>
        <tbody>
          ${leaders
            .map((item) => {
              const changeValue = item.changePercent ?? null;
              const changeClass =
                typeof changeValue === "number" && changeValue >= 0
                  ? "rv-native-positive"
                  : "rv-native-negative";
              return `
                <tr>
                  <td>${item.name || item.symbol}</td>
                  <td>${item.symbol}</td>
                  <td>${formatCompact(item.volume)}</td>
                  <td>$${formatNumber(item.lastClose ?? item.price, { maximumFractionDigits: 2 })}</td>
                  <td class="${changeClass}">${formatNumber(changeValue, {
                    maximumFractionDigits: 2
                  })}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
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
