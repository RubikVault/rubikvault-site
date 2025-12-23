import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

const STORAGE_KEY = "rv_watchlist_local";
const DEFAULT_LIST = ["AAPL", "NVDA"];

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
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

function render(root, payload, logger, symbols) {
  const data = payload?.data || {};
  const signals = data.signals || [];

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
        Tech Signals konnten nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus(
      errorCode === "RATE_LIMITED" ? "PARTIAL" : "FAIL",
      errorCode === "RATE_LIMITED" ? "RATE_LIMITED" : "API error"
    );
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

  if (!signals.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Tech-Signals verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || payload?.ts,
      source: data.source || "stooq",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    <div class="rv-native-table-wrap">
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>RSI</th>
            <th>Signal</th>
            <th>MA20</th>
            <th>MA50</th>
            <th>Regime</th>
          </tr>
        </thead>
        <tbody>
          ${signals
            .map((item) => {
              const rsiValue = item.rsi ?? null;
              const rsiClass =
                item.rsiLabel === "Oversold"
                  ? "rv-native-positive"
                  : item.rsiLabel === "Overbought"
                    ? "rv-native-negative"
                    : "";
              return `
              <tr>
                <td>${item.symbol}</td>
                <td>${formatNumber(rsiValue, { maximumFractionDigits: 1 })}</td>
                <td class="${rsiClass}">${item.rsiLabel}</td>
                <td>${formatNumber(item.ma20, { maximumFractionDigits: 2 })}</td>
                <td>${formatNumber(item.ma50, { maximumFractionDigits: 2 })}</td>
                <td>${item.maRegime}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${data.skipped?.length ? `<div class="rv-native-note">Skipped: ${data.skipped.map((item) => item.symbol).join(", ")}</div>` : ""}
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()} · Source: ${data.source || "stooq"}</div>
  `;

  const warningCode = payload?.error?.code || "";
  const hasWarning = payload?.ok && warningCode;
  const isRateLimited = warningCode === "RATE_LIMITED";
  const headline = payload?.isStale
    ? isRateLimited
      ? "RATE_LIMITED"
      : "Stale data"
    : isRateLimited
      ? "RATE_LIMITED"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    headline
  );
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

async function loadData({ featureId, traceId, logger, symbols }) {
  const param = symbols.join(",");
  return fetchJSON(`/tech-signals?symbols=${encodeURIComponent(param)}`, {
    feature: featureId,
    traceId,
    logger
  });
}

export async function init(root, context = {}) {
  const { featureId = "rv-tech-signals", traceId, logger } = context;
  const symbols = loadSymbols();
  if (!symbols.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Watchlist-Symbole vorhanden.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No symbols");
    return;
  }
  const data = await getOrFetch(
    "rv-tech-signals",
    () => loadData({ featureId, traceId, logger, symbols }),
    { ttlMs: 15 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, symbols);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-tech-signals", traceId, logger } = context;
  const symbols = loadSymbols();
  if (!symbols.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine Watchlist-Symbole vorhanden.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No symbols");
    return;
  }
  const data = await loadData({ featureId, traceId, logger, symbols });
  render(root, data, logger, symbols);
}
