import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

function formatSentiment(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return value.toFixed(2);
}

// Legacy warning predicate (pre-partial flag).
function isWarningLegacy(payload, data) {
  return data?.status === "WARN" || payload?.isStale || payload?.error?.code;
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.narratives || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const narratives = Array.isArray(data.narratives) ? data.narratives : [];
  const isWarning =
    data.status === "WARN" || data.partial || resolved?.isStale || resolved?.error?.code;
  const partialNote = isWarning
    ? "Partial data — using limited or cached intelligence."
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
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
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

  if (!narratives.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Intelligence-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || resolved?.ts,
      source: data.source || "marketaux",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
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
      Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Source: ${
        data.source || "marketaux"
      }
    </div>
  `;

  const hasWarning = resolved?.ok && resolved?.error?.code;
  const headline = resolved?.isStale
    ? "Stale data"
    : data.status === "WARN"
      ? "Partial data"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(
    resolved?.isStale || data.status === "WARN" || hasWarning ? "PARTIAL" : "OK",
    headline
  );
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "marketaux",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
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
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-news-intelligence", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
