import { fetchJSON } from "./utils/api.js";
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
    const detailLine = [errorCode, upstreamStatus ? `Upstream ${upstreamStatus}` : ""]
      .filter(Boolean)
      .join(" · ");
    root.innerHTML = `
      <div class="rv-native-error">
        Market Health konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", "API error");
    logger?.setMeta({
      updatedAt: payload?.ts,
      source: data?.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
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

  const hasWarning = payload?.ok && payload?.error?.code;
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    payload?.isStale ? "Stale data" : hasWarning ? "Partial data" : "Live"
  );
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "Alternative.me, CoinGecko",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
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
