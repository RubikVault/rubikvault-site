import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { rvSetText } from "./rv-dom.js";

const TOP20_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "BRK.B",
  "JPM",
  "V",
  "LLY",
  "AVGO",
  "WMT",
  "XOM",
  "UNH",
  "COST",
  "MA",
  "NFLX",
  "HD",
  "PG"
];

const TOP20_NAMES = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta Platforms",
  TSLA: "Tesla",
  "BRK.B": "Berkshire Hathaway",
  JPM: "JPMorgan Chase",
  V: "Visa",
  LLY: "Eli Lilly",
  AVGO: "Broadcom",
  WMT: "Walmart",
  XOM: "Exxon Mobil",
  UNH: "UnitedHealth",
  COST: "Costco",
  MA: "Mastercard",
  NFLX: "Netflix",
  HD: "Home Depot",
  PG: "Procter & Gamble",
  JNJ: "Johnson & Johnson",
  ABBV: "AbbVie",
  ORCL: "Oracle",
  MRK: "Merck"
};

const top20State = {
  timeframe: "daily",
  sortKey: "symbol",
  sortDir: "asc",
  payload: null
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${formatNumber(value, { maximumFractionDigits: digits })}%`;
}

function renderTop20Table(payload) {
  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    return `
      <div class="rv-native-error">
        Top 20 Table konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
      </div>
    `;
  }

  // Handle snapshot format: payload.data.items for snapshot, payload.data.signals for API
  const rawSignals = payload?.data?.signals || payload?.data?.items || [];
  // Filter by timeframe: use rsi for daily, rsiWeekly for weekly, rsiMonthly for monthly
  const signals = rawSignals.map((item) => {
    if (!item || typeof item !== "object") return item;
    const timeframe = top20State.timeframe || "daily";
    if (timeframe === "weekly" && item.rsiWeekly != null) {
      return { ...item, rsi: item.rsiWeekly };
    } else if (timeframe === "monthly" && item.rsiMonthly != null) {
      return { ...item, rsi: item.rsiMonthly };
    }
    // Default to daily (item.rsi)
    return item;
  });
  const sortKey = top20State.sortKey;
  const dir = top20State.sortDir === "desc" ? -1 : 1;
  const sorted = signals.slice().sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const sortLabel = (label, key) => {
    if (sortKey !== key) return label;
    return `${label} ${top20State.sortDir === "asc" ? "^" : "v"}`;
  };

  return `
    <div class="rv-native-table-wrap">
      <table class="rv-native-table">
        <thead>
          <tr>
            <th data-rv-sort="symbol">${sortLabel("Stock", "symbol")}</th>
            <th data-rv-sort="rsi">${sortLabel("RSI", "rsi")}</th>
            <th data-rv-sort="macd">${sortLabel("MACD", "macd")}</th>
            <th data-rv-sort="macdHist">${sortLabel("MACD Hist", "macdHist")}</th>
            <th data-rv-sort="stochRsi">${sortLabel("Stoch RSI", "stochRsi")}</th>
            <th data-rv-sort="perf1w">${sortLabel("1W", "perf1w")}</th>
            <th data-rv-sort="relPerf1w">${sortLabel("Rel vs SP500", "relPerf1w")}</th>
            <th data-rv-sort="perf1m">${sortLabel("1M", "perf1m")}</th>
            <th data-rv-sort="perf1y">${sortLabel("1Y", "perf1y")}</th>
            <th data-rv-sort="maRegime">${sortLabel("MA Regime", "maRegime")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((item) => {
              const keyPrefix = String(item.symbol || "symbol")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-");
              const companyName = TOP20_NAMES[item.symbol] || "";
              const rsiClass =
                item.rsiLabel === "Oversold"
                  ? "rv-native-negative"
                  : item.rsiLabel === "Overbought"
                    ? "rv-native-positive"
                    : "rv-native-warning";
              const perfClass = (value) =>
                value === null ? "" : value >= 0 ? "rv-native-positive" : "rv-native-negative";
              return `
                <tr>
                  <td data-rv-field="top20-${keyPrefix}-symbol">${item.symbol}${companyName ? ` — ${companyName}` : ""}</td>
                  <td class="${rsiClass}" data-rv-field="top20-${keyPrefix}-rsi">${formatNumber(item.rsi, {
                    maximumFractionDigits: 1
                  })}</td>
                  <td data-rv-field="top20-${keyPrefix}-macd">${formatNumber(item.macd, {
                    maximumFractionDigits: 2
                  })}</td>
                  <td data-rv-field="top20-${keyPrefix}-macd-hist">${formatNumber(item.macdHist, {
                    maximumFractionDigits: 2
                  })}</td>
                  <td data-rv-field="top20-${keyPrefix}-stoch-rsi">${formatNumber(item.stochRsi, {
                    maximumFractionDigits: 1
                  })}</td>
                  <td class="${perfClass(item.perf1w)}" data-rv-field="top20-${keyPrefix}-perf-1w">${formatPercent(
                    item.perf1w
                  )}</td>
                  <td class="${perfClass(item.relPerf1w)}" data-rv-field="top20-${keyPrefix}-rel-1w">${formatPercent(
                    item.relPerf1w
                  )}</td>
                  <td class="${perfClass(item.perf1m)}" data-rv-field="top20-${keyPrefix}-perf-1m">${formatPercent(
                    item.perf1m
                  )}</td>
                  <td class="${perfClass(item.perf1y)}" data-rv-field="top20-${keyPrefix}-perf-1y">${formatPercent(
                    item.perf1y
                  )}</td>
                  <td data-rv-field="top20-${keyPrefix}-regime">${item.maRegime}</td>
                </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function fetchSignals(symbols, timeframe, logger) {
  // Load snapshot directly (timeframe filtering happens client-side)
  return fetchJSON("/data/snapshots/tech-signals.json", {
    feature: "rv-tech-signals",
    traceId: Math.random().toString(36).slice(2, 10),
    logger
  });
}

function bindTop20Controls(root, logger) {
  const tabButtons = Array.from(root.querySelectorAll("[data-rv-timeframe]"));
  const tableHead = root.querySelector("[data-rv-top30-table] thead");

  tabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const next = button.getAttribute("data-rv-timeframe") || "daily";
      if (top20State.timeframe === next) return;
      top20State.timeframe = next;
      top20State.payload = await fetchSignals(TOP20_SYMBOLS, top20State.timeframe, logger);
      renderTop20(root, logger);
    });
  });

  tableHead?.addEventListener("click", (event) => {
    const th = event.target.closest("[data-rv-sort]");
    if (!th) return;
    const key = th.getAttribute("data-rv-sort");
    if (!key) return;
    if (top20State.sortKey === key) {
      top20State.sortDir = top20State.sortDir === "asc" ? "desc" : "asc";
    } else {
      top20State.sortKey = key;
      top20State.sortDir = "asc";
    }
    renderTop20(root, logger);
  });
}

function renderTop20(root, logger) {
  const tableHtml = renderTop20Table(top20State.payload);
  const availableCount = top20State.payload?.data?.availableCount;
  const totalCount = TOP20_SYMBOLS.length;
  const availabilityNote =
    typeof availableCount === "number" && availableCount !== totalCount
      ? `${availableCount}/${totalCount} verfügbar`
      : "";
  root.innerHTML = `
    <div class="rv-top30-controls">
      <button type="button" class="rv-top30-tab${top20State.timeframe === "daily" ? " is-active" : ""}" data-rv-timeframe="daily">Daily</button>
      <button type="button" class="rv-top30-tab${top20State.timeframe === "weekly" ? " is-active" : ""}" data-rv-timeframe="weekly">Weekly</button>
      <button type="button" class="rv-top30-tab${top20State.timeframe === "monthly" ? " is-active" : ""}" data-rv-timeframe="monthly">Monthly</button>
    </div>
    <div data-rv-top30-table>
      ${tableHtml}
    </div>
    ${availabilityNote ? `<div class="rv-native-note">${availabilityNote}</div>` : ""}
  `;

  bindTop20Controls(root, logger);
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));
}

function render(root, topPayload, logger) {
  const partialNote =
    topPayload?.ok && (topPayload?.isStale || topPayload?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";

  root.innerHTML = `
    ${partialNote ? `<div class=\"rv-native-note\">${partialNote}</div>` : ""}
    <div data-rv-top30-root></div>
  `;

  const topRoot = root.querySelector("[data-rv-top30-root]");
  if (topRoot) {
    top20State.payload = topPayload;
    renderTop20(topRoot, logger);
  }
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

  logger?.setStatus(topPayload?.ok ? "OK" : "FAIL", topPayload?.ok ? "Live" : "Partial data");
  logger?.setMeta({
    updatedAt: topPayload?.data?.updatedAt || topPayload?.ts || "",
    source: topPayload?.data?.source || "stooq",
    isStale: topPayload?.isStale,
    staleAgeMs: topPayload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: topPayload?.cache || {},
    upstreamStatus: topPayload?.upstream?.status ?? null
  });
}

export async function init(root, context = {}) {
  const { logger } = context;
  const topPayload = await getOrFetch(
    `rv-tech-signals-top20:${top20State.timeframe}`,
    () => fetchSignals(TOP20_SYMBOLS, top20State.timeframe, logger),
    { ttlMs: 24 * 60 * 60 * 1000, featureId: "rv-tech-signals", logger }
  );
  render(root, topPayload, logger);
}

export async function refresh(root, context = {}) {
  const { logger } = context;
  const topPayload = await fetchSignals(TOP20_SYMBOLS, top20State.timeframe, logger);
  render(root, topPayload, logger);
}
