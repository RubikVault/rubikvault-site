/* =========================================================
   RubikVault - script.js (Vanilla JS, defensive, no breakage)
   ========================================================= */

(function () {
  "use strict";

  // Footer year (safe on all pages)
  const yearEl = document.getElementById("rv-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Header scroll effect (safe)
  const header = document.querySelector(".rv-header");
  function onScroll() {
    if (!header) return;
    if (window.scrollY > 10) header.classList.add("rv-header-scrolled");
    else header.classList.remove("rv-header-scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Live ticker (CoinGecko) – only if element exists
  const tickerEl = document.getElementById("rv-live-ticker");
  async function updateLiveTicker() {
    if (!tickerEl) return;

    try {
      // Keep it simple + reliable: BTC/ETH/SOL in USD
      const url =
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";

      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("CoinGecko request failed");
      const data = await res.json();

      const fmt = (n) =>
        typeof n === "number"
          ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : "—";

      const btc = data?.bitcoin?.usd;
      const btcCh = data?.bitcoin?.usd_24h_change;
      const eth = data?.ethereum?.usd;
      const ethCh = data?.ethereum?.usd_24h_change;
      const sol = data?.solana?.usd;
      const solCh = data?.solana?.usd_24h_change;

      tickerEl.textContent =
        `BTC $${fmt(btc)} (${fmt(btcCh)}%)  •  ` +
        `ETH $${fmt(eth)} (${fmt(ethCh)}%)  •  ` +
        `SOL $${fmt(sol)} (${fmt(solCh)}%)`;
    } catch (e) {
      tickerEl.textContent = "Live ticker unavailable (retrying)…";
    }
  }

  // Fear & Greed (alternative.me) – only if element exists
  const fngEl = document.getElementById("rv-fng");
  async function updateFearGreed() {
    if (!fngEl) return;

    try {
      const url = "https://api.alternative.me/fng/?limit=1&format=json";
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("FNG request failed");
      const data = await res.json();

      const item = data?.data?.[0];
      const value = item?.value ?? "—";
      const cls = item?.value_classification ?? "—";

      fngEl.textContent = `Index: ${value} • ${cls}`;
    } catch (e) {
      fngEl.textContent = "Fear & Greed unavailable (retrying)…";
    }
  }

  // Staggered updates (keep API usage sane)
  updateLiveTicker();
  updateFearGreed();
  setInterval(updateLiveTicker, 60 * 1000);
  setInterval(updateFearGreed, 30 * 60 * 1000);
})();