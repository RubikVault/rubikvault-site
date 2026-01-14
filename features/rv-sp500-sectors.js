import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

const state = {
  sortKey: "r1d",
  sortDir: "desc",
  lastPayload: null
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function sortRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
}

function sortLabel(label, key) {
  if (state.sortKey !== key) return label;
  return `${label} ${state.sortDir === "asc" ? "^" : "v"}`;
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const sectors = Array.isArray(data.sectors) ? data.sectors : [];
  const missing = Array.isArray(data.missingSymbols) ? data.missingSymbols : [];
  state.lastPayload = payload;
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code || missing.length)
      ? "Partial data — some sectors unavailable."
      : "";

  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    const errorCode = payload?.error?.code || "";
    const upstreamStatus = payload?.upstream?.status;
    const upstreamSnippet = payload?.upstream?.snippet || "";
    const cacheLayer = payload?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(payload) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        S&amp;P 500 Sectors konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    logger?.setMeta({
      updatedAt: payload?.ts,
      source: data?.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: payload?.cache || {},
      upstreamStatus: upstreamStatus ?? null
    });
    return;
  }

  // Handle empty sectors gracefully
  if (sectors.length === 0) {
    root.innerHTML = `
      <div class="rv-native-note">
        No sector data available yet. Data updates at market close (EOD).
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: payload?.ts,
      source: data?.source || "stooq",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  const sorted = sortRows(sectors);

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-native-table-wrap">
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th data-rv-sort="symbol">${sortLabel("Sector", "symbol")}</th>
            <th data-rv-sort="price">${sortLabel("Price", "price")}</th>
            <th data-rv-sort="r1d">${sortLabel("1D", "r1d")}</th>
            <th data-rv-sort="r1w">${sortLabel("1W", "r1w")}</th>
            <th data-rv-sort="r1m">${sortLabel("1M", "r1m")}</th>
            <th data-rv-sort="r1y">${sortLabel("1Y", "r1y")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((row) => {
              const cls = (value) =>
                typeof value === "number" ? (value >= 0 ? "rv-native-positive" : "rv-native-negative") : "";
              return `
                <tr>
                  <td><strong>${row.symbol}</strong></td>
                  <td>${formatNumber(row.price, { maximumFractionDigits: 2 })}</td>
                  <td class="${cls(row.r1d)}">${formatNumber(row.r1d, { maximumFractionDigits: 2 })}%</td>
                  <td class="${cls(row.r1w)}">${formatNumber(row.r1w, { maximumFractionDigits: 2 })}%</td>
                  <td class="${cls(row.r1m)}">${formatNumber(row.r1m, { maximumFractionDigits: 2 })}%</td>
                  <td class="${cls(row.r1y)}">${formatNumber(row.r1y, { maximumFractionDigits: 2 })}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleString()}</div>
  `;

  root.querySelectorAll("[data-rv-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-rv-sort");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      if (state.lastPayload) {
        render(root, state.lastPayload, logger);
      }
    });
  });

  const status = payload?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, payload?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "stooq",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/sp500-sectors", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-sp500-sectors", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-sp500-sectors",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-sp500-sectors", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
