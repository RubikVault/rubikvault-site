import { fetchRV } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload) {
  const rows = payload?.assets || [];

  if (!rows.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Snapshot-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="rv-native-grid">
      ${rows
        .map((asset) => {
          const changeClass = asset.change >= 0 ? "rv-native-positive" : "rv-native-negative";
          return `
            <div class="rv-native-kpi">
              <div class="label">${asset.label}</div>
              <div class="value">$${formatNumber(asset.price, { maximumFractionDigits: 0 })}</div>
              <div class="rv-native-note ${changeClass}">${formatNumber(asset.change, { maximumFractionDigits: 2 })}% 24h</div>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note">Updated: ${new Date().toLocaleTimeString()} · Source: CoinGecko</div>
  `;
}

async function loadData() {
  try {
    return await fetchRV("/price-snapshot");
  } catch (error) {
    console.error("Price Snapshot API error:", error);
    throw error;
  }
}

export async function init(root) {
  const data = await getOrFetch("rv-price-snapshot", loadData, { ttlMs: 60_000 });
  render(root, data);
}

export async function refresh(root) {
  const data = await loadData();
  render(root, data);
}
