import { RV_CONFIG } from "./rv-config.js";

const registry = {
  "rv-market-health": () => import("/features/rv-market-health.js"),
  "rv-price-snapshot": () => import("/features/rv-price-snapshot.js"),
  "rv-top-movers": () => import("/features/rv-top-movers.js"),
  "tradingview-widgets": () => import("/features/tradingview-widgets.js")
};

function setLoading(section, isLoading) {
  section.setAttribute("data-rv-loading", isLoading ? "true" : "false");
  const root = section.querySelector("[data-rv-root]");
  if (root) root.hidden = isLoading;
}

function renderError(section, featureName, error) {
  const root = section.querySelector("[data-rv-root]");
  if (!root) return;
  root.innerHTML = `
    <div class="rv-native-error">
      <strong>Feature konnte nicht geladen werden:</strong> ${featureName}<br />
      <span>${escapeHtml(error.message || "Unbekannter Fehler")}</span>
      <button class="rv-native-retry" type="button" data-rv-action="retry">Retry</button>
    </div>
  `;
  const retryButton = root.querySelector('[data-rv-action="retry"]');
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      const refreshButton = section.querySelector('[data-rv-action="refresh"]');
      if (refreshButton) refreshButton.click();
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  if (!RV_CONFIG.DEBUG_ENABLED) return false;
  const params = new URLSearchParams(window.location.search);
  const activated =
    params.get("debug") === "1" || window.localStorage?.getItem("debug") === "true";
  if (!activated) return false;
  if (RV_CONFIG.debugAuthToken) {
    return window.localStorage?.getItem("debugAuth") === RV_CONFIG.debugAuthToken;
  }
  return true;
}

const INLINE_DIAGNOSTICS_ID = "rv-inline-diagnostics";

function isHtmlFallback(contentType, preview) {
  if (contentType && contentType.includes("text/html")) return true;
  const trimmed = String(preview || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function createInlineDiagnosticsPanel() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(INLINE_DIAGNOSTICS_ID);
  if (existing) return existing;

  const panel = document.createElement("div");
  panel.id = INLINE_DIAGNOSTICS_ID;
  panel.innerHTML = `
    <div class="rv-inline-header">
      <strong>RubikVault Diagnostics (Fallback)</strong>
      <div class="rv-inline-actions">
        <button type="button" data-action="refresh">Run checks</button>
        <button type="button" data-action="copy">Copy JSON</button>
        <button type="button" data-action="toggle">Hide</button>
      </div>
    </div>
    <div class="rv-inline-meta"></div>
    <pre class="rv-inline-body"></pre>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #${INLINE_DIAGNOSTICS_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: min(520px, 94vw);
      max-height: 70vh;
      z-index: 999999;
      background: rgba(2, 6, 23, 0.95);
      color: #e2e8f0;
      font-family: "Inter", system-ui, sans-serif;
      border: 1px solid rgba(148, 163, 184, 0.3);
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.6);
      padding: 12px;
      display: grid;
      gap: 8px;
    }

    #${INLINE_DIAGNOSTICS_ID}.is-collapsed .rv-inline-meta,
    #${INLINE_DIAGNOSTICS_ID}.is-collapsed .rv-inline-body {
      display: none;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    #${INLINE_DIAGNOSTICS_ID} button {
      border: 1px solid rgba(148, 163, 184, 0.4);
      background: rgba(15, 23, 42, 0.7);
      color: inherit;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      cursor: pointer;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-meta {
      font-size: 11px;
      color: #94a3b8;
      display: grid;
      gap: 4px;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-body {
      margin: 0;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: auto;
      max-height: 48vh;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);

  return panel;
}

function initInlineDiagnostics({ assetPaths, importPaths, apiPaths }) {
  const panel = createInlineDiagnosticsPanel();
  if (!panel) return;

  const meta = panel.querySelector(".rv-inline-meta");
  const body = panel.querySelector(".rv-inline-body");
  const state = {
    lastRun: null,
    errors: []
  };

  const setMeta = () => {
    if (!meta) return;
    meta.innerHTML = `
      <div><strong>URL:</strong> ${escapeHtml(window.location.href)}</div>
      <div><strong>Build:</strong> ${escapeHtml(RV_CONFIG.buildId || "(unknown)")}</div>
      <div><strong>apiBase:</strong> ${escapeHtml(RV_CONFIG.apiBase || "(none)")}</div>
    `;
  };

  const renderBody = (payload) => {
    if (!body) return;
    body.textContent = JSON.stringify(payload, null, 2);
  };

  const recordError = (error) => {
    state.errors.unshift({
      ts: new Date().toISOString(),
      message: error?.message || String(error || "")
    });
  };

  window.addEventListener("error", (event) => {
    recordError(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordError(event.reason || "Unhandled rejection");
  });

  const runChecks = async () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      assets: [],
      imports: [],
      apis: [],
      errors: state.errors
    };

    for (const path of assetPaths) {
      const entry = {
        path,
        status: 0,
        contentType: "",
        cfCacheStatus: "",
        preview: "",
        htmlFallback: false
      };
      try {
        const response = await fetch(path, { cache: "no-store" });
        entry.status = response.status;
        entry.contentType = response.headers.get("content-type") || "";
        entry.cfCacheStatus = response.headers.get("cf-cache-status") || "";
        const text = await response.text();
        entry.preview = text.slice(0, 160);
        entry.htmlFallback = isHtmlFallback(entry.contentType, entry.preview);
      } catch (error) {
        entry.preview = error?.message || "Fetch failed";
      }
      payload.assets.push(entry);
    }

    for (const path of importPaths) {
      const started = performance.now();
      try {
        await import(path);
        payload.imports.push({
          path,
          ok: true,
          durationMs: Math.round(performance.now() - started)
        });
      } catch (error) {
        payload.imports.push({
          path,
          ok: false,
          durationMs: Math.round(performance.now() - started),
          error: error?.message || "Import failed"
        });
      }
    }

    for (const path of apiPaths) {
      const started = performance.now();
      const entry = {
        path,
        status: 0,
        contentType: "",
        cfCacheStatus: "",
        preview: "",
        htmlFallback: false,
        durationMs: 0
      };
      try {
        const response = await fetch(path, { headers: { Accept: "application/json" } });
        entry.status = response.status;
        entry.contentType = response.headers.get("content-type") || "";
        entry.cfCacheStatus = response.headers.get("cf-cache-status") || "";
        const text = await response.text();
        entry.preview = text.slice(0, 160);
        entry.htmlFallback = isHtmlFallback(entry.contentType, entry.preview);
      } catch (error) {
        entry.preview = error?.message || "Fetch failed";
      } finally {
        entry.durationMs = Math.round(performance.now() - started);
      }
      payload.apis.push(entry);
    }

    state.lastRun = payload.generatedAt;
    renderBody(payload);
    setMeta();
  };

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle") {
      panel.classList.toggle("is-collapsed");
      button.textContent = panel.classList.contains("is-collapsed") ? "Show" : "Hide";
    }
    if (action === "copy") {
      const text = body?.textContent || "";
      navigator.clipboard.writeText(text);
    }
    if (action === "refresh") {
      runChecks();
    }
  });

  runChecks();
}

async function initFeature(section) {
  const featureName = section.getAttribute("data-rv-feature");
  if (!featureName || !registry[featureName]) return;

  if (RV_CONFIG.features && RV_CONFIG.features[featureName] === false) return;
  if (section.getAttribute("data-rv-disabled") === "true") return;

  const root = section.querySelector("[data-rv-root]");
  if (!root) return;

  setLoading(section, true);

  try {
    const module = await registry[featureName]();
    if (typeof module.init !== "function") {
      throw new Error("Feature export init() fehlt");
    }

    const context = {
      featureName,
      config: RV_CONFIG,
      root,
      section,
      refresh: () => module.refresh?.(root, context)
    };

    await module.init(root, context);
    setLoading(section, false);

    const refreshButton = section.querySelector('[data-rv-action="refresh"]');
    if (refreshButton) {
      refreshButton.addEventListener("click", async () => {
        try {
          setLoading(section, true);
          if (typeof module.refresh === "function") {
            await module.refresh(root, context);
          } else if (typeof module.init === "function") {
            await module.init(root, context);
          }
          setLoading(section, false);
        } catch (error) {
          renderError(section, featureName, error);
          setLoading(section, false);
        }
      });
    }
  } catch (error) {
    renderError(section, featureName, error);
    setLoading(section, false);
  }
}

function boot() {
  if (isDebugEnabled()) {
    const assetPaths = [
      "./rv-loader.js",
      "./features/utils/api.js",
      "./features/utils/store.js",
      ...Object.keys(registry).map((name) => `./features/${name}.js`)
    ];
    const importPaths = [
      "./features/rv-price-snapshot.js",
      "./features/rv-market-health.js",
      "./features/rv-top-movers.js"
    ];
    const apiBase = RV_CONFIG.apiBase || "API";
    const apiPaths = [
      `${apiBase}/health`,
      `${apiBase}/market-health`,
      `${apiBase}/price-snapshot`,
      `${apiBase}/top-movers`
    ];

    Promise.all([
      import("./debug/diagnostics.js"),
      import("./debug/panel.js")
    ]).then(([diagnostics, panel]) => {
      diagnostics.initDiagnostics({ assetPaths, importPaths, apiPaths });
      panel.initDebugPanel();
    }).catch(() => {
      initInlineDiagnostics({ assetPaths, importPaths, apiPaths });
    });
  }
  const sections = Array.from(document.querySelectorAll("[data-rv-feature]"));
  const eager = [];
  const lazy = [];

  sections.forEach((section) => {
    const priority = section.getAttribute("data-rv-priority") || "low";
    if (priority === "high") {
      eager.push(section);
    } else {
      lazy.push(section);
    }
  });

  eager.forEach(initFeature);

  if (!lazy.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          initFeature(entry.target);
        }
      });
    },
    {
      rootMargin: RV_CONFIG.loader?.rootMargin || "250px 0px 250px 0px",
      threshold: RV_CONFIG.loader?.threshold ?? 0.05
    }
  );

  lazy.forEach((section) => observer.observe(section));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
