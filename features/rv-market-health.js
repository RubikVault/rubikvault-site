import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const fng = data?.fng;
  const btc = data?.btc;
  const fngValue = fng?.value ?? null;
  const fngLabel = fng?.valueClassification ?? "–";
  const btcPrice = btc?.usd ?? null;
  const btcChange = btc?.usd_24h_change ?? null;
  const btcChangeClass = btcChange >= 0 ? "rv-native-positive" : "rv-native-negative";

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
        Market Health konnte nicht geladen werden.<br />
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

  if (!fng && !btc) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Marktdaten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "Alternative.me, CoinGecko",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    <div class="rv-native-grid">
      <div class="rv-native-kpi">
        <div class="label">Fear &amp; Greed</div>
        <div class="value">${formatNumber(fngValue)}</div>
        <div class="rv-native-note">${fngLabel}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Bitcoin</div>
        <div class="value">$${formatNumber(btcPrice, { maximumFractionDigits: 0 })}</div>
        <div class="rv-native-note ${btcChangeClass}">
          ${formatNumber(btcChange, { maximumFractionDigits: 2 })}% 24h
        </div>
      </div>
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Sources: Alternative.me, CoinGecko
    </div>
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
    source: data.source || "Alternative.me, CoinGecko",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/market-health", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-market-health", traceId, logger } = context;
  const data = await getOrFetch("rv-market-health", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 60_000,
    featureId,
    logger
  });
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-market-health", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
