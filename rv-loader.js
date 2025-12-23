import { RV_CONFIG, FEATURES, DEBUG_PANIC_MODE } from "./rv-config.js";
import { createLogger, createTraceId } from "./debug/rv-debug.js";
import { applyOverrides } from "./features/utils/flags.js";
import { initFlagsPanel } from "./features/rv-flags-panel.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setLoading(section, isLoading) {
  section.setAttribute("data-rv-loading", isLoading ? "true" : "false");
}

function renderError(contentEl, error) {
  if (!contentEl) return;
  const stack = error?.stack ? escapeHtml(error.stack) : "";
  contentEl.innerHTML = `
    <div class="rv-native-error">
      <strong>Feature konnte nicht geladen werden.</strong><br />
      <span>${escapeHtml(error?.message || "Unbekannter Fehler")}</span>
      ${stack ? `<pre class="rv-native-stack">${stack}</pre>` : ""}
      <button class="rv-native-retry" type="button" data-rv-action="retry">Retry</button>
    </div>
  `;

  const retryButton = contentEl.querySelector('[data-rv-action="retry"]');
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      const section = contentEl.closest("[data-rv-feature]");
      const refreshButton = section?.querySelector('[data-rv-action="refresh"]');
      refreshButton?.click();
    });
  }
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

function initPanicButton() {
  if (!DEBUG_PANIC_MODE || typeof document === "undefined") return;
  const footer = document.querySelector("footer");
  if (!footer) return;
  if (footer.querySelector("[data-rv-panic-restart]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "rv-panic-restart";
  button.setAttribute("data-rv-panic-restart", "true");
  button.textContent = "RESTART (panic)";

  button.addEventListener("click", () => {
    try {
      Object.keys(localStorage || {}).forEach((key) => {
        if (key.startsWith("rv_shadow_")) localStorage.removeItem(key);
      });
    } catch (error) {
      // ignore
    }
    const url = new URL(window.location.href);
    url.searchParams.set("rv_panic", "1");
    window.location.href = url.toString();
  });

  footer.appendChild(button);
}

function resolveFeatures() {
  const list = Array.isArray(FEATURES) ? FEATURES : [];
  return applyOverrides(list);
}

async function loadFeatureModule(feature) {
  if (!feature?.module) throw new Error("Missing feature module");
  return import(feature.module);
}

function getBlockName(section, feature) {
  return (
    section.getAttribute("data-rv-block-name") ||
    feature?.title ||
    section.querySelector("h2")?.textContent ||
    feature?.id ||
    "Unknown Block"
  );
}

async function runFeature(section, feature, logger, contentEl) {
  const traceId = createTraceId();
  logger.setTraceId(traceId);
  setLoading(section, true);

  try {
    const module = await loadFeatureModule(feature);
    const context = {
      featureId: feature.id,
      feature,
      config: RV_CONFIG,
      traceId,
      createTraceId,
      logger,
      root: section.querySelector("[data-rv-root]"),
      content: contentEl,
      section
    };

    if (typeof module.init !== "function") {
      throw new Error("Feature export init() fehlt");
    }

    await module.init(contentEl, context);
    setLoading(section, false);
    return true;
  } catch (error) {
    logger.setStatus("FAIL", "Init failed");
    logger.error("init_error", { message: error?.message || "Unknown error" });
    renderError(contentEl, error);
    setLoading(section, false);
    return false;
  }
}

function bindRefresh(section, feature, logger, contentEl) {
  const refreshButton = section.querySelector('[data-rv-action="refresh"]');
  if (!refreshButton) return;
  const cooldownMs = 30_000;
  let lastRefreshAt = 0;

  refreshButton.addEventListener("click", async () => {
    const now = Date.now();
    if (now - lastRefreshAt < cooldownMs) {
      logger.warn("refresh_cooldown", { cooldownMs });
      return;
    }
    lastRefreshAt = now;
    refreshButton.disabled = true;
    setTimeout(() => {
      refreshButton.disabled = false;
    }, cooldownMs);

    const traceId = createTraceId();
    logger.setTraceId(traceId);
    setLoading(section, true);

    try {
      const module = await loadFeatureModule(feature);
      if (typeof module.refresh === "function") {
        await module.refresh(contentEl, {
          featureId: feature.id,
          feature,
          config: RV_CONFIG,
          traceId,
          createTraceId,
          logger,
          root: section.querySelector("[data-rv-root]"),
          content: contentEl,
          section
        });
      } else if (typeof module.init === "function") {
        await module.init(contentEl, {
          featureId: feature.id,
          feature,
          config: RV_CONFIG,
          traceId,
          createTraceId,
          logger,
          root: section.querySelector("[data-rv-root]"),
          content: contentEl,
          section
        });
      }
      setLoading(section, false);
    } catch (error) {
      logger.setStatus("FAIL", "Refresh failed");
      logger.error("refresh_error", { message: error?.message || "Unknown error" });
      renderError(contentEl, error);
      setLoading(section, false);
    }
  });
}

function startAutoRefresh(section, feature, logger, contentEl) {
  if (!feature?.refreshIntervalMs) return;
  setInterval(async () => {
    const traceId = createTraceId();
    logger.setTraceId(traceId);
    logger.info("auto_refresh", { intervalMs: feature.refreshIntervalMs });
    setLoading(section, true);
    try {
      const module = await loadFeatureModule(feature);
      if (typeof module.refresh === "function") {
        await module.refresh(contentEl, {
          featureId: feature.id,
          feature,
          config: RV_CONFIG,
          traceId,
          createTraceId,
          logger,
          root: section.querySelector("[data-rv-root]"),
          content: contentEl,
          section
        });
      }
      setLoading(section, false);
    } catch (error) {
      logger.setStatus("FAIL", "Auto refresh failed");
      logger.error("auto_refresh_error", { message: error?.message || "Unknown error" });
      renderError(contentEl, error);
      setLoading(section, false);
    }
  }, feature.refreshIntervalMs);
}

function initBlock(section, feature) {
  const root = section.querySelector("[data-rv-root]");
  if (!root) return;
  const featureId = section.getAttribute("data-rv-feature") || feature?.id || "unknown";
  const blockName = getBlockName(section, feature);
  const logger = createLogger({
    featureId,
    blockName,
    rootEl: root,
    panicMode: DEBUG_PANIC_MODE
  });
  const contentEl = logger.getContentEl();

  if (!feature || feature.enabled === false || section.getAttribute("data-rv-disabled") === "true") {
    logger.setStatus("DISABLED", "Disabled");
    logger.setMeta({ source: "config" });
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="rv-native-empty">
          Dieses Feature ist deaktiviert.
        </div>
      `;
    }
    return;
  }

  logger.setStatus("PARTIAL", "Loading");
  bindRefresh(section, feature, logger, contentEl);
  startAutoRefresh(section, feature, logger, contentEl);
  return { logger, contentEl };
}

function boot() {
  const features = resolveFeatures();
  const featureMap = new Map(features.map((feature) => [feature.id, feature]));

  if (DEBUG_PANIC_MODE) {
    RV_CONFIG.DEBUG_PANIC_MODE = true;
  }

  initFlagsPanel({ features });
  initPanicButton();

  if (isDebugEnabled()) {
    const assetPaths = [
      "./rv-loader.js",
      "./features/utils/api.js",
      "./features/utils/store.js",
      "./features/utils/flags.js",
      ...features.map((feature) => feature.module)
    ];
    const importPaths = features.map((feature) => feature.module);
    const apiBase = RV_CONFIG.apiBase || "API";
    const apiPrefix = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
    const apiPaths = features
      .filter((feature) => feature.api)
      .map((feature) => `${apiPrefix}/${feature.api}`);
    apiPaths.unshift(`${apiPrefix}/health`);

    Promise.all([
      import("./debug/diagnostics.js"),
      import("./debug/panel.js")
    ])
      .then(([diagnostics, panel]) => {
        diagnostics.initDiagnostics({ assetPaths, importPaths, apiPaths });
        panel.initDebugPanel();
      })
      .catch(() => {
        initInlineDiagnostics({ assetPaths, importPaths, apiPaths });
      });
  }

  const sections = Array.from(document.querySelectorAll("[data-rv-feature]"));
  const eager = [];
  const lazy = [];

  sections.forEach((section) => {
    const featureId = section.getAttribute("data-rv-feature");
    const feature = featureMap.get(featureId);
    const entry = { section, feature };
    if (feature?.lazyLoad) {
      lazy.push(entry);
    } else {
      eager.push(entry);
    }
  });

  eager.forEach(({ section, feature }) => {
    const initState = initBlock(section, feature);
    if (!initState) return;
    const start = performance.now();
    runFeature(section, feature, initState.logger, initState.contentEl).then((ok) => {
      if (ok) {
        initState.logger.info("loaded", { loadTimeMs: Math.round(performance.now() - start) });
      }
    });
  });

  if (!lazy.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          const featureId = entry.target.getAttribute("data-rv-feature");
          const feature = featureMap.get(featureId);
          const initState = initBlock(entry.target, feature);
          if (!initState) return;
          const start = performance.now();
          runFeature(entry.target, feature, initState.logger, initState.contentEl).then((ok) => {
            if (ok) {
              initState.logger.info("lazy_loaded", {
                loadTimeMs: Math.round(performance.now() - start)
              });
            }
          });
        }
      });
    },
    {
      rootMargin: RV_CONFIG.loader?.rootMargin || "250px 0px 250px 0px",
      threshold: RV_CONFIG.loader?.threshold ?? 0.05
    }
  );

  lazy.forEach(({ section }) => observer.observe(section));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
