import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { rvSetText } from "./rv-dom.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const rows = data.assets || [];
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
        Crypto Snapshot konnte nicht geladen werden.<br />
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

  if (!rows.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Crypto-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="rv-native-note rv-native-warning">WIP: consolidation planned with Market Health.</div>
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-native-grid">
      ${rows
        .map((asset) => {
          const changeValue = asset.changePercent ?? asset.change ?? 0;
          const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
          const label = asset.label || asset.symbol || "Asset";
          const key = String(asset.symbol || label || "asset")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
          return `
            <div class="rv-native-kpi">
              <div class="label">${label}</div>
              <div class="value" data-rv-field="price-${key}">$${formatNumber(asset.price, {
                maximumFractionDigits: 0
              })}</div>
              <div class="rv-native-note ${changeClass}" data-rv-field="change-${key}">${formatNumber(changeValue, {
                maximumFractionDigits: 2
              })}% 24h</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note" data-rv-field="updated-at">
      Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: CoinGecko
    </div>
  `;
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

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
    source: data.source || "CoinGecko",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/crypto-snapshot", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-crypto-snapshot", traceId, logger } = context;
  const data = await getOrFetch("rv-crypto-snapshot", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 120_000,
    featureId,
    logger
  });
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-crypto-snapshot", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
