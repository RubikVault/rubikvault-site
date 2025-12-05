// RubikVault front-end script
// Initialises TradingView widgets once the DOM and tv.js are loaded.

window.addEventListener("DOMContentLoaded", () => {
  // Guard: tv.js not loaded or TradingView not available
  if (typeof TradingView === "undefined") {
    console.warn("TradingView library not loaded – widgets skipped.");
    return;
  }

  // ----- Ticker tape (indices + crypto) -----
  try {
    new TradingView.widget({
      container_id: "tv-ticker-tape",
      width: "100%",
      height: 44,
      symbols: [
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
        { proName: "CME_MINI:ES1!", title: "S&P Futures" },
        { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
        { proName: "BITSTAMP:ETHUSD", title: "Ethereum" },
        { proName: "TVC:DXY", title: "US Dollar Index" }
      ],
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en"
    });
  } catch (e) {
    console.warn("Error initialising ticker tape widget:", e);
  }

  // ----- Main chart / cross-asset view -----
  try {
    new TradingView.widget({
      container_id: "tv-market-overview",
      width: "100%",
      height: 420,
      symbol: "FOREXCOM:SPXUSD",
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#050711",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      enable_publishing: false,
      withdateranges: true,
      allow_symbol_change: true,
      details: true,
      hotlist: true,
      calendar: false
    });
  } catch (e) {
    console.warn("Error initialising main TradingView widget:", e);
  }
});
