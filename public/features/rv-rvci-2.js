/**
 * RubikVault RVCI 2 - Enhanced Confidence Index
 * Shows top-scored stocks with signals and risk assessment
 */

import { fetchJSON, getOrFetch } from "./utils/api.js";

// State management
const state = {
  sortKey: "score",
  sortAsc: false,
  lastPayload: null
};

/**
 * Format number with proper decimals
 */
function formatNumber(value, opts = {}) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: opts.minimumFractionDigits ?? 0,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    ...opts
  });
}

/**
 * Sort rows by key
 */
function sortRows(rows, key, asc) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let aVal = a[key];
    let bVal = b[key];
    
    // Handle strings
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    const diff = aVal < bVal ? -1 : 1;
    return asc ? diff : -diff;
  });
  return sorted;
}

/**
 * Get risk badge color
 */
function getRiskColor(risk) {
  switch (risk) {
    case "LOW": return "#10b981";
    case "MEDIUM": return "#f59e0b";
    case "HIGH": return "#ef4444";
    default: return "#6b7280";
  }
}

/**
 * Get quality badge color
 */
function getQualityColor(quality) {
  switch (quality) {
    case "HIGH": return "#10b981";
    case "MEDIUM": return "#f59e0b";
    case "LOW": return "#ef4444";
    default: return "#6b7280";
  }
}

/**
 * Render the RVCI 2 block
 */
function render(root, payload, logger) {
  const data = payload?.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const summary = data.summary || {};
  
  state.lastPayload = payload;
  
  const updatedAt = data.updatedAt || payload?.meta?.asOf || payload?.ts;
  const asOf = updatedAt
    ? new Date(updatedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "N/A";

  // Handle errors
  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    root.innerHTML = `
      <div class="rv-native-error">
        <strong>RVCI 2 konnte nicht geladen werden.</strong><br />
        <span>${errorMessage}</span>
      </div>
    `;
    logger?.setStatus("FAIL", "API error");
    return;
  }

  // Handle empty data
  if (items.length === 0) {
    root.innerHTML = `
      <div class="rv-native-note">
        No RVCI 2 data available yet. Data updates at market close (EOD).
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    return;
  }

  // Sort items
  const sorted = sortRows(items, state.sortKey, state.sortAsc);

  // Render
  root.innerHTML = `
    <div class="rvci2-summary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; padding: 12px; background: rgba(99, 102, 241, 0.05); border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2);">
      <div>
        <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Total Scored</div>
        <div style="font-size: 20px; font-weight: 600; color: #e5e7eb;">${summary.totalScored || 0}</div>
      </div>
      <div>
        <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Avg Score</div>
        <div style="font-size: 20px; font-weight: 600; color: #e5e7eb;">${formatNumber(summary.avgScore)}</div>
      </div>
      <div>
        <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Top Score</div>
        <div style="font-size: 20px; font-weight: 600; color: #10b981;">${summary.topScore || 0}</div>
      </div>
      <div>
        <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Signals Active</div>
        <div style="font-size: 20px; font-weight: 600; color: #6366f1;">${summary.signalsActive || 0}</div>
      </div>
    </div>
    
    <div class="rv-native-table-wrap">
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th data-rv-sort="ticker">Ticker</th>
            <th data-rv-sort="score" class="rv-cell-num">Score</th>
            <th data-rv-sort="price" class="rv-cell-num">Price</th>
            <th data-rv-sort="changePct" class="rv-cell-num">Change %</th>
            <th>Signals</th>
            <th>Risk</th>
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((row) => {
              const changeClass = (row.changePct ?? 0) >= 0 ? "rv-native-positive" : "rv-native-negative";
              const signalsHtml = (row.signals || [])
                .map(s => `<span style="font-size: 10px; padding: 2px 6px; background: rgba(99, 102, 241, 0.2); color: #c7d2fe; border-radius: 4px; margin-right: 4px; display: inline-block; margin-bottom: 2px;">${s}</span>`)
                .join("");
              
              return `
                <tr>
                  <td class="rv-cell-label">
                    <strong>${row.ticker}</strong>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${row.name || ""}</div>
                  </td>
                  <td class="rv-cell-num">
                    <strong style="color: ${row.score >= 80 ? "#10b981" : row.score >= 70 ? "#f59e0b" : "#e5e7eb"}; font-size: 16px;">${row.score}</strong>
                  </td>
                  <td class="rv-cell-num">$${formatNumber(row.price, { maximumFractionDigits: 2 })}</td>
                  <td class="rv-cell-num ${changeClass}">${formatNumber(row.changePct, { minimumFractionDigits: 2 })}%</td>
                  <td style="max-width: 200px;">${signalsHtml || "—"}</td>
                  <td>
                    <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; background: ${getRiskColor(row.risk)}; color: white; border-radius: 4px; display: inline-block;">${row.risk || "—"}</span>
                  </td>
                  <td>
                    <span style="font-size: 11px; font-weight: 600; padding: 3px 8px; background: ${getQualityColor(row.quality)}; color: white; border-radius: 4px; display: inline-block;">${row.quality || "—"}</span>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    
    <div style="margin-top: 12px; font-size: 11px; color: #9ca3af; text-align: center;">
      Updated: ${asOf}
    </div>
    
    <div class="rv-native-note" style="margin-top: 12px; text-align: center; font-size: 11px;">
      <strong>No Investment Advice:</strong> Signals dienen nur als Watchlist/Review-Tool. Keine Handelsempfehlung.
    </div>
  `;

  // Add sort handlers
  root.querySelectorAll("[data-rv-sort]").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-rv-sort");
      if (state.sortKey === key) {
        state.sortAsc = !state.sortAsc;
      } else {
        state.sortKey = key;
        state.sortAsc = false;
      }
      render(root, state.lastPayload, logger);
    });
  });

  logger?.setStatus("OK");
  logger?.setMeta({
    updatedAt,
    source: data?.source || "rvci-engine-v2",
    itemsCount: items.length
  });
}

/**
 * Load data from API
 */
async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/rvci-2", { feature: featureId, traceId, logger });
}

/**
 * Initialize the RVCI 2 block
 */
export async function init(root, context = {}) {
  const { featureId = "rv-rvci-2", traceId, logger } = context;
  
  const data = await getOrFetch(
    "rv-rvci-2",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 5 * 60 * 1000, featureId, logger } // 5 min cache
  );
  
  render(root, data, logger);
}

/**
 * Refresh the block
 */
export async function refresh(root, context = {}) {
  const { featureId = "rv-rvci-2", traceId, logger } = context;
  
  root.innerHTML = `<div class="rv-native-note">Refreshing RVCI 2 data...</div>`;
  
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
