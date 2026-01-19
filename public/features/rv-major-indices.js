/**
 * RubikVault Major Indices EOD - Simple Block
 * Shows current EOD prices for major indices
 * Source: /api/market-health
 */

import { fetchJSON } from "./utils/api.js";

/**
 * Format number with proper decimals
 */
function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Get color class based on change percent
 */
function getColorClass(changePct) {
  if (changePct === null || changePct === undefined || isNaN(changePct)) return "";
  return changePct >= 0 ? "rv-native-positive" : "rv-native-negative";
}

/**
 * Render function
 */
function render(root, payload) {
  const data = payload?.data || {};
  const items = data.items || [];

  if (!payload?.ok) {
    root.innerHTML = `<div class="rv-native-error">Failed to load Major Indices data.</div>`;
    return;
  }

  // Find specific symbols
  const spy = items.find(item => item.symbol === "SPY");
  const qqq = items.find(item => item.symbol === "QQQ");
  const iwm = items.find(item => item.symbol === "IWM");

  // Calculate index values (ETF prices need to be multiplied by 10 for approximate index value)
  const sp500Value = spy ? spy.close * 10 : null;
  const nasdaqValue = qqq ? qqq.close * 10 : null;
  const russell2000Value = iwm ? iwm.close * 10 : null;

  root.innerHTML = `
    <div style="display: grid; grid-template-columns: 200px 1fr; gap: 16px; padding: 16px;">
      <div style="font-weight: 600; color: #e5e7eb;">S&P 500</div>
      <div class="${getColorClass(spy?.changePct)}" style="font-size: 18px; font-weight: 600;">
        ${sp500Value ? formatNumber(sp500Value, 2) : "N/A"}
      </div>
      
      <div style="font-weight: 600; color: #e5e7eb;">Nasdaq</div>
      <div class="${getColorClass(qqq?.changePct)}" style="font-size: 18px; font-weight: 600;">
        ${nasdaqValue ? formatNumber(nasdaqValue, 2) : "N/A"}
      </div>
      
      <div style="font-weight: 600; color: #e5e7eb;">DOW</div>
      <div style="font-size: 18px; font-weight: 600; color: #94a3b8;">
        N/A
      </div>
      
      <div style="font-weight: 600; color: #e5e7eb;">Russell 2000</div>
      <div class="${getColorClass(iwm?.changePct)}" style="font-size: 18px; font-weight: 600;">
        ${russell2000Value ? formatNumber(russell2000Value, 2) : "N/A"}
      </div>
    </div>
    <div style="padding: 8px 16px; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05);">
      Source: /api/market-health | Updated: ${payload?.meta?.updatedAt ? new Date(payload.meta.updatedAt).toLocaleString() : "N/A"}
    </div>
  `;
}

/**
 * Load data from API
 */
async function loadData({ logger }) {
  return fetchJSON("market-health", { logger });
}

/**
 * Init function - called by rv-loader
 */
export async function init(root, context = {}) {
  const { logger } = context;
  
  try {
    const data = await loadData({ logger });
    render(root, data);
    logger?.setStatus("OK", "Data loaded");
  } catch (error) {
    root.innerHTML = `<div class="rv-native-error">Error loading data: ${error.message}</div>`;
    logger?.setStatus("FAIL", error.message);
  }
}

/**
 * Refresh function
 */
export function refresh(root, context = {}) {
  const { logger } = context;
  loadData({ logger }).then((data) => render(root, data));
}
