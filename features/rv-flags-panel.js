import { getOverrides, setOverride, clearOverrides, getOverrideCount } from "./utils/flags.js";

const PANEL_ID = "rv-flags-panel";

function buildPanel(featureList) {
  const wrapper = document.createElement("div");
  wrapper.id = PANEL_ID;
  wrapper.className = "rv-flags-panel";

  wrapper.innerHTML = `
    <div class="rv-flags-header">
      <strong>Feature Flags</strong>
      <span class="rv-flags-count" data-rv-flags-count>0 overrides</span>
      <button type="button" data-rv-flags-toggle>Hide</button>
    </div>
    <div class="rv-flags-body">
      <div class="rv-flags-actions">
        <button type="button" data-rv-flags-reset>Reset overrides</button>
        <button type="button" data-rv-flags-reload>Reload</button>
      </div>
      <div class="rv-flags-list" data-rv-flags-list></div>
    </div>
  `;

  const list = wrapper.querySelector("[data-rv-flags-list]");
  if (list) {
    list.innerHTML = featureList
      .map(
        (feature) => `
          <label class="rv-flags-item">
            <span>${feature.title || feature.id}</span>
            <input type="checkbox" data-rv-flag="${feature.id}" />
          </label>
        `
      )
      .join("");
  }

  return wrapper;
}

function updateCounts(wrapper) {
  const countEl = wrapper.querySelector("[data-rv-flags-count]");
  if (countEl) {
    const count = getOverrideCount();
    countEl.textContent = `${count} override${count === 1 ? "" : "s"}`;
  }
}

function syncCheckboxes(wrapper, featureList) {
  const overrides = getOverrides();
  const featureMap = new Map(featureList.map((feature) => [feature.id, feature]));
  wrapper.querySelectorAll("[data-rv-flag]").forEach((input) => {
    const featureId = input.getAttribute("data-rv-flag");
    if (!featureId) return;
    if (overrides.hasOwnProperty(featureId)) {
      input.checked = Boolean(overrides[featureId]);
      input.dataset.rvOverridden = "true";
    } else {
      input.checked = featureMap.get(featureId)?.enabled !== false;
      input.dataset.rvOverridden = "false";
    }
  });
}

export function initFlagsPanel({ features = [] } = {}) {
  if (typeof document === "undefined") return;
  const footer = document.querySelector("footer");
  if (!footer) return;

  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = buildPanel(features);
    footer.appendChild(panel);
  }

  const toggleButton = panel.querySelector("[data-rv-flags-toggle]");
  const resetButton = panel.querySelector("[data-rv-flags-reset]");
  const reloadButton = panel.querySelector("[data-rv-flags-reload]");

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      panel.classList.toggle("is-collapsed");
      toggleButton.textContent = panel.classList.contains("is-collapsed") ? "Show" : "Hide";
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      clearOverrides();
      syncCheckboxes(panel, features);
      updateCounts(panel);
    });
  }

  if (reloadButton) {
    reloadButton.addEventListener("click", () => {
      window.location.reload();
    });
  }

  panel.addEventListener("change", (event) => {
    const input = event.target.closest("[data-rv-flag]");
    if (!input) return;
    const featureId = input.getAttribute("data-rv-flag");
    if (!featureId) return;
    setOverride(featureId, input.checked);
    updateCounts(panel);
  });

  syncCheckboxes(panel, features);
  updateCounts(panel);
}
