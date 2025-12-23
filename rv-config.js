export const DEBUG_PANIC_MODE = false;

export const FEATURES = [
  {
    id: "rv-market-health",
    title: "Block 01 - Market Health",
    module: "./features/rv-market-health.js",
    api: "market-health",
    enabled: true,
    lazyLoad: false
  },
  {
    id: "rv-price-snapshot",
    title: "Block 02 - Price Snapshot",
    module: "./features/rv-price-snapshot.js",
    api: "price-snapshot",
    enabled: true,
    lazyLoad: false
  },
  {
    id: "rv-top-movers",
    title: "Block 03 - Top Movers",
    module: "./features/rv-top-movers.js",
    api: "top-movers",
    enabled: true,
    lazyLoad: false
  },
  {
    id: "rv-earnings-calendar",
    title: "Block 04 - Earnings Calendar",
    module: "./features/rv-earnings-calendar.js",
    api: "earnings-calendar",
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-news-headlines",
    title: "Block 05 - News Headlines",
    module: "./features/rv-news-headlines.js",
    api: "news",
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-watchlist-local",
    title: "Block 06 - Watchlist (Local)",
    module: "./features/rv-watchlist-local.js",
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-export-csv",
    title: "Block 07 - Export CSV",
    module: "./features/rv-export-csv.js",
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-macro-rates",
    title: "Block 08 - Macro & Rates",
    module: "./features/rv-macro-rates.js",
    api: "macro-rates",
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-crypto-snapshot",
    title: "Block 09 - Crypto Snapshot",
    module: "./features/rv-crypto-snapshot.js",
    api: "crypto-snapshot",
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 120_000
  },
  {
    id: "rv-sentiment-barometer",
    title: "Block 10 - Sentiment Barometer",
    module: "./features/rv-sentiment-barometer.js",
    api: "sentiment",
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 15 * 60 * 1000
  },
  {
    id: "rv-tech-signals",
    title: "Block 11 - Tech Signals",
    module: "./features/rv-tech-signals.js",
    api: "tech-signals",
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 15 * 60 * 1000
  },
  {
    id: "tradingview-widgets",
    title: "TradingView Widgets",
    module: "./features/tradingview-widgets.js",
    enabled: true,
    lazyLoad: true
  }
];

export const RV_CONFIG = {
  version: "rv-2025-01-15",
  apiBase: "./API",
  buildId: "2025-01-15-local",
  buildInfo: {
    commit: "local",
    timestamp: "2025-01-15T00:00:00Z",
    environment: "local",
    branch: "work"
  },
  features: FEATURES.reduce((acc, feature) => {
    acc[feature.id] = feature.enabled;
    return acc;
  }, {}),
  DEBUG_ENABLED: true,
  DEBUG_PANIC_MODE,
  debugAuthToken: "",
  loader: {
    rootMargin: "250px 0px 250px 0px",
    threshold: 0.05
  }
};

if (typeof window !== "undefined") {
  window.RV_CONFIG = RV_CONFIG;
}
