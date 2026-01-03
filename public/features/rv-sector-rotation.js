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
      const sectors = value?.data?.sectors || [];
      return !value?.ok || !sectors.length;
    },
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const sectors = Array.isArray(data.sectors) ? data.sectors : [];
  const groups = data.groups || {};
  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some sectors unavailable."
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
    const fixHint =
      errorCode === "BINDING_MISSING"
        ? getBindingHint(resolved)
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

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-native-note">Rotation: <strong data-rv-field="rotation-label">${data.rotationLabel || "Neutral"}</strong></div>
    <div class="rv-native-grid rv-compact">
      <div class="rv-native-kpi">
        <div class="label">Offensive Avg</div>
        <div class="value" data-rv-field="offensive-avg">${formatNumber(groups.offensive, { maximumFractionDigits: 2 })}%</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Defensive Avg</div>
        <div class="value" data-rv-field="defensive-avg">${formatNumber(groups.defensive, { maximumFractionDigits: 2 })}%</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Cyclical Avg</div>
        <div class="value" data-rv-field="cyclical-avg">${formatNumber(groups.cyclical, { maximumFractionDigits: 2 })}%</div>
      </div>
    </div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Sector ETF</th>
          <th>Price</th>
          <th>Change %</th>
          <th>Rel vs SPY</th>
        </tr>
      </thead>
      <tbody>
        ${sectors
          .map((sector) => {
            const changeClass =
              typeof sector.changePercent === "number" && sector.changePercent >= 0
                ? "rv-native-positive"
                : "rv-native-negative";
            const relClass =
              typeof sector.relativeToSpy === "number" && sector.relativeToSpy >= 0
                ? "rv-native-positive"
                : "rv-native-negative";
            return `
              <tr>
                <td>${sector.symbol}</td>
                <td>${formatNumber(sector.price, { maximumFractionDigits: 2 })}</td>
                <td class="${changeClass}">${formatNumber(sector.changePercent, { maximumFractionDigits: 2 })}%</td>
                <td class="${relClass}">${formatNumber(sector.relativeToSpy, { maximumFractionDigits: 2 })}%</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()}</div>
    <div class="rv-native-note"><a href="#rv-sp500-sectors">Open Sector Performance Table (Block 13)</a></div>
  `;

  const status = resolved?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, resolved?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "FMP",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
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
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-sector-rotation", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
