// script.js – TradingView widgets initialisation for RubikVault

function initTradingViewWidgets() {
  // Safety-check: tv.js ist evtl. noch nicht geladen
  if (typeof TradingView === "undefined") {
    setTimeout(initTradingViewWidgets, 500);
    return;
  }

  // 1) Laufende Zeile ganz oben (Ticker Strip)
  try {
    new TradingView.widget({
      container_id: "tv-ticker-tape-header",
      width: "100%",
      height: 32,
      autosize: true,
      symbols: [
        { description: "S&P 500", proName: "SP:SPX" },
        { description: "Nasdaq 100", proName: "NASDAQ:NDX" },
        { description: "VIX", proName: "CBOE:VIX" },
        { description: "Bitcoin", proName: "CRYPTOCAP:BTC" },
        { description: "Ether", proName: "CRYPTOCAP:ETH" }
      ],
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "regular",
      locale: "en"
    });
  } catch (e) {
    console.warn("Ticker tape init failed:", e);
  }

  // 2) Mini-Chart im Hero (z. B. BTC)
  try {
    new TradingView.widget({
      container_id: "tv-mini-chart",
      autosize: true,
      symbol: "CRYPTOCAP:BTC",
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_top_toolbar: true,
      hide_legend: true,
      hide_side_toolbar: true,
      withdateranges: false,
      allow_symbol_change: false,
      save_image: false
    });
  } catch (e) {
    console.warn("Mini chart init failed:", e);
  }

  // 3) Cross-asset Market Overview im Bereich „Market Pulse“
  try {
    new TradingView.MarketOverview({
      container_id: "tv-market-overview",
      width: "100%",
      height: 430,
      locale: "en",
      colorTheme: "dark",
      dateRange: "12M",
      showChart: true,
      showSymbolLogo: true,
      isTransparent: false,
      plotLineColorGrowing: "#22c55e",
      plotLineColorFalling: "#f97373",
      gridLineColor: "rgba(55, 65, 81, 0.6)",
      scaleFontColor: "#9ca3af",
      belowLineFillColorGrowing: "rgba(34, 197, 94, 0.16)",
      belowLineFillColorFalling: "rgba(248, 113, 113, 0.16)",
      symbolActiveColor: "rgba(37, 99, 235, 0.45)",
      tabs: [
        {
          title: "Indices",
          symbols: [
            { s: "SP:SPX", d: "S&P 500" },
            { s: "NASDAQ:NDX", d: "Nasdaq 100" },
            { s: "DJI:DJI", d: "Dow Jones" },
            { s: "CME_MINI:RTY1!", d: "Russell 2000" }
          ]
        },
        {
          title: "Crypto",
          symbols: [
            { s: "CRYPTOCAP:BTC", d: "Bitcoin" },
            { s: "CRYPTOCAP:ETH", d: "Ethereum" },
            { s: "BINANCE:SOLUSDT", d: "Solana" },
            { s: "BINANCE:AVAXUSDT", d: "Avalanche" }
          ]
        }
      ]
    });
  } catch (e) {
    console.warn("Market overview init failed:", e);
  }
}

// Start, sobald DOM steht – tv.js wird per defer geladen
window.addEventListener("DOMContentLoaded", function () {
  initTradingViewWidgets();
});