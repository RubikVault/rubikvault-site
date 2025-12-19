import { fetchRV } from "../utils/api.js";
import { getOrFetch } from "../utils/store.js";

const TOP_MOVERS_URL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=6&page=1&sparkline=false&price_change_percentage=24h";

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${value.toFixed(2)}%`;
}

function render(root, payload) {
  const rows = payload?.items || [];

  root.innerHTML = `
    <div class="rv-native-note">Top 24h movers (free public data).</div>
    <table class="rv-native-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Price</th>
          <th>24h</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const changeClass = row.change >= 0 ? "rv-native-positive" : "rv-native-negative";
            return `
              <tr>
                <td>${row.name}</td>
                <td>$${formatMoney(row.price)}</td>
                <td class="${changeClass}">${formatPercent(row.change)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="rv-native-note">Updated: ${new Date().toLocaleTimeString()} · Source: CoinGecko</div>
  `;
}

async function loadData() {
  const response = await fetchRV(TOP_MOVERS_URL);
  const items = Array.isArray(response)
    ? response.map((item) => ({
        name: item.name,
        price: item.current_price,
        change: item.price_change_percentage_24h
      }))
    : [];

  return { items };
}

export async function init(root) {
  const data = await getOrFetch("rv-top-movers", loadData, { ttlMs: 120_000 });
  render(root, data);
}

export async function refresh(root) {
  const data = await loadData();
  render(root, data);
}
