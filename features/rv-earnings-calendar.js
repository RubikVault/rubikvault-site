import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function render(root, payload, logger) {
  const data = payload?.data || {};
  const items = data.items || [];

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
          ? "Fix: Set EARNINGS_API_KEY in Cloudflare Pages environment variables"
          : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Earnings Calendar konnte nicht geladen werden.<br />
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

  if (!items.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Earnings-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    <div class="rv-earnings-list">
      ${items
        .map(
          (item) => `
            <div class="rv-earnings-card">
              <div class="rv-earnings-head">
                <strong>${item.symbol}</strong>
                <span>${item.company || "Unknown"}</span>
              </div>
              <div class="rv-earnings-meta">
                <span>Date: ${item.date || "--"}</span>
                <span>EPS Est: ${item.epsEst ?? "--"}</span>
                <span>EPS Actual: ${item.epsActual ?? "--"}</span>
              </div>
            </div>
          `
        )
        .join("")}
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
    source: data.source || "earnings",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/earnings-calendar", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-earnings-calendar", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-earnings-calendar",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 300_000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-earnings-calendar", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
