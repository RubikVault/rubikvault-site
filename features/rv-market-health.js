import { fetchRV } from "../utils/api.js";
import { getOrFetch } from "../utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${value.toFixed(2)}%`;
}

function render(root, data) {
  const sentiment = data.fng?.valueClassification || "Unknown";
  const sentimentValue = data.fng?.value ?? null;
  const btcPrice = data.btc?.usd ?? null;
  const btcChange = data.btc?.usd_24h_change ?? null;
  const bias = sentimentValue !== null && sentimentValue >= 60 ? "Risk-On" : sentimentValue !== null && sentimentValue <= 40 ? "Risk-Off" : "Neutral";

  root.innerHTML = `
    <div class="rv-native-grid">
      <div class="rv-native-kpi">
        <div class="label">Fear & Greed</div>
        <div class="value">${formatNumber(sentimentValue)}</div>
        <div class="rv-native-note">${sentiment}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">BTC Price</div>
        <div class="value">$${formatNumber(btcPrice, { maximumFractionDigits: 0 })}</div>
        <div class="rv-native-note">24h ${formatPercent(btcChange)}</div>
      </div>
      <div class="rv-native-kpi">
        <div class="label">Bias</div>
        <div class="value">${bias}</div>
        <div class="rv-native-note">Based on free public feeds</div>
      </div>
    </div>
    <div class="rv-native-note">Updated: ${new Date().toLocaleTimeString()}</div>
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
