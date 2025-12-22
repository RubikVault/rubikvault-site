import {
  clearCachesAndReload,
  getDebugLink,
  getDiagnosticsPayload,
  getSnapshot,
  getSummary,
  hardReload,
  subscribe,
  toMarkdown
} from "./diagnostics.js";
import { formatBytes, sanitizeString } from "./utils.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "build", label: "Build" },
  { id: "assets", label: "Assets" },
  { id: "imports", label: "Dynamic Imports" },
  { id: "apis", label: "APIs" },
  { id: "network", label: "Network" },
  { id: "errors", label: "Errors" },
  { id: "cache", label: "Cache / Cloudflare" },
  { id: "performance", label: "Performance" }
];

export function initDebugPanel() {
  if (typeof document === "undefined") return;
  if (document.querySelector("rv-debug-panel")) return;

  const panel = document.createElement("rv-debug-panel");
  const shadow = panel.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: min(520px, 94vw);
        max-height: 78vh;
        z-index: 999999;
        font-family: "Inter", system-ui, sans-serif;
        color: #e2e8f0;
      }

      .panel {
        background: rgba(2, 6, 23, 0.96);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 12px;
        box-shadow: 0 18px 40px rgba(2, 6, 23, 0.6);
        display: grid;
        grid-template-rows: auto auto auto 1fr;
        gap: 8px;
        padding: 12px;
      }

      .panel.is-collapsed .body,
      .panel.is-collapsed .tabs,
      .panel.is-collapsed .actions {
        display: none;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      .header strong {
        font-size: 14px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      button {
        border: 1px solid rgba(148, 163, 184, 0.4);
        background: rgba(15, 23, 42, 0.7);
        color: #e2e8f0;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 11px;
        cursor: pointer;
      }

      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .tab {
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.6);
      }

      .tab.is-active {
        border-color: rgba(56, 189, 248, 0.6);
        color: #38bdf8;
      }

      .body {
        overflow: auto;
        max-height: 48vh;
        display: grid;
        gap: 8px;
        font-size: 12px;
      }

      .section {
        border: 1px solid rgba(148, 163, 184, 0.15);
        border-radius: 10px;
        padding: 8px;
        background: rgba(15, 23, 42, 0.6);
      }

      .section h4 {
        margin: 0 0 6px;
        font-size: 12px;
        color: #93c5fd;
      }

      .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }

      .muted {
        color: #94a3b8;
      }

      .pill {
        border-radius: 999px;
        padding: 2px 6px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }

      .error {
        color: #f87171;
      }

      .success {
        color: #4ade80;
      }

      pre {
        margin: 6px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 11px;
        color: #e2e8f0;
      }
    </style>
    <div class="panel">
      <div class="header">
        <strong>RubikVault Diagnostics</strong>
        <div class="actions">
          <button data-action="copy">Copy Full Diagnostics</button>
          <button data-action="download">Download JSON</button>
          <button data-action="markdown">Copy Markdown</button>
          <button data-action="debug-link">Copy Debug Link</button>
          <button data-action="clear-cache">Clear cache & reload</button>
          <button data-action="hard-reload">Hard reload</button>
          <button data-action="toggle">Hide</button>
        </div>
      </div>
      <div class="tabs"></div>
      <div class="body"></div>
    </div>
  `;

  document.body.appendChild(panel);

  const panelRoot = shadow.querySelector(".panel");
  const tabsEl = shadow.querySelector(".tabs");
  const bodyEl = shadow.querySelector(".body");

  function setActiveTab(tabId) {
    shadow.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === tabId);
    });
    render(tabId, getSnapshot());
  }

  tabsEl.innerHTML = TABS.map(
    (tab) => `<button class="tab" data-tab="${tab.id}">${tab.label}</button>`
  ).join("");

  tabsEl.addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (button) {
      setActiveTab(button.dataset.tab);
    }
  });

  shadow.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle") {
      panelRoot.classList.toggle("is-collapsed");
      button.textContent = panelRoot.classList.contains("is-collapsed") ? "Show" : "Hide";
    }
    if (action === "copy") {
      const payload = getDiagnosticsPayload();
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    }
    if (action === "download") {
      const payload = getDiagnosticsPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "rubikvault-diagnostics.json";
      link.click();
      URL.revokeObjectURL(url);
    }
    if (action === "markdown") {
      const payload = getDiagnosticsPayload();
      navigator.clipboard.writeText(toMarkdown(payload));
    }
    if (action === "debug-link") {
      navigator.clipboard.writeText(getDebugLink());
    }
    if (action === "clear-cache") {
      clearCachesAndReload();
    }
    if (action === "hard-reload") {
      hardReload();
    }
  });

  const unsubscribe = subscribe((snapshot) => {
    const activeTab = shadow.querySelector(".tab.is-active")?.dataset.tab || "overview";
    render(activeTab, snapshot);
  });

  window.addEventListener("beforeunload", unsubscribe);
  setActiveTab("overview");
}

function render(tabId, snapshot) {
  const bodyEl = document.querySelector("rv-debug-panel")?.shadowRoot?.querySelector(".body");
  if (!bodyEl) return;
  bodyEl.innerHTML = "";
  if (!snapshot?.enabled) {
    bodyEl.innerHTML = `<div class="section">Debug disabled.</div>`;
    return;
  }
  if (tabId === "overview") {
    renderOverview(bodyEl, snapshot);
  } else if (tabId === "build") {
    renderBuild(bodyEl, snapshot);
  } else if (tabId === "assets") {
    renderAssets(bodyEl, snapshot);
  } else if (tabId === "imports") {
    renderImports(bodyEl, snapshot);
  } else if (tabId === "apis") {
    renderApis(bodyEl, snapshot);
  } else if (tabId === "network") {
    renderNetwork(bodyEl, snapshot);
  } else if (tabId === "errors") {
    renderErrors(bodyEl, snapshot);
  } else if (tabId === "cache") {
    renderCache(bodyEl, snapshot);
  } else if (tabId === "performance") {
    renderPerformance(bodyEl, snapshot);
  }
}

function renderOverview(root, snapshot) {
  const summary = getSummary();
  root.innerHTML = `
    <div class="section">
      <h4>Status Summary</h4>
      <div class="row"><span>Asset HTML fallbacks</span><span class="pill">${summary.assetErrors}</span></div>
      <div class="row"><span>Import errors</span><span class="pill">${summary.importErrors}</span></div>
      <div class="row"><span>API errors</span><span class="pill">${summary.apiErrors}</span></div>
      <div class="row"><span>Runtime errors</span><span class="pill">${summary.errors}</span></div>
    </div>
    <div class="section">
      <h4>Environment</h4>
      <div class="row"><span class="muted">URL</span><span>${sanitizeString(snapshot.environment?.url || "")}</span></div>
      <div class="row"><span class="muted">User Agent</span><span>${sanitizeString(snapshot.environment?.userAgent || "")}</span></div>
      <div class="row"><span class="muted">Viewport</span><span>${snapshot.environment?.viewport || ""}</span></div>
      <div class="row"><span class="muted">Navigation</span><span>${snapshot.environment?.navigation || ""}</span></div>
    </div>
    <div class="section">
      <h4>Warnings</h4>
      <pre>${sanitizeString(JSON.stringify(snapshot.warnings || [], null, 2))}</pre>
    </div>
  `;
}

function renderBuild(root, snapshot) {
  root.innerHTML = `
    <div class="section">
      <h4>Build Info</h4>
      <pre>${sanitizeString(JSON.stringify(snapshot.buildInfo || {}, null, 2))}</pre>
    </div>
  `;
}

function renderAssets(root, snapshot) {
  const rows = snapshot.assetChecks || [];
  root.innerHTML = rows
    .map(
      (asset) => `
        <div class="section">
          <h4>${sanitizeString(asset.url)}</h4>
          <div class="row"><span>Status</span><span>${asset.status}</span></div>
          <div class="row"><span>Content-Type</span><span>${sanitizeString(asset.contentType)}</span></div>
          <div class="row"><span>cf-cache-status</span><span>${sanitizeString(asset.cfCacheStatus)}</span></div>
          <div class="row"><span>HTML fallback</span><span class="${asset.htmlFallback ? "error" : "success"}">${asset.htmlFallback}</span></div>
          <div class="row"><span>Syntax</span><span class="${asset.syntaxOk ? "success" : "error"}">${asset.syntaxOk}</span></div>
          <pre>${sanitizeString(asset.preview || "")}</pre>
        </div>
      `
    )
    .join("");
}

function renderImports(root, snapshot) {
  const rows = snapshot.importChecks || [];
  root.innerHTML = rows
    .map(
      (item) => `
        <div class="section">
          <h4>${sanitizeString(item.path)}</h4>
          <div class="row"><span>Status</span><span class="${item.ok ? "success" : "error"}">${item.ok}</span></div>
          <div class="row"><span>Duration</span><span>${item.durationMs}ms</span></div>
          <pre>${sanitizeString(item.error || "")}</pre>
        </div>
      `
    )
    .join("");
}

function renderApis(root, snapshot) {
  const rows = snapshot.apiChecks || [];
  root.innerHTML = rows
    .map(
      (item) => `
        <div class="section">
          <h4>${sanitizeString(item.path)}</h4>
          <div class="row"><span>Status</span><span>${item.status}</span></div>
          <div class="row"><span>Content-Type</span><span>${sanitizeString(item.contentType || "")}</span></div>
          <div class="row"><span>cf-cache-status</span><span>${sanitizeString(item.cfCacheStatus || "")}</span></div>
          <div class="row"><span>HTML fallback</span><span class="${item.htmlFallback ? "error" : "success"}">${item.htmlFallback}</span></div>
          <div class="row"><span>Empty payload</span><span class="${item.emptyPayload ? "error" : "success"}">${item.emptyPayload}</span></div>
          <pre>${sanitizeString(item.preview || item.error || "")}</pre>
        </div>
      `
    )
    .join("");
}

function renderNetwork(root, snapshot) {
  const rows = snapshot.networkLogs || [];
  root.innerHTML = rows
    .map(
      (item) => `
        <div class="section">
          <h4>${sanitizeString(item.url || "")}</h4>
          <div class="row"><span>Type</span><span>${item.type}</span></div>
          <div class="row"><span>Status</span><span>${item.status || "–"}</span></div>
          <div class="row"><span>Duration</span><span>${item.durationMs ? `${item.durationMs}ms` : "–"}</span></div>
          <div class="row"><span>HTML fallback</span><span class="${item.htmlFallback ? "error" : "success"}">${item.htmlFallback || false}</span></div>
          <pre>${sanitizeString(item.preview || item.message || "")}</pre>
        </div>
      `
    )
    .join("");
}

function renderErrors(root, snapshot) {
  const rows = snapshot.errors || [];
  root.innerHTML = rows.length
    ? rows
        .map(
          (item) => `
            <div class="section">
              <h4>${sanitizeString(item.type || "error")}</h4>
              <div class="row"><span>Message</span><span>${sanitizeString(item.message || "")}</span></div>
              <div class="row"><span>File</span><span>${sanitizeString(item.file || "")}</span></div>
              <div class="row"><span>Line</span><span>${item.line || "–"}</span></div>
              <pre>${sanitizeString(item.stack || "")}</pre>
            </div>
          `
        )
        .join("")
    : `<div class="section">No errors captured.</div>`;
}

function renderCache(root, snapshot) {
  const cache = snapshot.cacheInfo || {};
  const sw = cache.serviceWorkers || [];
  const caches = cache.caches || [];
  root.innerHTML = `
    <div class="section">
      <h4>Service Workers</h4>
      <pre>${sanitizeString(JSON.stringify(sw, null, 2))}</pre>
    </div>
    <div class="section">
      <h4>Caches</h4>
      <pre>${sanitizeString(JSON.stringify(caches, null, 2))}</pre>
    </div>
  `;
}

function renderPerformance(root, snapshot) {
  const perf = snapshot.performance || {};
  root.innerHTML = `
    <div class="section">
      <h4>Performance</h4>
      <div class="row"><span>LCP</span><span>${perf.lcp ? `${perf.lcp.toFixed(0)}ms` : "–"}</span></div>
      <div class="row"><span>CLS</span><span>${perf.cls ? perf.cls.toFixed(3) : "–"}</span></div>
      <div class="row"><span>TTFB</span><span>${perf.ttfb ? `${perf.ttfb.toFixed(0)}ms` : "–"}</span></div>
      <div class="row"><span>DCL</span><span>${perf.domContentLoaded ? `${perf.domContentLoaded.toFixed(0)}ms` : "–"}</span></div>
      <div class="row"><span>Load</span><span>${perf.loadEvent ? `${perf.loadEvent.toFixed(0)}ms` : "–"}</span></div>
    </div>
  `;
}
