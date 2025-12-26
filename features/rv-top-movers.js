import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const crypto = data?.crypto || [];
  const stocks = data?.stocks || {};
  const gainers = stocks.gainers || [];
  const losers = stocks.losers || [];
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some sources unavailable."
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

  if (!crypto.length && !gainers.length && !losers.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Movers-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "CoinGecko",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-native-table-wrap">
      <h4>Crypto Movers</h4>
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>24h</th>
          </tr>
        </thead>
        <tbody>
          ${crypto
            .map((item) => {
              const changeValue = item.changePercent ?? item.change ?? 0;
              const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
              return `
                <tr>
                  <td>${item.symbol || item.name}</td>
                  <td>$${formatNumber(item.price, { maximumFractionDigits: 2 })}</td>
                  <td class="${changeClass}">${formatNumber(changeValue, { maximumFractionDigits: 2 })}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="rv-native-table-wrap">
      <h4>Stock Movers (Mega-cap universe)</h4>
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
      Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: ${data.source || "multi"}
    </div>
    ${data.method ? `<div class="rv-native-note">${data.method}</div>` : ""}
  `;

  const warningCode = payload?.error?.code || "";
  const hasWarning = payload?.ok && warningCode;
  const isRateLimited = warningCode === "RATE_LIMITED";
  const headline = payload?.isStale
    ? isRateLimited
      ? "RATE_LIMITED"
      : "Stale data"
    : isRateLimited
      ? "RATE_LIMITED"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    headline
  );
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "multi",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
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
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-top-movers", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
