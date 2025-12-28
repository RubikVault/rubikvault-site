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
      const data = value?.data || {};
      return (
        !value?.ok ||
        !data?.fng ||
        !data?.fngStocks ||
        !(data.crypto || []).length ||
        !(data.indices || []).length ||
        !(data.commodities || []).length
      );
    },
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const fngCrypto = data?.fng;
  const fngStocks = data?.fngStocks;
  const crypto = Array.isArray(data?.crypto) ? data.crypto : [];
  const indices = Array.isArray(data?.indices) ? data.indices : [];
  const commodities = Array.isArray(data?.commodities) ? data.commodities : [];
  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";
  const missingFields =
    !fngCrypto || !fngStocks || !crypto.length || !indices.length || !commodities.length;
  const delayedNote = missingFields ? "Data delayed — some values are unavailable." : "";

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

  if (!fngCrypto && !fngStocks && !crypto.length && !indices.length && !commodities.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Marktdaten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || resolved?.ts,
      source: data.source || "Alternative.me, CoinGecko",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    return;
  }

  const renderGauge = (label, value, classification) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
    const width = safeValue === null ? 0 : safeValue;
    return `
      <div class="rv-health-gauge">
        <div class="rv-health-gauge-head">
          <span>${label}</span>
          <strong>${safeValue === null ? "N/A" : formatNumber(safeValue)}</strong>
        </div>
        <div class="rv-health-gauge-bar">
          <div class="rv-health-gauge-fill" style="width: ${width}%;"></div>
        </div>
        <div class="rv-native-note">${classification || "N/A"}</div>
      </div>
    `;
  };

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    ${delayedNote ? `<div class="rv-native-note">${delayedNote}</div>` : ""}
    <div class="rv-health-grid">
      ${renderGauge("Fear &amp; Greed (Stocks)", fngStocks?.value, fngStocks?.valueClassification)}
      ${renderGauge("Fear &amp; Greed (Crypto)", fngCrypto?.value, fngCrypto?.valueClassification)}
    </div>
    <div class="rv-health-tiles">
      ${crypto
        .map((asset) => {
          const changeValue = asset.changePercent ?? null;
          const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
          return `
            <div class="rv-health-tile">
              <div class="label">${asset.label || asset.symbol}</div>
              <div class="value">$${formatNumber(asset.price, { maximumFractionDigits: 2 })}</div>
              <div class="rv-native-note ${changeClass}">${formatNumber(changeValue, { maximumFractionDigits: 2 })}% 24h</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-health-table-wrap">
      <h4>US Indices</h4>
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Index</th>
            <th>Price</th>
            <th>Daily %</th>
          </tr>
        </thead>
        <tbody>
          ${indices
            .map((item) => {
              const changeClass = item.changePercent >= 0 ? "rv-native-positive" : "rv-native-negative";
              return `
                <tr>
                  <td>${item.label || item.symbol}</td>
                  <td>${formatNumber(item.price, { maximumFractionDigits: 2 })}</td>
                  <td class="${changeClass}">${formatNumber(item.changePercent, { maximumFractionDigits: 2 })}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="rv-health-table-wrap">
      <h4>Commodities</h4>
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>Daily %</th>
          </tr>
        </thead>
        <tbody>
          ${commodities
            .map((item) => {
              const changeClass = item.changePercent >= 0 ? "rv-native-positive" : "rv-native-negative";
              return `
                <tr>
                  <td>${item.label || item.symbol}</td>
                  <td>${formatNumber(item.price, { maximumFractionDigits: 2 })}</td>
                  <td class="${changeClass}">${formatNumber(item.changePercent, { maximumFractionDigits: 2 })}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Sources: ${data.source || "multi"}
    </div>
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
    source: data.source || "multi",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
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
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-market-health", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
