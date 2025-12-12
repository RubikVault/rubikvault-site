/* =========================================================
   RubikVault - script.js (Vanilla JS, defensive, no breakage)
   ========================================================= */

(function () {
  "use strict";

  // Footer year (safe on all pages)
  const yearEl = document.getElementById("rv-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Header scroll effect (safe - Tabu Zone Logic)
  const header = document.querySelector(".rv-header");
  function onScroll() {
    if (!header) return;
    if (window.scrollY > 10) header.classList.add("rv-header-scrolled");
    else header.classList.remove("rv-header-scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Live ticker (CoinGecko) – only if element exists (FEATURE)
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

      // Formatting helper
      const fmt = (n) =>
        typeof n === "number"
          ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "—";
      
      const changeClass = (ch) => ch >= 0 ? 'color: #10b981;' : 'color: #ef4444;';

      const btc = data?.bitcoin?.usd;
      const btcCh = data?.bitcoin?.usd_24h_change;
      const eth = data?.ethereum?.usd;
      const ethCh = data?.ethereum?.usd_24h_change;
      const sol = data?.solana?.usd;
      const solCh = data?.solana?.usd_24h_change;

      tickerEl.innerHTML =
        `BTC <span style="${changeClass(btcCh)}">$${fmt(btc)} (${fmt(btcCh)}%)</span>  •  ` +
        `ETH <span style="${changeClass(ethCh)}">$${fmt(eth)} (${fmt(ethCh)}%)</span>  •  ` +
        `SOL <span style="${changeClass(solCh)}">$${fmt(sol)} (${fmt(solCh)}%)</span>`;

    } catch (e) {
      tickerEl.textContent = "Live ticker unavailable (retrying in 60s)...";
      console.error("Live Ticker Error:", e);
    }
  }

  // FEATURE 5: Fear & Greed (alternative.me) – with VISUALIZATION update
  const fngContainer = document.getElementById("rv-fng");
  const fngValueText = document.getElementById("rv-fng-value-text");
  const fngBar = document.getElementById("rv-fng-bar");
  const fngPointer = document.getElementById("rv-fng-pointer");

  async function updateFearGreed() {
    if (!fngContainer) return;

    try {
      const url = "https://api.alternative.me/fng/?limit=1&format=json";
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("FNG request failed");
      const data = await res.json();

      const item = data?.data?.[0];
      const value = parseInt(item?.value) ?? 50; // Use 50 as safe fallback
      const cls = item?.value_classification ?? "Neutral";

      let color;
      if (value <= 20) color = '#ef4444'; // Extreme Fear
      else if (value <= 40) color = '#f97316'; // Fear
      else if (value <= 60) color = '#fbbf24'; // Neutral
      else if (value <= 80) color = '#34d399'; // Greed
      else color = '#10b981'; // Extreme Greed

      // Update Text
      if (fngValueText) {
          fngValueText.innerHTML = `${value} • <span style="color: ${color}; font-weight: 600;">${cls}</span>`;
      }
      
      // Update Visualization
      if (fngBar && fngPointer) {
          // The bar is 100% wide. Pointer position is value%. 
          // We apply a small offset to the pointer to keep it centered on the value
          const pointerPosition = Math.min(100, Math.max(0, value));
          
          fngBar.style.width = `${pointerPosition}%`;
          fngBar.style.backgroundColor = color;
          
          fngPointer.style.left = `calc(${pointerPosition}% - 6px)`; // 6px = half the pointer width (12px)
      }


    } catch (e) {
      if (fngValueText) fngValueText.textContent = "Unavailable (retrying in 30min)...";
      console.error("FNG Error:", e);
    }
  }

  // Staggered updates (keep API usage sane)
  updateLiveTicker();
  updateFearGreed();
  // Live ticker update every minute
  setInterval(updateLiveTicker, 60 * 1000); 
  // F&G update every 30 minutes
  setInterval(updateFearGreed, 30 * 60 * 1000); 
})();