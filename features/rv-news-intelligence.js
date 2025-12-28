import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatSentiment(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

// Legacy warning predicate (pre-partial flag).
function isWarningLegacy(payload, data) {
  return data?.status === "WARN" || payload?.isStale || payload?.error?.code;
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const narratives = Array.isArray(data.narratives) ? data.narratives : [];
  const isWarning =
    data.status === "WARN" || data.partial || payload?.isStale || payload?.error?.code;
  const partialNote = isWarning
    ? "Partial data — using limited or cached intelligence."
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
        News Intelligence konnte nicht geladen werden.<br />
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

  if (!narratives.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Intelligence-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "marketaux",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-intel-grid">
      ${narratives
        .map((item) => {
          const headline = item.topHeadline;
          return `
            <div class="rv-intel-card">
              <div class="rv-intel-head">
                <strong>${item.title}</strong>
                ${item.breakingRisk ? `<span class="rv-intel-badge">Breaking Risk</span>` : ""}
              </div>
              <div class="rv-intel-meta">
                <span class="rv-intel-sentiment">${item.sentimentLabel}</span>
                <span>${formatSentiment(item.sentimentAvg)}</span>
                <span>Intensity ${item.intensity ?? 0}</span>
              </div>
              ${
                headline
                  ? `<a class="rv-intel-headline" href="${headline.url}" target="_blank" rel="noopener noreferrer">
                      ${headline.title}
                      <span>${headline.source || "marketaux"} · ${new Date(
                        headline.publishedAt || ""
                      ).toLocaleTimeString()}</span>
                    </a>`
                  : `<div class="rv-intel-headline">Keine Headlines verfügbar.</div>`
              }
              <div class="rv-intel-why">${item.whyItMatters || ""}</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: ${
        data.source || "marketaux"
      }
    </div>
  `;

  const hasWarning = payload?.ok && payload?.error?.code;
  const headline = payload?.isStale
    ? "Stale data"
    : data.status === "WARN"
      ? "Partial data"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(payload?.isStale || data.status === "WARN" || hasWarning ? "PARTIAL" : "OK", headline);
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "marketaux",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/news-intelligence", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-news-intelligence", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-news-intelligence",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-news-intelligence", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
