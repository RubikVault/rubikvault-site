import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const regime = data.regime || {};
  const drivers = Array.isArray(regime.drivers) ? regime.drivers : [];
  const partialNote =
    payload?.ok && (payload?.isStale || data.partial || payload?.error?.code)
      ? "Partial data — some signals unavailable."
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
        Market Cockpit konnte nicht geladen werden.<br />
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

  const vix = data.vix || {};
  const fng = data.fngCrypto || {};
  const news = data.newsSentiment || {};
  const proxies = data.proxies || {};

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Regime</span>
        <strong>${regime.label || "Neutral"}</strong>
        <span class="rv-native-note">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-drivers">
        ${drivers.length ? drivers.map((driver) => `<span>${driver}</span>`).join("") : "No drivers yet"}
      </div>
    </div>
    <div class="rv-native-note">Why it matters: regime blends volatility, sentiment, and narrative risk.</div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Signal</th>
          <th>Value</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>VIX</td>
          <td>${formatNumber(vix.value, { maximumFractionDigits: 2 })}</td>
          <td>${vix.note || vix.source || "—"}</td>
        </tr>
        <tr>
          <td>Crypto F&amp;G</td>
          <td>${formatNumber(fng.value)} ${fng.label ? `(${fng.label})` : ""}</td>
          <td>${fng.source || "—"}</td>
        </tr>
        <tr>
          <td>News Sentiment</td>
          <td>${formatNumber(news.score, { maximumFractionDigits: 2 })} ${news.label || ""}</td>
          <td>${news.source || "—"}</td>
        </tr>
        <tr>
          <td>USD (UUP)</td>
          <td>${formatNumber(proxies.usd?.price, { maximumFractionDigits: 2 })}</td>
          <td><span class="rv-pill-proxy">Proxy</span></td>
        </tr>
        <tr>
          <td>Oil (USO)</td>
          <td>${formatNumber(proxies.oil?.price, { maximumFractionDigits: 2 })}</td>
          <td><span class="rv-pill-proxy">Proxy</span></td>
        </tr>
        <tr>
          <td>Gold (GLD)</td>
          <td>${formatNumber(proxies.gold?.price, { maximumFractionDigits: 2 })}</td>
          <td><span class="rv-pill-proxy">Proxy</span></td>
        </tr>
      </tbody>
    </table>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Freshness: ${
        payload?.freshness || "unknown"
      }
    </div>
  `;

  const status = payload?.isStale || data.partial ? "PARTIAL" : "OK";
  logger?.setStatus(status, payload?.isStale ? "Stale data" : data.partial ? "Partial data" : "Live");
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
  return fetchJSON("/market-cockpit", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-market-cockpit", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-market-cockpit",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 15 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-market-cockpit", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
