import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const sectors = Array.isArray(data.sectors) ? data.sectors : [];
  const groups = data.groups || {};
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some sectors unavailable."
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
    const fixHint =
      errorCode === "BINDING_MISSING"
        ? getBindingHint(payload)
        : errorCode === "ENV_MISSING"
          ? "Fix: Set FMP_API_KEY in Cloudflare Pages environment variables"
          : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Sector Rotation konnte nicht geladen werden.<br />
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
    <div class="rv-native-note">Rotation: <strong>${data.rotationLabel || "Neutral"}</strong></div>
    <div class="rv-native-grid rv-compact">
      <div class="rv-native-kpi">
        <div class="label">Offensive Avg</div>
        <div class="value">${formatNumber(groups.offensive, { maximumFractionDigits: 2 })}%</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Defensive Avg</div>
        <div class="value">${formatNumber(groups.defensive, { maximumFractionDigits: 2 })}%</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Cyclical Avg</div>
        <div class="value">${formatNumber(groups.cyclical, { maximumFractionDigits: 2 })}%</div>
      </div>
    </div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Sector ETF</th>
          <th>Price</th>
          <th>Change %</th>
        </tr>
      </thead>
      <tbody>
        ${sectors
          .map((sector) => {
            const changeClass =
              typeof sector.changePercent === "number" && sector.changePercent >= 0
                ? "rv-native-positive"
                : "rv-native-negative";
            return `
              <tr>
                <td>${sector.symbol}</td>
                <td>${formatNumber(sector.price, { maximumFractionDigits: 2 })}</td>
                <td class="${changeClass}">${formatNumber(sector.changePercent, { maximumFractionDigits: 2 })}%</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()}</div>
    <div class="rv-native-note"><a href="#rv-sp500-sectors">Open Sector Performance Table (Block 13)</a></div>
  `;

  const status = payload?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, payload?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: "FMP",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/sector-rotation", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-sector-rotation", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-sector-rotation",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 30 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-sector-rotation", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
