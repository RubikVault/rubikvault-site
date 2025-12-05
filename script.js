// Minimal JS: Jahr & "Updated"-Chips setzen + einfache Live-Krypto-Daten.

(function () {
  const yearSpan = document.getElementById("year");
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  const pulseChip = document.getElementById("pulse-updated");
  if (pulseChip) {
    const now = new Date();
    const pad = (n) => (n < 10 ? "0" + n : n);
    pulseChip.textContent =
      "Updated: " +
      pad(now.getHours()) +
      ":" +
      pad(now.getMinutes()) +
      ":" +
      pad(now.getSeconds());
  }

  // --- Live Crypto Snapshot via CoinGecko ---
  const cryptoIds = ["bitcoin", "ethereum", "solana", "avalanche-2"];
  const apiUrl =
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
    cryptoIds.join("%2C") +
    "&vs_currencies=usd&include_24hr_change=true";

  const map = {
    bitcoin: { price: "c-btc-price", change: "c-btc-change" },
    ethereum: { price: "c-eth-price", change: "c-eth-change" },
    solana: { price: "c-sol-price", change: "c-sol-change" },
    "avalanche-2": { price: "c-avax-price", change: "c-avax-change" },
  };

  const cryptoChip = document.getElementById("crypto-updated");

  function formatPrice(value) {
    if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  function formatChange(value) {
    const fixed = value.toFixed(2) + "%";
    return fixed;
  }

  fetch(apiUrl)
    .then((res) => res.json())
    .then((data) => {
      Object.keys(map).forEach((id) => {
        const cfg = map[id];
        const row = data[id];
        if (!row) return;

        const priceEl = document.getElementById(cfg.price);
        const changeEl = document.getElementById(cfg.change);

        if (priceEl) {
          priceEl.textContent = "$" + formatPrice(row.usd);
        }
        if (changeEl) {
          const change = row.usd_24h_change || 0;
          changeEl.textContent = formatChange(change);
          changeEl.classList.remove("pos", "neg");
          if (change > 0.05) {
            changeEl.classList.add("pos");
          } else if (change < -0.05) {
            changeEl.classList.add("neg");
          }
        }
      });

      if (cryptoChip) {
        const now = new Date();
        const pad = (n) => (n < 10 ? "0" + n : n);
        cryptoChip.textContent =
          "Live · " +
          pad(now.getHours()) +
          ":" +
          pad(now.getMinutes());
      }
    })
    .catch(() => {
      if (cryptoChip) {
        cryptoChip.textContent = "API limit / offline – fallback";
      }
    });
})();
