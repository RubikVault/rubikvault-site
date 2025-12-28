import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function renderPanel(region, items) {
  const rates = items.filter((item) => item.group === "rates");
  const inflation = items.filter((item) => item.group === "inflation");

  if (!rates.length && !inflation.length) {
    return `
      <div class="rv-native-empty">
        Keine Daten für ${region}. (${region} series not configured)
      </div>
    `;
  }

  return `
    <div class="rv-macro-section">
      <h4>Rates</h4>
      <div class="rv-native-grid rv-compact">
        ${rates
          .map((item) => {
            const changeValue = item.change ?? null;
            const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
            return `
              <div class="rv-native-kpi">
                <div class="label">${item.label}</div>
                <div class="value">${formatNumber(item.value, { maximumFractionDigits: 2 })}</div>
                <div class="rv-native-note ${changeClass}">${
                  changeValue === null ? "" : `${formatNumber(changeValue, { maximumFractionDigits: 2 })} vs prior`
                }</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
    <div class="rv-macro-section">
      <h4>Inflation</h4>
      <div class="rv-native-grid rv-compact">
        ${inflation
          .map((item) => {
            const changeValue = item.change ?? null;
            const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
            return `
              <div class="rv-native-kpi">
                <div class="label">${item.label}</div>
                <div class="value">${formatNumber(item.value, { maximumFractionDigits: 2 })}</div>
                <div class="rv-native-note ${changeClass}">${
                  changeValue === null ? "" : `${formatNumber(changeValue, { maximumFractionDigits: 2 })} vs prior`
                }</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderFx(items) {
  if (!items.length) {
    return `
      <div class="rv-native-empty">
        Keine FX-Daten verfügbar.
      </div>
    `;
  }

  return `
    <div class="rv-native-grid rv-compact">
      ${items
        .map((item) => {
          const changeValue = item.changePercent ?? null;
          const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
          return `
            <div class="rv-native-kpi">
              <div class="label">${item.label}</div>
              <div class="value">${formatNumber(item.value, { maximumFractionDigits: 4 })}</div>
              <div class="rv-native-note ${changeClass}">${
                changeValue === null ? "" : `${formatNumber(changeValue, { maximumFractionDigits: 2 })}%`
              }</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const series = Array.isArray(data.series) ? data.series : [];
  const fxSeries = (data.groups?.fx || []).slice();
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";
  const envNote =
    payload?.error?.code === "ENV_MISSING"
      ? "FRED_API_KEY missing — CPI values unavailable."
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

  if (!series.length && !fxSeries.length) {
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

  const tabs = [
    { id: "US", label: "US" },
    { id: "EU", label: "EU" },
    { id: "UK", label: "UK" },
    { id: "JP", label: "JP" },
    { id: "FX", label: "FX" }
  ];

  const panels = tabs
    .map((tab) => {
      if (tab.id === "FX") {
        return `<div class="rv-macro-panel" data-rv-panel="FX">${renderFx(fxSeries)}</div>`;
      }
      const items = series.filter((item) => item.region === tab.id);
      return `<div class="rv-macro-panel" data-rv-panel="${tab.id}">${renderPanel(
        tab.label,
        items
      )}</div>`;
    })
    .join("");

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    ${envNote ? `<div class="rv-native-note">${envNote}</div>` : ""}
    <div class="rv-macro-tabs">
      ${tabs
        .map(
          (tab, index) => `
            <button type="button" class="rv-macro-tab${index === 0 ? " is-active" : ""}" data-rv-tab="${
              tab.id
            }">${tab.label}</button>
          `
        )
        .join("")}
    </div>
    ${panels}
    <div class="rv-native-note">Updated: ${new Date(
      data.updatedAt || payload.ts
    ).toLocaleTimeString()} · Source: ${data.source || "multi"}</div>
  `;

  const tabButtons = Array.from(root.querySelectorAll("[data-rv-tab]"));
  const tabPanels = Array.from(root.querySelectorAll("[data-rv-panel]"));
  const activateTab = (tabId) => {
    tabButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-rv-tab") === tabId);
    });
    tabPanels.forEach((panel) => {
      panel.style.display = panel.getAttribute("data-rv-panel") === tabId ? "block" : "none";
    });
  };

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.getAttribute("data-rv-tab"));
    });
  });
  activateTab("US");

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
  logger?.setStatus(payload?.isStale || hasWarning ? "PARTIAL" : "OK", headline);
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

// Legacy (non-compact) layout helpers preserved for add-only compatibility.
function renderPanelLegacy(region, items) {
  const rates = items.filter((item) => item.group === "rates");
  const inflation = items.filter((item) => item.group === "inflation");

  if (!rates.length && !inflation.length) {
    return `
      <div class="rv-native-empty">
        Keine Daten für ${region}. (${region} series not configured)
      </div>
    `;
  }

  return `
    <div class="rv-macro-section">
      <h4>Rates</h4>
      <div class="rv-native-grid">
        ${rates
          .map((item) => {
            const changeValue = item.change ?? null;
            const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
            return `
              <div class="rv-native-kpi">
                <div class="label">${item.label}</div>
                <div class="value">${formatNumber(item.value, { maximumFractionDigits: 2 })}</div>
                <div class="rv-native-note ${changeClass}">${
                  changeValue === null ? "" : `${formatNumber(changeValue, { maximumFractionDigits: 2 })} vs prior`
                }</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
    <div class="rv-macro-section">
      <h4>Inflation</h4>
      <div class="rv-native-grid">
        ${inflation
          .map((item) => {
            const changeValue = item.change ?? null;
            const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
            return `
              <div class="rv-native-kpi">
                <div class="label">${item.label}</div>
                <div class="value">${formatNumber(item.value, { maximumFractionDigits: 2 })}</div>
                <div class="rv-native-note ${changeClass}">${
                  changeValue === null ? "" : `${formatNumber(changeValue, { maximumFractionDigits: 2 })} vs prior`
                }</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderFxLegacy(items) {
  if (!items.length) {
    return `
      <div class="rv-native-empty">
        Keine FX-Daten verfügbar.
      </div>
    `;
  }

  return `
    <div class="rv-native-grid">
      ${items
        .map((item) => {
          const changeValue = item.changePercent ?? null;
          const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
          return `
            <div class="rv-native-kpi">
              <div class="label">${item.label}</div>
              <div class="value">${formatNumber(item.value, { maximumFractionDigits: 4 })}</div>
              <div class="rv-native-note ${changeClass}">${
                changeValue === null ? "" : `${formatNumber(changeValue, { maximumFractionDigits: 2 })}%`
              }</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}
