import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

const state = {
  weekOffset: 0
};

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

function getWeekRange(offset = 0) {
  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayIndex + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function filterByWeek(items, offset) {
  const { start, end } = getWeekRange(offset);
  return items.filter((item) => {
    const date = new Date(item.date || item.reportDate || "");
    if (Number.isNaN(date.getTime())) return false;
    return date >= start && date <= end;
  });
}

function render(root, payload, logger, featureId) {
  const effectiveFeatureId = featureId || "rv-earnings-calendar";
  const resolved = resolveWithShadow(effectiveFeatureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.items || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const items = data.items || [];
  const formatValue = (value) => (value === null || value === undefined || value === "" ? "N/A" : value);
  const formatTime = (value) => {
    if (!value) return "N/A";
    const normalized = String(value).toUpperCase();
    if (normalized.includes("BMO")) return "BMO";
    if (normalized.includes("AMC")) return "AMC";
    if (normalized.includes("DMH")) return "DMH";
    return normalized;
  };

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

  const filteredItems = filterByWeek(items, state.weekOffset);
  if (!filteredItems.length) {
    const placeholder = {
      symbol: "N/A",
      company: "N/A",
      date: new Date().toISOString().slice(0, 10),
      time: "N/A",
      epsActual: null,
      epsEst: null,
      revenueActual: null,
      revenueEst: null,
      sentiment: "unknown"
    };
    filteredItems.push(placeholder);
  }

  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some entries unavailable."
      : "";

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-earnings-filters">
      <button type="button" data-rv-week="0" class="${
        state.weekOffset === 0 ? "is-active" : ""
      }">This Week</button>
      <button type="button" data-rv-week="1" class="${
        state.weekOffset === 1 ? "is-active" : ""
      }">Next Week</button>
      <button type="button" data-rv-week="2" class="${
        state.weekOffset === 2 ? "is-active" : ""
      }">+2</button>
      <button type="button" data-rv-week="3" class="${
        state.weekOffset === 3 ? "is-active" : ""
      }">+3</button>
    </div>
    <table class="rv-native-table rv-table--compact rv-earnings-compact-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Symbol</th>
          <th>Date</th>
          <th>Time</th>
          <th>EPS</th>
          <th>Revenue</th>
          <th>Sentiment</th>
        </tr>
      </thead>
      <tbody>
        ${filteredItems
          .map((item) => {
            const sentiment = item.sentiment || "unknown";
            const sentimentLabel = sentiment.replace(/_/g, " ");
            const sentimentCls = sentimentClass(sentiment);
            return `
              <tr>
                <td>${formatValue(item.company)}</td>
                <td>${formatValue(item.symbol)}</td>
                <td>${formatValue(item.date)}</td>
                <td>${formatTime(item.time)}</td>
                <td>${formatValue(item.epsActual)} / ${formatValue(item.epsEst)}</td>
                <td>${formatValue(item.revenueActual)} / ${formatValue(item.revenueEst)}</td>
                <td class="${sentimentCls}">${formatValue(sentimentLabel)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="rv-native-note">Data provided by ${data.source || "finnhub"}</div>
  `;

  root.querySelectorAll("[data-rv-week]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = Number(button.getAttribute("data-rv-week"));
      state.weekOffset = Number.isFinite(value) ? value : 0;
      render(root, payload, logger, effectiveFeatureId);
    });
  });

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
    source: data.source || "earnings",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
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
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-earnings-calendar", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}

// Legacy compact-card layout (pre-table) preserved for add-only compatibility.
function renderLegacyCards(items, payload, data) {
  const formatValue = (value) => (value === null || value === undefined || value === "" ? "—" : value);
  const formatTime = (value) => {
    if (!value) return "—";
    const normalized = String(value).toUpperCase();
    if (normalized.includes("BMO")) return "BMO";
    if (normalized.includes("AMC")) return "AMC";
    if (normalized.includes("DMH")) return "DMH";
    return normalized;
  };
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some entries unavailable."
      : "";

  return `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-earnings-list rv-earnings-compact">
      ${items
        .map((item) => {
          const sentiment = item.sentiment || "unknown";
          const sentimentLabel = sentiment.replace(/_/g, " ");
          const sentimentCls = sentimentClass(sentiment);
          return `
            <div class="rv-earnings-card">
              <div class="rv-earnings-head">
                <strong>${formatValue(item.symbol)}</strong>
                <span>${formatValue(item.company)}</span>
              </div>
              <div class="rv-earnings-meta">
                <span>Date: ${formatValue(item.date)}</span>
                <span>Time: ${formatTime(item.time)}</span>
                <span>EPS: ${formatValue(item.epsActual)} / ${formatValue(item.epsEst)} (${formatResult(
            item.epsResult
          )})</span>
                <span>Revenue: ${formatValue(item.revenueActual)} / ${formatValue(
            item.revenueEst
          )} (${formatResult(item.revenueResult)})</span>
                <span class="${sentimentCls}">Sentiment: ${formatValue(sentimentLabel)}</span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">Data provided by ${data?.source || "finnhub"}</div>
  `;
}
