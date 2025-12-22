export const RV_CONFIG = {
  version: "rv-2025-01-15",
  apiBase: "/API",
  buildId: "2025-01-15-local",
  buildInfo: {
    commit: "local",
    timestamp: "2025-01-15T00:00:00Z",
    environment: "local",
    branch: "work"
  },
  features: {
    "rv-market-health": true,
    "rv-price-snapshot": true,
    "rv-top-movers": true
  },
  DEBUG_ENABLED: true,
  debugAuthToken: "",
  loader: {
    rootMargin: "250px 0px 250px 0px",
    threshold: 0.05
  }
};

if (typeof window !== "undefined") {
  window.RV_CONFIG = RV_CONFIG;
}
