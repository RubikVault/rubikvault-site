import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { rvSetText } from "./rv-dom.js";

const STORAGE_KEY = "rv_watchlist_local";
const DEFAULT_LIST = ["AAPL", "NVDA"];
const TOP30_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "GOOG",
  "META",
  "TSLA",
  "BRK.B",
  "JPM",
  "V",
  "MA",
  "XOM",
  "UNH",
  "JNJ",
  "WMT",
  "PG",
  "HD",
  "AVGO",
  "COST",
  "PEP",
  "KO",
  "MRK",
  "ABBV",
  "LLY",
  "ORCL",
  "CSCO",
  "CRM",
  "NFLX",
  "AMD"
];

const top30State = {
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

function loadSymbols() {
  try {
    const shared = typeof window !== "undefined" ? window.RV_SHARED?.watchlist : null;
    if (Array.isArray(shared) && shared.length) return shared;
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_LIST;
    if (!Array.isArray(parsed)) return DEFAULT_LIST;
    return parsed.map((item) => String(item).toUpperCase());
  } catch (error) {
    return DEFAULT_LIST;
  }
}

function renderWatchlist(signals, symbols) {
  const rows = symbols.map((symbol) => ({
    symbol,
    data: signals.find((item) => item.symbol === symbol) || null
  }));

  return `
    <div class="rv-native-table-wrap">
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>RSI</th>
            <th>Weekly RSI</th>
            <th>MA20</th>
            <th>MA50</th>
            <th>Regime</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const keyPrefix = String(row.symbol || "symbol")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-");
              const item = row.data;
              if (!item) {
                return `
                  <tr>
                    <td data-rv-field="watch-${keyPrefix}-symbol">${row.symbol}</td>
                    <td data-rv-field="watch-${keyPrefix}-rsi">—</td>
                    <td data-rv-field="watch-${keyPrefix}-rsi-weekly">—</td>
                    <td data-rv-field="watch-${keyPrefix}-ma20">—</td>
                    <td data-rv-field="watch-${keyPrefix}-ma50">—</td>
                    <td data-rv-field="watch-${keyPrefix}-regime">—</td>
                  </tr>
                `;
              }
              const rsiClass =
                item.rsiLabel === "Oversold"
                  ? "rv-native-negative"
                  : item.rsiLabel === "Overbought"
                    ? "rv-native-positive"
                    : "rv-native-warning";
              const rsiWeeklyClass =
                item.rsiWeeklyLabel === "Oversold"
                  ? "rv-native-negative"
                  : item.rsiWeeklyLabel === "Overbought"
                    ? "rv-native-positive"
                    : "rv-native-warning";
              return `
              <tr>
                <td data-rv-field="watch-${keyPrefix}-symbol">${item.symbol}</td>
                <td class="${rsiClass}" data-rv-field="watch-${keyPrefix}-rsi">${formatNumber(item.rsi, {
                  maximumFractionDigits: 1
                })}</td>
                <td class="${rsiWeeklyClass}" data-rv-field="watch-${keyPrefix}-rsi-weekly">${formatNumber(
                  item.rsiWeekly,
                  { maximumFractionDigits: 1 }
                )}</td>
                <td data-rv-field="watch-${keyPrefix}-ma20">${formatNumber(item.ma20, {
                  maximumFractionDigits: 2
                })}</td>
                <td data-rv-field="watch-${keyPrefix}-ma50">${formatNumber(item.ma50, {
                  maximumFractionDigits: 2
                })}</td>
                <td data-rv-field="watch-${keyPrefix}-regime">${item.maRegime}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTop30Table(payload) {
  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    return `
      <div class="rv-native-error">
        Top 30 Table konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
      </div>
    `;
  }

  const signals = payload?.data?.signals || [];
  const sortKey = top30State.sortKey;
  const dir = top30State.sortDir === "desc" ? -1 : 1;
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
    return `${label} ${top30State.sortDir === "asc" ? "^" : "v"}`;
  };

  return `
    <div class="rv-native-table-wrap">
      <table class="rv-native-table">
        <thead>
          <tr>
            <th data-rv-sort="symbol">${sortLabel("Symbol", "symbol")}</th>
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
                  <td data-rv-field="top30-${keyPrefix}-symbol">${item.symbol}</td>
                  <td class="${rsiClass}" data-rv-field="top30-${keyPrefix}-rsi">${formatNumber(item.rsi, {
                    maximumFractionDigits: 1
                  })}</td>
                  <td data-rv-field="top30-${keyPrefix}-macd">${formatNumber(item.macd, {
                    maximumFractionDigits: 2
                  })}</td>
                  <td data-rv-field="top30-${keyPrefix}-macd-hist">${formatNumber(item.macdHist, {
                    maximumFractionDigits: 2
                  })}</td>
                  <td data-rv-field="top30-${keyPrefix}-stoch-rsi">${formatNumber(item.stochRsi, {
                    maximumFractionDigits: 1
                  })}</td>
                  <td class="${perfClass(item.perf1w)}" data-rv-field="top30-${keyPrefix}-perf-1w">${formatPercent(
                    item.perf1w
                  )}</td>
                  <td class="${perfClass(item.relPerf1w)}" data-rv-field="top30-${keyPrefix}-rel-1w">${formatPercent(
                    item.relPerf1w
                  )}</td>
                  <td class="${perfClass(item.perf1m)}" data-rv-field="top30-${keyPrefix}-perf-1m">${formatPercent(
                    item.perf1m
                  )}</td>
                  <td class="${perfClass(item.perf1y)}" data-rv-field="top30-${keyPrefix}-perf-1y">${formatPercent(
                    item.perf1y
                  )}</td>
                  <td data-rv-field="top30-${keyPrefix}-regime">${item.maRegime}</td>
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
  return fetchJSON(`/tech-signals?timeframe=${encodeURIComponent(timeframe)}` , {
    feature: "rv-tech-signals",
    traceId: Math.random().toString(36).slice(2, 10),
    logger
  });
}

function bindTop30Controls(root, logger) {
  const tabButtons = Array.from(root.querySelectorAll("[data-rv-timeframe]"));
  const tableHead = root.querySelector("[data-rv-top30-table] thead");

  tabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const next = button.getAttribute("data-rv-timeframe") || "daily";
      if (top30State.timeframe === next) return;
      top30State.timeframe = next;
      top30State.payload = await fetchSignals(TOP30_SYMBOLS, top30State.timeframe, logger);
      renderTop30(root, logger);
    });
  });

  tableHead?.addEventListener("click", (event) => {
    const th = event.target.closest("[data-rv-sort]");
    if (!th) return;
    const key = th.getAttribute("data-rv-sort");
    if (!key) return;
    if (top30State.sortKey === key) {
      top30State.sortDir = top30State.sortDir === "asc" ? "desc" : "asc";
    } else {
      top30State.sortKey = key;
      top30State.sortDir = "asc";
    }
    renderTop30(root, logger);
  });
}

function renderTop30(root, logger) {
  const tableHtml = renderTop30Table(top30State.payload);
  const availableCount = top30State.payload?.data?.availableCount;
  const totalCount = TOP30_SYMBOLS.length;
  const availabilityNote =
    typeof availableCount === "number" && availableCount !== totalCount
      ? `${availableCount}/${totalCount} verfügbar`
      : "";
  root.innerHTML = `
    <div class="rv-native-note rv-native-warning">WIP: consolidation planned with other signal blocks.</div>
    <div class="rv-native-note">How computed? RSI/MACD/Stoch RSI are derived from OHLC (stooq) per timeframe.</div>
    <div class="rv-top30-controls">
      <button type="button" class="rv-top30-tab${top30State.timeframe === "daily" ? " is-active" : ""}" data-rv-timeframe="daily">Daily</button>
      <button type="button" class="rv-top30-tab${top30State.timeframe === "weekly" ? " is-active" : ""}" data-rv-timeframe="weekly">Weekly</button>
      <button type="button" class="rv-top30-tab${top30State.timeframe === "monthly" ? " is-active" : ""}" data-rv-timeframe="monthly">Monthly</button>
    </div>
    <div data-rv-top30-table>
      ${tableHtml}
    </div>
    <div class="rv-native-note">Universe: fixed mega-cap list (approx top 30).</div>
    ${availabilityNote ? `<div class="rv-native-note">${availabilityNote}</div>` : ""}
  `;

  bindTop30Controls(root, logger);
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));
}

function render(root, watchPayload, top30Payload, logger, symbols) {
  const watchSignals = watchPayload?.data?.signals || [];
  const partialNote =
    watchPayload?.ok && (watchPayload?.isStale || watchPayload?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";

  const watchlistHtml = watchPayload?.ok
    ? renderWatchlist(watchSignals, symbols)
    : `
      <div class="rv-native-error">
        Tech Signals konnten nicht geladen werden.<br />
        <span>${watchPayload?.error?.message || "API error"}</span>
        ${watchPayload?.error?.code === "BINDING_MISSING" ? `<div class=\"rv-native-note\">${getBindingHint(watchPayload)}</div>` : ""}
      </div>
    `;

  root.innerHTML = `
    ${partialNote ? `<div class=\"rv-native-note\">${partialNote}</div>` : ""}
    <div class="rv-tech-section">
      <h3>Watchlist Signals</h3>
      ${watchlistHtml}
    </div>
    <div class="rv-tech-section">
      <h3>Top 30 Market Cap Table</h3>
      <div data-rv-top30-root></div>
    </div>
  `;

  const topRoot = root.querySelector("[data-rv-top30-root]");
  if (topRoot) {
    top30State.payload = top30Payload;
    renderTop30(topRoot, logger);
  }
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

  const okBoth = watchPayload?.ok && top30Payload?.ok;
  const okOne = watchPayload?.ok || top30Payload?.ok;
  logger?.setStatus(okBoth ? "OK" : okOne ? "PARTIAL" : "FAIL", okBoth ? "Live" : "Partial data");
  logger?.setMeta({
    updatedAt: watchPayload?.data?.updatedAt || top30Payload?.data?.updatedAt || watchPayload?.ts || "",
    source: watchPayload?.data?.source || top30Payload?.data?.source || "stooq",
    isStale: watchPayload?.isStale || top30Payload?.isStale,
    staleAgeMs: watchPayload?.staleAgeMs || top30Payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: watchPayload?.cache || {},
    upstreamStatus: watchPayload?.upstream?.status ?? null
  });
}

export async function init(root, context = {}) {
  const { logger } = context;
  const symbols = loadSymbols();
  const watchPayload = await getOrFetch(
    "rv-tech-signals",
    () => fetchSignals(symbols, "daily", logger),
    { ttlMs: 15 * 60 * 1000, featureId: "rv-tech-signals", logger }
  );
  const topPayload = await getOrFetch(
    `rv-tech-signals-top30:${top30State.timeframe}`,
    () => fetchSignals(TOP30_SYMBOLS, top30State.timeframe, logger),
    { ttlMs: 15 * 60 * 1000, featureId: "rv-tech-signals", logger }
  );
  render(root, watchPayload, topPayload, logger, symbols);
}

export async function refresh(root, context = {}) {
  const { logger } = context;
  const symbols = loadSymbols();
  const watchPayload = await fetchSignals(symbols, "daily", logger);
  const topPayload = await fetchSignals(TOP30_SYMBOLS, top30State.timeframe, logger);
  render(root, watchPayload, topPayload, logger, symbols);
}
