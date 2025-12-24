import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const series = data.series || [];

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
          ? "Fix: Set FRED_API_KEY in Cloudflare Pages environment variables"
          : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Macro & Rates konnten nicht geladen werden.<br />
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

  if (!series.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Macro-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "FRED",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    <div class="rv-native-grid">
      ${series
        .map((item) => {
          const changeValue = item.change ?? null;
          const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
          const changeLabel =
            changeValue === null
              ? ""
              : `${formatNumber(changeValue, { maximumFractionDigits: 2 })} vs prior`;
          return `
            <div class="rv-native-kpi">
              <div class="label">${item.label || item.seriesId}</div>
              <div class="value">${formatNumber(item.value, { maximumFractionDigits: 2 })}</div>
              <div class="rv-native-note ${changeClass}">${changeLabel}</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: FRED</div>
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
    source: data.source || "FRED",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/macro-rates", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-macro-rates", traceId, logger } = context;
  const data = await getOrFetch("rv-macro-rates", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 6 * 60 * 60 * 1000,
    featureId,
    logger
  });
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-macro-rates", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
