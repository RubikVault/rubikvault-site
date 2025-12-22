import { RV_CONFIG } from "./rv-config.js";

const registry = {
  "rv-market-health": () => import("./features/rv-market-health.js"),
  "rv-price-snapshot": () => import("./features/rv-price-snapshot.js"),
  "rv-top-movers": () => import("./features/rv-top-movers.js")
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

function initDebugPanel() {
  if (typeof window === "undefined") return;
  if (!window.RV_CONFIG?.debug) return;
  if (document.getElementById("rv-debug-panel")) return;

  const panel = document.createElement("div");
  panel.id = "rv-debug-panel";
  panel.innerHTML = `
    <div class="rv-debug-header">
      <strong>Debug</strong>
      <button type="button" class="rv-debug-toggle">Hide</button>
    </div>
    <div class="rv-debug-body" aria-live="polite"></div>
  `;

  document.body.appendChild(panel);

  const body = panel.querySelector(".rv-debug-body");
  const toggle = panel.querySelector(".rv-debug-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      panel.classList.toggle("is-collapsed");
      toggle.textContent = panel.classList.contains("is-collapsed") ? "Show" : "Hide";
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
