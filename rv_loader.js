import { RV_CONFIG } from "./rv-config.js";

const registry = {
  "rv-market-health": () => import("./features/rv-market-health.js"),
  "rv-price-snapshot": () => import("./features/rv-price-snapshot.js"),
  "rv-top-movers": () => import("./features/rv-top-movers.js"),
  "tradingview-widgets": () => import("./features/tradingview-widgets.js")
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
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "1") return true;
  return Boolean(window.RV_CONFIG?.debug);
}

function emitDebug(detail) {
  if (typeof window === "undefined") return;
  if (!isDebugEnabled()) return;
  window.dispatchEvent(new CustomEvent("rv-debug", { detail }));
}

function initDebugPanel() {
  if (typeof window === "undefined") return;
  if (!isDebugEnabled()) return;
  if (document.getElementById("rv-debug-panel")) return;

  const panel = document.createElement("div");
  panel.id = "rv-debug-panel";
  panel.innerHTML = `
    <div class="rv-debug-header">
      <strong>RubikVault Debug</strong>
      <div class="rv-debug-actions">
        <button type="button" class="rv-debug-refresh">Ping APIs</button>
        <button type="button" class="rv-debug-clear">Clear</button>
        <button type="button" class="rv-debug-copy">Copy</button>
        <button type="button" class="rv-debug-toggle">Hide</button>
      </div>
    </div>
    <div class="rv-debug-meta"></div>
    <div class="rv-debug-body" aria-live="polite"></div>
  `;

  document.body.appendChild(panel);

  const body = panel.querySelector(".rv-debug-body");
  const meta = panel.querySelector(".rv-debug-meta");
  const toggle = panel.querySelector(".rv-debug-toggle");
  const clear = panel.querySelector(".rv-debug-clear");
  const copy = panel.querySelector(".rv-debug-copy");
  const refresh = panel.querySelector(".rv-debug-refresh");

  if (meta) {
    const apiBase = window.RV_CONFIG?.apiBase || "(none)";
    const buildId = window.RV_CONFIG?.buildId || "(unknown)";
    const origin = window.location.origin;
    const path = window.location.pathname;
    meta.innerHTML = `
      <div><strong>build:</strong> <code>${escapeHtml(buildId)}</code></div>
      <div><strong>apiBase:</strong> ${escapeHtml(apiBase)}</div>
      <div><strong>origin:</strong> ${escapeHtml(origin)}</div>
      <div><strong>path:</strong> ${escapeHtml(path)}</div>
    `;
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("is-collapsed");
      toggle.textContent = panel.classList.contains("is-collapsed") ? "Show" : "Hide";
    });
  }

  if (clear) {
    clear.addEventListener("click", () => {
      if (body) body.innerHTML = "";
    });
  }

  if (copy) {
    copy.addEventListener("click", async () => {
      const lines = Array.from(body?.querySelectorAll(".rv-debug-line") || [])
        .map((line) => line.textContent)
        .join("\n");
      try {
        await navigator.clipboard.writeText(lines);
        emitDebug({ type: "info", message: "Logs copied to clipboard" });
      } catch (error) {
        emitDebug({ type: "error", message: "Clipboard copy failed" });
      }
    });
  }

  if (refresh) {
    refresh.addEventListener("click", async () => {
      const endpoints = [
        "/api/market-health",
        "/api/price-snapshot",
        "/api/top-movers",
        "/api/health"
      ];

      await Promise.all(
        endpoints.map(async (endpoint) => {
          emitDebug({ type: "request", url: endpoint, method: "GET" });
          try {
            const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
            const text = await response.text();
            emitDebug({
              type: response.ok ? "success" : "error",
              url: endpoint,
              status: response.status,
              message: text.slice(0, 200)
            });
          } catch (error) {
            emitDebug({
              type: "exception",
              url: endpoint,
              message: error?.message || "Request failed"
            });
          }
        })
      );
    });
  }

  window.addEventListener("rv-debug", (event) => {
    const detail = event.detail || {};
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.className = `rv-debug-line rv-debug-${detail.type || "info"}`;
    line.textContent = `[${time}] ${detail.type || "info"} ${detail.method || ""} ${detail.url || ""} ${
      detail.status ? `(${detail.status})` : ""
    } ${detail.message || ""} ${detail.durationMs ? `(${Math.round(detail.durationMs)}ms)` : ""}`;
    body?.prepend(line);
  });
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
    emitDebug({ type: "info", message: `Init start: ${featureName}` });
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
    emitDebug({ type: "success", message: `Init complete: ${featureName}` });
    setLoading(section, false);

    const refreshButton = section.querySelector('[data-rv-action="refresh"]');
    if (refreshButton) {
      refreshButton.addEventListener("click", async () => {
        try {
          emitDebug({ type: "info", message: `Refresh start: ${featureName}` });
          setLoading(section, true);
          if (typeof module.refresh === "function") {
            await module.refresh(root, context);
          } else if (typeof module.init === "function") {
            await module.init(root, context);
          }
          emitDebug({ type: "success", message: `Refresh complete: ${featureName}` });
          setLoading(section, false);
        } catch (error) {
          emitDebug({ type: "error", message: `Refresh failed: ${featureName}` });
          renderError(section, featureName, error);
          setLoading(section, false);
        }
      });
    }
  } catch (error) {
    emitDebug({ type: "error", message: `Init failed: ${featureName}` });
    renderError(section, featureName, error);
    setLoading(section, false);
  }
}

function boot() {
  initDebugPanel();
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
