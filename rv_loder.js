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
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
