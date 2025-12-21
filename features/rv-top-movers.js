import { fetchRV } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function render(root, payload) {
  const items = payload?.items || [];

  if (!items.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Movers-Daten verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <table class="rv-native-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Price</th>
          <th>24h</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((item) => {
            const changeClass = item.change >= 0 ? "rv-native-positive" : "rv-native-negative";
            return `
              <tr>
                <td>${item.name}</td>
                <td>$${formatNumber(item.price, { maximumFractionDigits: 2 })}</td>
                <td class="${changeClass}">${formatNumber(item.change, { maximumFractionDigits: 2 })}%</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="rv-native-note">
      Updated: ${new Date(payload?.updatedAt || Date.now()).toLocaleTimeString()} · Source: CoinGecko
    </div>
  `;
}

async function loadData() {
  return fetchRV("/top-movers");
}

export async function init(root) {
  const data = await getOrFetch("rv-top-movers", loadData, { ttlMs: 60_000 });
  render(root, data);
}

export async function refresh(root) {
  const data = await loadData();
  render(root, data);
}
