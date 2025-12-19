import { fetchRV } from "../utils/api.js";
import { getOrFetch } from "../utils/store.js";

const SNAPSHOT_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload) {
  const rows = payload?.assets || [];

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
  const response = await fetchRV(SNAPSHOT_URL);
  const assets = [
    { key: "bitcoin", label: "Bitcoin" },
    { key: "ethereum", label: "Ethereum" },
    { key: "solana", label: "Solana" }
  ].map((asset) => {
    const data = response[asset.key] || {};
    return {
      label: asset.label,
      price: data.usd ?? null,
      change: data.usd_24h_change ?? 0
    };
  });

  return { assets };
}

export async function init(root) {
  const data = await getOrFetch("rv-price-snapshot", loadData, { ttlMs: 60_000 });
  render(root, data);
}

export async function refresh(root) {
  const data = await loadData();
  render(root, data);
}
