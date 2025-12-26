import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatResult(result) {
  if (!result) return "n/a";
  return result;
}

function sentimentClass(label) {
  if (!label) return "";
  if (label.includes("positive")) return "rv-native-positive";
  if (label.includes("negative")) return "rv-native-negative";
  if (label === "mixed") return "rv-native-warning";
  return "";
}

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
          ? "Fix: Set FINNHUB_API_KEY in Cloudflare Pages environment variables"
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

  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some entries unavailable."
      : "";

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-earnings-list">
      ${items
        .map((item) => {
          const sentiment = item.sentiment || "unknown";
          const sentimentLabel = sentiment.replace(/_/g, " ");
          const sentimentCls = sentimentClass(sentiment);
          return `
            <div class="rv-earnings-card">
              <div class="rv-earnings-head">
                <strong>${item.symbol}</strong>
                <span>${item.company || "Unknown"}</span>
              </div>
              <div class="rv-earnings-meta">
                <span>Date: ${item.date || "--"}</span>
                <span>Time: ${item.time || "--"}</span>
                <span>EPS: ${item.epsActual ?? "--"} / ${item.epsEst ?? "--"} (${formatResult(
            item.epsResult
          )})</span>
                <span>Revenue: ${item.revenueActual ?? "--"} / ${item.revenueEst ?? "--"} (${formatResult(
            item.revenueResult
          )})</span>
                <span class="${sentimentCls}">Sentiment: ${sentimentLabel}</span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">Data provided by ${data.source || "finnhub"}</div>
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
    { ttlMs: 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-earnings-calendar", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
