const API_URL = "/api/metrics?v=5";
const UI_LAYOUTS_URL = "/config/ui-layouts.json";
const UI_STORAGE_KEY = "rv.ui";
const VALID_UIS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const FALLBACK_LAYOUTS = {
  layouts: {
    A: {
      name: "Executive Bento",
      sectionsOrder: ["Header", "Signals", "Groups"],
      groupsRender: "bento",
      metricRender: "card",
      groupStyle: "bentoGrid"
    },
    B: {
      name: "Classic Cards",
      sectionsOrder: ["Header", "Groups", "Signals"],
      groupsRender: "cards",
      metricRender: "card",
      groupStyle: "section"
    },
    C: {
      name: "Dense Table",
      sectionsOrder: ["Header", "Groups", "Signals"],
      groupsRender: "table",
      metricRender: "row",
      groupStyle: "tableSection"
    },
    D: {
      name: "Two-Column Analyst",
      sectionsOrder: ["Header", "Signals", "Groups"],
      groupsRender: "twoColumn",
      metricRender: "card",
      groupStyle: "twoCol"
    },
    E: {
      name: "Signals-First Inbox",
      sectionsOrder: ["Header", "Signals", "Groups"],
      groupsRender: "compact",
      metricRender: "cardCompact",
      groupStyle: "accordion"
    },
    F: {
      name: "Minimal KPI Strip",
      sectionsOrder: ["Header", "Groups", "Signals"],
      groupsRender: "kpiStrip",
      metricRender: "kpi",
      groupStyle: "strip"
    },
    G: {
      name: "Dashboard Tiles",
      sectionsOrder: ["Header", "Groups", "Signals"],
      groupsRender: "tiles",
      metricRender: "tile",
      groupStyle: "tileGrid"
    },
    H: {
      name: "Print-Friendly Report",
      sectionsOrder: ["Header", "Signals", "Groups"],
      groupsRender: "report",
      metricRender: "row",
      groupStyle: "reportSection"
    }
  }
};

let cachedEnvelope = null;
let cachedPromise = null;
let cachedLayouts = null;
let cachedLayoutsPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchEnvelope() {
  if (typeof window !== "undefined") {
    window.__RV_METRICS_FETCH_COUNT = (window.__RV_METRICS_FETCH_COUNT || 0) + 1;
  }
  const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = null;
  }
  if (!payload || typeof payload !== "object") {
    return {
      meta: {
        status: "ERROR",
        requestId: "client",
        asOf: nowIso(),
        generatedAt: nowIso(),
        ageSeconds: 0,
        version: "5.0",
        source: { primary: "client", fallbackUsed: false },
        cache: { hit: false, ttlSeconds: 0, kvAvailable: false },
        circuitOpen: true,
        missingMetricIds: [],
        metricsCount: 0,
        groupsCount: 0
      },
      data: null,
      error: { code: "SCHEMA_INVALID", message: "Invalid JSON response", details: null }
    };
  }
  return payload;
}

async function fetchLayouts() {
  const response = await fetch(UI_LAYOUTS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const text = await response.text();
  try {
    const payload = text ? JSON.parse(text) : null;
    if (payload && payload.layouts) return payload;
  } catch (error) {
    return null;
  }
  return null;
}

async function loadEnvelope(force = false) {
  if (!force && cachedEnvelope) return cachedEnvelope;
  if (!force && cachedPromise) return cachedPromise;
  cachedPromise = fetchEnvelope()
    .then((payload) => {
      cachedEnvelope = payload;
      return payload;
    })
    .finally(() => {
      cachedPromise = null;
    });
  return cachedPromise;
}

async function loadLayouts() {
  if (cachedLayouts) return cachedLayouts;
  if (cachedLayoutsPromise) return cachedLayoutsPromise;
  cachedLayoutsPromise = fetchLayouts()
    .then((payload) => {
      cachedLayouts = payload;
      return payload;
    })
    .finally(() => {
      cachedLayoutsPromise = null;
    });
  return cachedLayoutsPromise;
}

function getQueryUi() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("ui");
  const normalized = value ? String(value).toUpperCase() : "";
  return VALID_UIS.includes(normalized) ? normalized : null;
}

function getStoredUi() {
  try {
    const value = window.localStorage?.getItem(UI_STORAGE_KEY);
    const normalized = value ? String(value).toUpperCase() : "";
    return VALID_UIS.includes(normalized) ? normalized : null;
  } catch (error) {
    return null;
  }
}

function setStoredUi(value) {
  try {
    const normalized = value ? String(value).toUpperCase() : "";
    window.localStorage?.setItem(UI_STORAGE_KEY, normalized);
  } catch (error) {
    // ignore
  }
}

function resolveUi(envelope) {
  const queryUi = getQueryUi();
  if (queryUi) return queryUi;
  const stored = getStoredUi();
  if (stored) return stored;
  const defaultUi = envelope?.data?.uiDefaults?.defaultUi;
  return VALID_UIS.includes(defaultUi) ? defaultUi : "A";
}

function updateQueryUi(value) {
  const url = new URL(window.location.href);
  url.searchParams.set("ui", value);
  window.history.replaceState({}, "", url.toString());
}

function formatValue(metric) {
  if (!metric) return "--";
  if (metric.valueType === "label" || metric.valueType === "dataset") {
    return metric.value || "--";
  }
  const value = safeNumber(metric.value);
  if (value === null) return "--";
  const unit = metric.unit;
  if (unit === "%") {
    const digits = Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0;
    return `${value.toFixed(digits)}%`;
  }
  if (unit === "bp") return `${Math.round(value)} bp`;
  if (unit === "index") {
    const digits = Math.abs(value) < 100 ? 2 : 1;
    return value.toFixed(digits);
  }
  if (unit === "count") return `${Math.round(value)}`;
  if (unit === "ratio") return value.toFixed(2);
  if (unit === "usd") {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }
  if (unit === "usd/oz" || unit === "usd/bbl" || unit === "usd/mt") {
    return `$${value.toFixed(2)}`;
  }
  if (unit === "gwei") return `${value.toFixed(1)} gwei`;
  return `${value}`;
}

function formatChange(value) {
  if (value === null || value === undefined) return "--";
  const num = safeNumber(value);
  if (num === null) return "--";
  const sign = num > 0 ? "+" : "";
  const digits = Math.abs(num) < 1 ? 2 : 1;
  return `${sign}${num.toFixed(digits)}`;
}

function parseRotationDataset(value) {
  if (!value || typeof value !== "string") return null;
  const [topRaw, flopRaw] = value.split("|");
  const parseSide = (raw) => {
    if (!raw) return [];
    const [, list] = raw.split(":");
    if (!list) return [];
    return list.split(",").map((entry) => entry.trim()).filter(Boolean);
  };
  return {
    top: parseSide(topRaw),
    flop: parseSide(flopRaw)
  };
}

function sparklineSVG(points, width = 90, height = 28) {
  if (!Array.isArray(points) || points.length < 2) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((value, idx) => {
    const x = idx * step;
    const y = height - ((value - min) / span) * height;
    return `${x},${y}`;
  });
  return `
    <svg class="rv-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${coords.join(" ")}" />
    </svg>
  `;
}

function metricAriaLabel(metric, formatted) {
  if (!metric) return "Metric unavailable";
  return `${metric.label}: ${formatted} ${metric.unit}, as of ${metric.asOf}`;
}

function renderMetricCard(metric, { compact = false, variant = "" } = {}) {
  if (!metric) {
    return `<div class="rv-metrics-card is-missing ${variant}">-- (unavailable)</div>`;
  }
  const formatted = formatValue(metric);
  const change = metric.valueType === "number" ? formatChange(metric.change?.d1) : "--";
  const rotation =
    metric.valueType === "dataset" ? parseRotationDataset(metric.value) : null;
  const rotationHtml = rotation
    ? `
      <div class="rv-metrics-rotation">
        <div><strong>Top:</strong> ${rotation.top.join(", ") || "--"}</div>
        <div><strong>Flop:</strong> ${rotation.flop.join(", ") || "--"}</div>
      </div>
    `
    : "";
  return `
    <div class="rv-metrics-card ${compact ? "is-compact" : ""} ${variant}" aria-label="${metricAriaLabel(metric, formatted)}">
      <div class="rv-metrics-card-head">
        <div class="rv-metrics-label">${metric.label}</div>
        ${metric.display?.badgeText ? `<span class="rv-metrics-badge">${metric.display.badgeText}</span>` : ""}
      </div>
      <div class="rv-metrics-value">${formatted}</div>
      ${rotationHtml || `<div class="rv-metrics-sub">${change}</div>`}
      ${sparklineSVG(metric.spark)}
      <div class="rv-metrics-meta">As of ${metric.asOf}</div>
    </div>
  `;
}

function renderMetricRow(metric) {
  if (!metric) {
    return `
      <tr class="is-missing">
        <td colspan="4">-- (unavailable)</td>
      </tr>
    `;
  }
  const formatted = formatValue(metric);
  const change = metric.valueType === "number" ? formatChange(metric.change?.d1) : "--";
  const rotation =
    metric.valueType === "dataset" ? parseRotationDataset(metric.value) : null;
  const rotationText = rotation
    ? `Top: ${rotation.top.join(", ") || "--"} | Flop: ${rotation.flop.join(", ") || "--"}`
    : "";
  return `
    <tr aria-label="${metricAriaLabel(metric, formatted)}">
      <td>${metric.label}</td>
      <td>${formatted}</td>
      <td>${rotation ? rotationText : change}</td>
      <td>${metric.asOf}</td>
    </tr>
  `;
}

function renderGroupSection(group, metricsById, layout) {
  const metrics = group.metricIds.map((id) => metricsById[id] || null);
  const groupClass = layout.groupStyle ? ` ${layout.groupStyle}` : "";
  if (layout.metricRender === "row") {
    return `
      <section class="rv-metrics-group${groupClass}">
        <h3>${group.title}</h3>
        <div class="rv-metrics-table-wrap">
          <table class="rv-metrics-table">
            <thead>
              <tr><th>Metric</th><th>Value</th><th>Change</th><th>As of</th></tr>
            </thead>
            <tbody>
              ${metrics.map(renderMetricRow).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
  const variant =
    layout.metricRender === "tile"
      ? "is-tile"
      : layout.metricRender === "kpi"
        ? "is-kpi"
        : "";
  const compact = layout.metricRender === "cardCompact";
  return `
    <section class="rv-metrics-group${groupClass}">
      <h3>${group.title}</h3>
      <div class="rv-metrics-grid">
        ${metrics.map((metric) => renderMetricCard(metric, { compact, variant })).join("")}
      </div>
    </section>
  `;
}

function renderSignals(signals = []) {
  if (!signals.length) {
    return `<div class="rv-metrics-empty">No active signals.</div>`;
  }
  return `
    <div class="rv-metrics-signals">
      ${signals
        .map(
          (signal) => `
        <div class="rv-metrics-signal ${signal.severity}">
          <div class="rv-metrics-signal-title">${signal.title}</div>
          <div class="rv-metrics-signal-body">${signal.message}</div>
          ${signal.actionText ? `<div class="rv-metrics-signal-action">${signal.actionText}</div>` : ""}
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function renderHeader(envelope, layout, ui) {
  const meta = envelope?.meta || {};
  const status = meta.status || "ERROR";
  const layoutName = layout?.name || "Layout";
  return `
    <div class="rv-metrics-header">
      <div>
        <div class="rv-metrics-title">Metrics Dashboard</div>
        <div class="rv-metrics-subtitle">${layoutName} - UI ${ui}</div>
      </div>
      <div class="rv-metrics-meta-block">
        <span class="rv-metrics-status ${status.toLowerCase()}">${status}</span>
        <span>As of ${meta.asOf || "--"}</span>
        <span>${meta.metricsCount || 0}/43 metrics</span>
        <span>${meta.groupsCount || 0}/9 groups</span>
      </div>
    </div>
  `;
}

function renderUiSwitcher(active, available = VALID_UIS) {
  return `
    <div class="rv-metrics-switcher" role="tablist" aria-label="UI variations">
      ${available
        .map(
          (ui) => `
        <button type="button" role="tab" aria-selected="${ui === active}" data-ui="${ui}" class="${ui === active ? "is-active" : ""}">
          UI ${ui}
        </button>
      `
        )
        .join("")}
    </div>
  `;
}

function renderDebugOverlay(envelope, ui) {
  const meta = envelope?.meta || {};
  const missingCount = Array.isArray(meta.missingMetricIds) ? meta.missingMetricIds.length : 0;
  return `
    <div class="rv-metrics-debug" aria-live="polite">
      <button type="button" class="rv-metrics-debug-toggle" data-debug-toggle>Debug</button>
      <div class="rv-metrics-debug-panel">
        <div><strong>ui:</strong> ${ui}</div>
        <div><strong>status:</strong> ${meta.status || "--"}</div>
        <div><strong>asOf:</strong> ${meta.asOf || "--"}</div>
        <div><strong>generatedAt:</strong> ${meta.generatedAt || "--"}</div>
        <div><strong>ageSeconds:</strong> ${meta.ageSeconds ?? "--"}</div>
        <div><strong>requestId:</strong> ${meta.requestId || "--"}</div>
        <div><strong>metricsCount:</strong> ${meta.metricsCount ?? "--"}</div>
        <div><strong>missingCount:</strong> ${missingCount}</div>
        <div><strong>kvAvailable:</strong> ${meta.cache?.kvAvailable ? "true" : "false"}</div>
        <div><strong>circuitOpen:</strong> ${meta.circuitOpen ? "true" : "false"}</div>
        <div><strong>cache.hit:</strong> ${meta.cache?.hit ? "true" : "false"}</div>
      </div>
    </div>
  `;
}

function renderGroups(envelope, layout) {
  const data = envelope?.data || {};
  const groups = Array.isArray(data.groups) ? data.groups.slice() : [];
  groups.sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!groups.length) {
    return `<div class="rv-metrics-empty">No groups available.</div>`;
  }

  if (layout.groupsRender === "twoColumn") {
    const left = [];
    const right = [];
    groups.forEach((group, idx) => {
      (idx % 2 === 0 ? left : right).push(renderGroupSection(group, data.metricsById || {}, layout));
    });
    return `
      <div class="rv-metrics-two-col">
        <div>${left.join("")}</div>
        <div>${right.join("")}</div>
      </div>
    `;
  }

  if (layout.groupsRender === "compact") {
    return groups
      .map(
        (group) => `
        <details class="rv-metrics-accordion">
          <summary>${group.title}</summary>
          ${renderGroupSection(group, data.metricsById || {}, layout)}
        </details>
      `
      )
      .join("");
  }

  return groups
    .map((group) => renderGroupSection(group, data.metricsById || {}, layout))
    .join("");
}

function renderDashboard(root, envelope, ui, layouts) {
  const uiLayout = layouts?.layouts?.[ui] || FALLBACK_LAYOUTS.layouts[ui] || {};
  const sections = uiLayout.sectionsOrder || ["Header", "Groups", "Signals"];
  const data = envelope?.data || {};
  const header = renderHeader(envelope, uiLayout, ui);
  const signals = renderSignals(data.signals || []);
  const groups = renderGroups(envelope, uiLayout);
  const switcher = renderUiSwitcher(ui, data.uiDefaults?.availableUis || VALID_UIS);

  const sectionMap = {
    Header: header,
    Signals: signals,
    Groups: groups
  };

  root.innerHTML = `
    <div class="rv-metrics-dashboard ui-${ui}">
      ${switcher}
      ${sections.map((section) => sectionMap[section] || "").join("")}
      ${renderDebugOverlay(envelope, ui)}
    </div>
  `;
}

function bindInteractions(root, envelope, onUiChange) {
  const switcher = root.querySelector(".rv-metrics-switcher");
  if (switcher) {
    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-ui]");
      if (!button) return;
      const nextUi = button.getAttribute("data-ui");
      if (!VALID_UIS.includes(nextUi)) return;
      updateQueryUi(nextUi);
      setStoredUi(nextUi);
      onUiChange(nextUi);
    });
  }

  const toggle = root.querySelector("[data-debug-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      root.querySelector(".rv-metrics-debug")?.classList.toggle("is-open");
    });
  }
}

function renderError(root, envelope) {
  const error = envelope?.error || {};
  root.innerHTML = `
    <div class="rv-metrics-error">
      Metrics dashboard unavailable.
      <div class="rv-metrics-error-meta">${error.code || "ERROR"} ${error.message || ""}</div>
    </div>
    ${renderDebugOverlay(envelope, "A")}
  `;
}

async function renderFeature(root, { force = false } = {}) {
  root.innerHTML = `<div class="rv-metrics-loading">Loading metrics...</div>`;
  const [envelope, layouts] = await Promise.all([loadEnvelope(force), loadLayouts()]);
  if (!envelope?.meta || envelope.meta.status === "ERROR" || !envelope?.data) {
    renderError(root, envelope);
    return;
  }
  const ui = resolveUi(envelope);
  renderDashboard(root, envelope, ui, layouts);
  bindInteractions(root, envelope, (nextUi) => {
    renderDashboard(root, envelope, nextUi, layouts);
    bindInteractions(root, envelope, () => {});
  });
}

export async function init(root, context) {
  const { featureId, logger } = context || {};
  try {
    await renderFeature(root);
    logger?.setStatus("LIVE", "OK");
  } catch (error) {
    logger?.setStatus("FAIL", "Render failed");
    root.innerHTML = `<div class="rv-metrics-error">Render failed.</div>`;
  }
}

export async function refresh(root, context) {
  const { logger } = context || {};
  try {
    await renderFeature(root, { force: true });
    logger?.setStatus("LIVE", "OK");
  } catch (error) {
    logger?.setStatus("FAIL", "Refresh failed");
    root.innerHTML = `<div class="rv-metrics-error">Refresh failed.</div>`;
  }
}
