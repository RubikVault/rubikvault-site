import { fetchRV } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload) {
  const fng = payload?.fng;
  const btc = payload?.btc;
  const fngValue = fng?.value ?? null;
  const fngLabel = fng?.valueClassification ?? "–";
  const btcPrice = btc?.usd ?? null;
  const btcChange = btc?.usd_24h_change ?? null;
  const btcChangeClass = btcChange >= 0 ? "rv-native-positive" : "rv-native-negative";

  if (!fng && !btc) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Marktdaten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="rv-native-grid">
      <div class="rv-native-kpi">
        <div class="label">Fear &amp; Greed</div>
        <div class="value">${formatNumber(fngValue)}</div>
        <div class="rv-native-note">${fngLabel}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Bitcoin</div>
        <div class="value">$${formatNumber(btcPrice, { maximumFractionDigits: 0 })}</div>
        <div class="rv-native-note ${btcChangeClass}">
          ${formatNumber(btcChange, { maximumFractionDigits: 2 })}% 24h
        </div>
      </div>
    </div>
    <div class="rv-native-note">
      Updated: ${new Date(payload?.updatedAt || Date.now()).toLocaleTimeString()} · Sources: Alternative.me, CoinGecko
    </div>
  `;
}

async function loadData() {
  return fetchRV("/market-health");
}

export async function init(root) {
  const data = await getOrFetch("rv-market-health", loadData, { ttlMs: 60_000 });
  render(root, data);
}

export async function refresh(root) {
  const data = await loadData();
  render(root, data);
}
