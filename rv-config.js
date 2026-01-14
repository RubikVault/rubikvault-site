export const DEBUG_PANIC_MODE = false;

export const FEATURES = [
  {
    id: "rv-market-cockpit",
    title: "Hero – Market Cockpit",
    module: "./features/rv-market-cockpit.js",
    api: "market-cockpit",
    computation: {
      where: "Pages Function",
      update: "15m",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: false,
    refreshIntervalMs: 15 * 60 * 1000
  },
  {
    id: "rv-yield-curve",
    title: "Yield Curve",
    module: "./features/rv-yield-curve.js",
    api: "yield-curve",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "raw"
    },
    enabled: true,
    lazyLoad: false,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-sector-rotation",
    title: "Sector Rotation",
    module: "./features/rv-sector-rotation.js",
    api: "sector-rotation",
    computation: {
      where: "Pages Function",
      update: "30m",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: false,
    refreshIntervalMs: 30 * 60 * 1000
  },
  {
    id: "rv-central-bank-watch",
    title: "Central Bank Watch",
    module: "./features/rv-central-bank-watch.js",
    api: "central-bank-watch",
    computation: {
      where: "Pages Function",
      update: "30m",
      cost: "free and automated",
      trust: "raw"
    },
    enabled: true,
    lazyLoad: false,
    refreshIntervalMs: 30 * 60 * 1000
  },
  {
    id: "rv-market-health",
    title: "Block 01 - Market Health",
    module: "./features/rv-market-health.js",
    api: "market-health",
    computation: {
      where: "Pages Function",
      update: "10m",
      cost: "free and automated",
      trust: "proxy and derived"
    },
    enabled: true,
    lazyLoad: false
  },
  {
    id: "rv-price-snapshot",
    title: "Block 02 - Price Snapshot",
    module: "./features/rv-price-snapshot.js",
    api: "price-snapshot",
    computation: {
      where: "Pages Function",
      update: "5m",
      cost: "free and automated",
      trust: "raw and derived"
    },
    enabled: true,
    deprecated: true,
    lazyLoad: false
  },
  {
    id: "rv-top-movers",
    title: "Block 03 - Volume Top Movers",
    module: "./features/rv-top-movers.js",
    api: "top-movers",
    computation: {
      where: "Pages Function",
      update: "5m",
      cost: "free and automated",
      trust: "derived ranking"
    },
    enabled: true,
    lazyLoad: false
  },
  {
    id: "rv-earnings-calendar",
    title: "Block 04 - Earnings Calendar",
    module: "./features/rv-earnings-calendar.js",
    api: "earnings-calendar",
    computation: {
      where: "Pages Function",
      update: "1h",
      cost: "free and automated",
      trust: "raw calendar"
    },
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-news-headlines",
    title: "Block 05 - News Headlines",
    module: "./features/rv-news-headlines.js",
    api: "news",
    computation: {
      where: "Pages Function",
      update: "5-10m",
      cost: "free and automated",
      trust: "raw and tagged"
    },
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-news-intelligence",
    title: "Block 12 - News Intelligence",
    module: "./features/rv-news-intelligence.js",
    api: "news-intelligence",
    computation: {
      where: "Pages Function",
      update: "1h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 60 * 60 * 1000
  },
  {
    id: "rv-watchlist-local",
    title: "Block 06 - Watchlist (Local)",
    module: "./features/rv-watchlist-local.js",
    computation: {
      where: "Hybrid (Client + Pages Function)",
      update: "120s and on change",
      cost: "free and automated",
      trust: "raw and derived"
    },
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-export-csv",
    title: "Block 07 - Export CSV",
    module: "./features/rv-export-csv.js",
    computation: {
      where: "Client",
      update: "manual",
      cost: "free and manual",
      trust: "raw export"
    },
    enabled: true,
    lazyLoad: true
  },
  {
    id: "rv-macro-rates",
    title: "Block 08 - Macro & Rates",
    module: "./features/rv-macro-rates.js",
    api: "macro-rates",
    computation: {
      where: "Pages Function",
      update: "6-24h",
      cost: "free and automated",
      trust: "raw and proxy"
    },
    enabled: true,
    deprecated: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-sp500-sectors",
    title: "Block 13 - S&P 500 Sectors",
    module: "./features/rv-sp500-sectors.js",
    api: "sp500-sectors",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "derived proxy"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-crypto-snapshot",
    title: "Block 09 - Crypto Snapshot",
    module: "./features/rv-crypto-snapshot.js",
    api: "crypto-snapshot",
    computation: {
      where: "Pages Function",
      update: "2m",
      cost: "free and automated",
      trust: "raw"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 120_000
  },
  {
    id: "rv-sentiment-barometer",
    title: "Block 10 - Sentiment Barometer",
    module: "./features/rv-sentiment-barometer.js",
    api: "sentiment",
    computation: {
      where: "Pages Function",
      update: "15m",
      cost: "free and automated",
      trust: "heuristic"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 15 * 60 * 1000
  },
  {
    id: "rv-tech-signals",
    title: "Block 11 - Tech Signals",
    module: "./features/rv-tech-signals.js",
    api: "tech-signals",
    computation: {
      where: "Pages Function",
      update: "15m",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 15 * 60 * 1000
  },
  {
    id: "rv-alpha-radar",
    title: "Alpha Radar",
    module: "./features/rv-alpha-radar.js",
    api: "alpha-radar",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-market-regime",
    title: "Block XX - Market Regime Radar",
    module: "./features/rv-market-regime.js",
    api: "market-regime",
    computation: {
      where: "Pages Function",
      update: "30m",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 30 * 60 * 1000
  },
  {
    id: "rv-arb-risk-regime",
    title: "Block XX - ARB Risk Regime",
    module: "./features/rv-arb-risk-regime.js",
    api: "arb-risk-regime",
    computation: {
      where: "Pages Function",
      update: "1h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 60 * 60 * 1000
  },
  {
    id: "rv-arb-liquidity-pulse",
    title: "Block XX - ARB Liquidity Pulse",
    module: "./features/rv-arb-liquidity-pulse.js",
    api: "arb-liquidity-pulse",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-arb-breadth-lite",
    title: "Block XX - ARB Breadth Lite",
    module: "./features/rv-arb-breadth-lite.js",
    api: "arb-breadth-lite",
    computation: {
      where: "Pages Function",
      update: "30m",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 30 * 60 * 1000
  },
  {
    id: "rv-why-moved",
    title: "Block XX - Why This Stock Moved",
    module: "./features/rv-why-moved.js",
    api: "why-moved",
    computation: {
      where: "Pages Function",
      update: "1h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 60 * 60 * 1000
  },
  {
    id: "rv-volume-anomaly",
    title: "Block XX - Volume Anomaly",
    module: "./features/rv-volume-anomaly.js",
    api: "volume-anomaly",
    computation: {
      where: "Pages Function",
      update: "1h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 60 * 60 * 1000
  },
  {
    id: "rv-breakout-energy",
    title: "Block XX - Breakout Energy Radar",
    module: "./features/rv-breakout-energy.js",
    api: "breakout-energy",
    computation: {
      where: "Pages Function",
      update: "1h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 60 * 60 * 1000
  },
  {
    id: "rv-hype-divergence",
    title: "Block XX - Inverse Hype Detector",
    module: "./features/rv-hype-divergence.js",
    api: "hype-divergence",
    computation: {
      where: "Pages Function",
      update: "30m",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 30 * 60 * 1000
  },
  {
    id: "rv-congress-trading",
    title: "Block XX - Congress Trading Tracker",
    module: "./features/rv-congress-trading.js",
    api: "congress-trading",
    computation: {
      where: "Pages Function",
      update: "24h",
      cost: "free and automated",
      trust: "raw"
    },
    enabled: false,
    lazyLoad: true,
    refreshIntervalMs: 24 * 60 * 60 * 1000
  },
  {
    id: "rv-insider-cluster",
    title: "Block XX - Insider Cluster Buy Alarm",
    module: "./features/rv-insider-cluster.js",
    api: "insider-cluster",
    computation: {
      where: "Pages Function",
      update: "24h",
      cost: "free and automated",
      trust: "raw and derived"
    },
    enabled: false,
    lazyLoad: true,
    refreshIntervalMs: 24 * 60 * 60 * 1000
  },
  {
    id: "rv-analyst-stampede",
    title: "Block XX - Analyst Stampede",
    module: "./features/rv-analyst-stampede.js",
    api: "analyst-stampede",
    computation: {
      where: "Pages Function",
      update: "24h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: false,
    lazyLoad: true,
    refreshIntervalMs: 24 * 60 * 60 * 1000
  },
  {
    id: "rv-smart-money",
    title: "Block XX - Smart Money Score",
    module: "./features/rv-smart-money.js",
    api: "smart-money",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-alpha-performance",
    title: "Block XX - Alpha Consistency Monitor",
    module: "./features/rv-alpha-performance.js",
    api: "alpha-performance",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "rv-earnings-reality",
    title: "Block XX - Earnings Reality Check",
    module: "./features/rv-earnings-reality.js",
    api: "earnings-reality",
    computation: {
      where: "Pages Function",
      update: "6h",
      cost: "free and automated",
      trust: "derived"
    },
    enabled: true,
    lazyLoad: true,
    refreshIntervalMs: 6 * 60 * 60 * 1000
  },
  {
    id: "tradingview-widgets",
    title: "TradingView Widgets",
    module: "./features/tradingview-widgets.js",
    computation: {
      where: "Third-party embed",
      update: "realtime",
      cost: "free embed",
      trust: "raw"
    },
    enabled: true,
    lazyLoad: true
  }
];

const BLOCK_TITLE_SKIP = new Set(["rv-market-cockpit", "tradingview-widgets"]);
function stripBlockPrefix(rawTitle = "") {
  return String(rawTitle || "")
    .replace(/^Block\s+[0-9]{1,2}\s*[-–—]\s*/i, "")
    .replace(/^Block\s+XX\s*[-–—]\s*/i, "")
    .replace(/^Block\s*[-–—]\s*/i, "")
    .trim();
}

FEATURES.forEach((feature) => {
  if (!feature || BLOCK_TITLE_SKIP.has(feature.id)) return;
  const cleanTitle = stripBlockPrefix(feature.title || feature.id);
  if (cleanTitle) {
    feature.title = cleanTitle;
  }
});

export const RV_CONFIG = {
  version: "rv-2025-01-15",
  apiBase: "./api",
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
    rootMargin: "300px 0px 300px 0px",
    threshold: 0.05
  }
};

if (typeof window !== "undefined") {
  window.RV_CONFIG = RV_CONFIG;
}
