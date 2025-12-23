import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function render(root, payload, logger) {
  const data = payload?.data || {};

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
        Sentiment konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus(
      errorCode === "RATE_LIMITED" ? "PARTIAL" : "FAIL",
      errorCode === "RATE_LIMITED" ? "RATE_LIMITED" : "API error"
    );
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

  const score = data.score ?? 0;
  const barPercent = Math.max(0, Math.min(100, Math.round(((score + 100) / 200) * 100)));

  root.innerHTML = `
    <div class="rv-sentiment">
      <div class="rv-sentiment-score">
        <strong>${score}</strong>
        <span>${data.label || "Neutral"}</span>
        <span class="rv-native-note">${data.heuristic ? "Heuristic" : "Provider"}</span>
      </div>
      <div class="rv-sentiment-bar">
        <div class="rv-sentiment-bar-fill" style="width: ${barPercent}%;"></div>
      </div>
      <div class="rv-sentiment-drivers">
        ${(data.drivers || [])
          .map(
            (item) => `
            <a href="${item.url}" target="_blank" rel="noopener noreferrer">
              <strong>${item.headline}</strong>
              ${item.summary ? `<span>${item.summary}</span>` : ""}
              <em>${item.source || "news"} · score ${item.score}</em>
            </a>
          `
          )
          .join("")}
      </div>
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
    source: data.source || "news",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/sentiment", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-sentiment-barometer", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-sentiment-barometer",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 15 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-sentiment-barometer", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
