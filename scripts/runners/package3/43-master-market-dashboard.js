import { getSnapshot, maxDate, makeNoDataError } from "./_shared.js";

const BLOCK_IDS = [
  "us-yield-curve",
  "ecb-rates-board",
  "inflation-pulse",
  "labor-pulse",
  "energy-macro",
  "credit-stress-proxy",
  "fx-board",
  "market-breadth",
  "highs-vs-lows",
  "sector-rotation",
  "vol-regime",
  "liquidity-conditions-proxy",
  "risk-regime-lite",
  "drawdown-monitor",
  "trend-strength-board",
  "momentum-heatmap-lite",
  "volatility-term-lite",
  "sector-relative-strength",
  "credit-spread-proxy-lite",
  "liquidity-delta",
  "macro-surprise-lite",
  "market-stress-composite",
  "breadth-delta",
  "regime-transition-watch",
  "earnings-pressure-lite",
  "insider-activity-lite",
  "options-skew-lite",
  "gamma-exposure-lite",
  "flow-anomaly-lite",
  "sentiment-lite",
  "social-velocity-lite",
  "analyst-revision-lite",
  "macro-risk-score",
  "tail-risk-watch",
  "liquidity-stress-watch",
  "regime-fracture-alert",
  "catalyst-calendar-lite",
  "cross-asset-divergence",
  "systemic-risk-lite",
  "weekly-market-brief",
  "alpha-radar-lite",
  "market-health-summary"
];

export async function run(ctx, entry) {
  const items = [];
  let dataAt = null;

  for (const blockId of BLOCK_IDS) {
    const snapshot = getSnapshot(ctx.cache, blockId);
    if (!snapshot) continue;
    const status = snapshot?.meta?.status || "ERROR";
    const reason = snapshot?.meta?.reason || "NO_DATA";
    items.push({ blockId, status, reason });
    dataAt = maxDate(dataAt, snapshot?.dataAt);
  }

  if (!items.length) throw makeNoDataError("dashboard_missing");

  return { items, dataAt };
}
