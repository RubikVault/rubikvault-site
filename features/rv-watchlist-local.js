import { fetchJSON, getBindingHint } from "./utils/api.js";

const STORAGE_KEY = "rv_watchlist_local";
const QUOTES_CACHE_KEY = "rv_watchlist_quotes";
const SHADOW_SCHEMA_VERSION = 1;
const SHADOW_FEATURE = "rv-watchlist-local";
const SHADOW_KEY = "quotes";
const SYMBOLS_PATH = "./assets/nasdaq_symbols.min.json";
const DEFAULT_LIST = ["AAPL", "NVDA"];
const DEFAULT_REFRESH_MS = 120_000;
const BACKOFF_STEPS = [120_000, 300_000, 900_000];
const STALE_MAX_MS = 15 * 60 * 1000;
const METRICS_TTL_MS = 15 * 60 * 1000;
const EARNINGS_TTL_MS = 6 * 60 * 60 * 1000;

const state = {
  symbols: [],
  symbolsLoaded: false,
  suggestions: [],
  activeIndex: -1,
  quotes: new Map(),
  lastUpdatedAt: null,
  source: "stooq",
  metrics: new Map(),
  metricsUpdatedAt: 0,
  metricsMissing: false,
  earnings: new Map(),
  earningsUpdatedAt: 0,
  earningsMissing: false,
  refreshTimer: null,
  backoffLevel: 0,
  backoffUntil: 0,
  isVisible: true,
  errorNote: "",
  infoNote: "",
  sortKey: "symbol",
  sortDir: "asc",
  countdownTimer: null
};

function createTraceId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadList(logger) {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_LIST;
    if (!Array.isArray(parsed)) return DEFAULT_LIST;
    return parsed.map((item) => String(item).toUpperCase());
  } catch (error) {
    logger?.warn("watchlist_load_failed", { message: error?.message || "Failed" });
    return DEFAULT_LIST;
  }
}

function saveList(list, logger) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
    logger?.info("watchlist_saved", { size: list.length });
  } catch (error) {
    logger?.warn("watchlist_save_failed", { message: error?.message || "Failed" });
  }
}

function updateShared(list) {
  if (typeof window === "undefined") return;
  window.RV_SHARED = window.RV_SHARED || {};
  window.RV_SHARED.watchlist = list;
}

function normalizeShadowEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.schemaVersion && entry.feature && entry.key && entry.storedAt && entry.data) {
    return entry;
  }
  if (entry.quotes || entry.ts || entry.updatedAt) {
    const storedAt = entry.ts || entry.storedAt || entry.updatedAt || new Date().toISOString();
    return {
      schemaVersion: SHADOW_SCHEMA_VERSION,
      feature: SHADOW_FEATURE,
      key: SHADOW_KEY,
      storedAt,
      data: {
        quotes: entry.quotes || [],
        updatedAt: entry.updatedAt || entry.ts || null
      }
    };
  }
  return null;
}

function loadShadowQuotes() {
  try {
    const raw = window.localStorage?.getItem(QUOTES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeShadowEntry(parsed);
  } catch (error) {
    return null;
  }
}

function saveShadowQuotes(quotes, updatedAt) {
  try {
    const storedAt = new Date().toISOString();
    window.localStorage?.setItem(
      QUOTES_CACHE_KEY,
      JSON.stringify({
        schemaVersion: SHADOW_SCHEMA_VERSION,
        feature: SHADOW_FEATURE,
        key: SHADOW_KEY,
        storedAt,
        data: {
          quotes,
          updatedAt: updatedAt || storedAt
        }
      })
    );
  } catch (error) {
    // ignore
  }
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${formatNumber(value, { maximumFractionDigits: digits })}%`;
}

function formatTime(value) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleTimeString();
}

function formatStaleMinutes(ageMs) {
  if (!Number.isFinite(ageMs)) return "";
  const minutes = Math.max(1, Math.round(ageMs / 60000));
  return `${minutes}m`;
}

function normalizeSymbolInput(value) {
  if (!value) return "";
  const cleaned = String(value).replace(/\s+/g, "").toUpperCase();
  return cleaned.slice(0, 8);
}

function populateDatalist(root) {
  if (!root || !state.symbolsLoaded) return;
  const datalist = root.querySelector("#rv-watchlist-symbols");
  if (!datalist) return;
  datalist.innerHTML = state.symbols
    .slice(0, 500)
    .map((item) => `<option value="${item.s}">${item.n || ""}</option>`)
    .join("");
}

async function loadSymbols(logger) {
  if (state.symbolsLoaded) return;
  try {
    const response = await fetch(SYMBOLS_PATH, { cache: "force-cache" });
    const data = await response.json();
    if (Array.isArray(data)) {
      state.symbols = data;
      state.symbolsLoaded = true;
      logger?.info("symbols_loaded", { count: data.length });
    }
  } catch (error) {
    logger?.warn("symbols_load_failed", { message: error?.message || "Failed" });
  }
}

function findSuggestions(query) {
  const input = normalizeSymbolInput(query);
  if (!input || !state.symbolsLoaded) return [];
  return state.symbols
    .filter((item) => String(item.s || "").startsWith(input))
    .slice(0, 20);
}

function renderSuggestions(container, suggestions, activeIndex) {
  if (!container) return;
  if (!suggestions.length) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = suggestions
    .map((item, index) => {
      const isActive = index === activeIndex;
      const style = isActive ? 'style="background: rgba(148, 163, 184, 0.18);"' : "";
      return `
        <div class="rv-watchlist-suggestion${isActive ? " is-active" : ""}" data-index="${index}" ${style}>
          <strong>${item.s}</strong>
          <span>${item.n ? `— ${item.n}` : ""}</span>
        </div>
      `;
    })
    .join("");
}

function buildRows(list) {
  return list.map((symbol) => {
    const quote = state.quotes.get(symbol) || {};
    const metrics = state.metrics.get(symbol) || {};
    const earnings = state.earnings.get(symbol) || {};
    return {
      symbol,
      price: quote.price ?? null,
      changePercent: quote.changePercent ?? null,
      updatedAt: quote.ts || state.lastUpdatedAt,
      source: quote.source || state.source,
      marketCap: metrics.marketCap ?? null,
      perf1w: metrics.perf1w ?? null,
      perf1m: metrics.perf1m ?? null,
      perf1y: metrics.perf1y ?? null,
      rsi: metrics.rsi ?? null,
      rsiWeekly: metrics.rsiWeekly ?? null,
      nextEarnings: earnings.date || null
    };
  });
}

function sortRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function renderTable(root, list, logger) {
  const rows = sortRows(buildRows(list));
  const sortLabel = (label, key) => {
    if (state.sortKey !== key) return label;
    return `${label} ${state.sortDir === "asc" ? "^" : "v"}`;
  };

  root.innerHTML = `
    <div class="rv-watchlist">
      <div class="rv-watchlist-input">
        <input type="text" placeholder="Symbol (z.B. AAPL)" data-rv-watchlist-input list="rv-watchlist-symbols" />
        <datalist id="rv-watchlist-symbols"></datalist>
        <button type="button" data-rv-watchlist-add>Add</button>
      </div>
      <div class="rv-watchlist-suggestions" data-rv-watchlist-suggestions hidden style="border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 6px; display: grid; gap: 6px;"></div>
      <div class="rv-native-error" data-rv-watchlist-error style="${state.errorNote ? "" : "display:none;"}">${state.errorNote}</div>
      <div class="rv-native-note" data-rv-watchlist-info style="${state.infoNote ? "" : "display:none;"}">${state.infoNote}</div>
      <div class="rv-native-table-wrap">
        <table class="rv-native-table">
          <thead>
            <tr>
              <th data-rv-sort="symbol">${sortLabel("Symbol", "symbol")}</th>
              <th data-rv-sort="price">${sortLabel("Price", "price")}</th>
              <th data-rv-sort="changePercent">${sortLabel("Change%", "changePercent")}</th>
              <th data-rv-sort="marketCap">${sortLabel("Market Cap", "marketCap")}</th>
              <th data-rv-sort="perf1w">${sortLabel("1W", "perf1w")}</th>
              <th data-rv-sort="perf1m">${sortLabel("1M", "perf1m")}</th>
              <th data-rv-sort="perf1y">${sortLabel("1Y", "perf1y")}</th>
              <th data-rv-sort="rsi">${sortLabel("Daily RSI", "rsi")}</th>
              <th data-rv-sort="rsiWeekly">${sortLabel("Weekly RSI", "rsiWeekly")}</th>
              <th data-rv-sort="nextEarnings">${sortLabel("Next Earnings", "nextEarnings")}</th>
              <th data-rv-sort="updatedAt">${sortLabel("Updated", "updatedAt")}</th>
              <th data-rv-sort="source">${sortLabel("Source", "source")}</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const changeClass = row.changePercent >= 0 ? "rv-native-positive" : "rv-native-negative";
                const perfClass = (value) =>
                  value === null ? "" : value >= 0 ? "rv-native-positive" : "rv-native-negative";
                const rsiClass =
                  row.rsi === null
                    ? ""
                    : row.rsi < 30
                      ? "rv-native-negative"
                      : row.rsi > 70
                        ? "rv-native-positive"
                        : "rv-native-warning";
                const rsiWeeklyClass =
                  row.rsiWeekly === null
                    ? ""
                    : row.rsiWeekly < 30
                      ? "rv-native-negative"
                      : row.rsiWeekly > 70
                        ? "rv-native-positive"
                        : "rv-native-warning";
                return `
                  <tr>
                    <td>${row.symbol}</td>
                    <td>$${formatNumber(row.price, { maximumFractionDigits: 2 })}</td>
                    <td class="${changeClass}">${formatPercent(row.changePercent)}</td>
                    <td>${formatCompact(row.marketCap)}</td>
                    <td class="${perfClass(row.perf1w)}">${formatPercent(row.perf1w)}</td>
                    <td class="${perfClass(row.perf1m)}">${formatPercent(row.perf1m)}</td>
                    <td class="${perfClass(row.perf1y)}">${formatPercent(row.perf1y)}</td>
                    <td class="${rsiClass}">${formatNumber(row.rsi, { maximumFractionDigits: 1 })}</td>
                    <td class="${rsiWeeklyClass}">${formatNumber(row.rsiWeekly, { maximumFractionDigits: 1 })}</td>
                    <td>${row.nextEarnings ? new Date(row.nextEarnings).toLocaleDateString() : "—"}</td>
                    <td>${formatTime(row.updatedAt)}</td>
                    <td>${row.source || state.source || "stooq"}</td>
                    <td><button type="button" data-symbol="${row.symbol}" data-rv-watchlist-remove="${row.symbol}">Remove</button></td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  logger?.setMeta({
    updatedAt: state.lastUpdatedAt || new Date().toISOString(),
    source: state.source || "stooq",
    isStale: false
  });
}

function updateErrorNote(root) {
  const errorEl = root.querySelector("[data-rv-watchlist-error]");
  if (!errorEl) return;
  if (!state.errorNote) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
    return;
  }
  errorEl.textContent = state.errorNote;
  errorEl.style.display = "block";
}

function updateInfoNote(root) {
  const infoEl = root.querySelector("[data-rv-watchlist-info]");
  if (!infoEl) return;
  if (!state.infoNote) {
    infoEl.textContent = "";
    infoEl.style.display = "none";
    return;
  }
  infoEl.textContent = state.infoNote;
  infoEl.style.display = "block";
}

function refreshInfoNote() {
  const notes = [];
  if (state.metricsMissing) {
    notes.push("Market cap requires FINNHUB_API_KEY.");
  }
  if (state.earningsMissing) {
    notes.push("Next earnings requires FINNHUB_API_KEY.");
  }
  state.infoNote = notes.join(" ");
}

function startCountdown(root) {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((state.backoffUntil - Date.now()) / 1000));
    if (remaining <= 0) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      return;
    }
    state.errorNote = `RATE_LIMITED: retry in ${remaining}s.`;
    updateErrorNote(root);
  }, 1000);
}

function scheduleRefresh(root, list, logger) {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
  }

  if (!state.isVisible) return;

  const now = Date.now();
  const delay =
    state.backoffUntil && state.backoffUntil > now
      ? state.backoffUntil - now
      : DEFAULT_REFRESH_MS;

  state.refreshTimer = setTimeout(() => {
    refreshQuotes(root, list, logger);
  }, delay);
}

async function refreshQuotes(root, list, logger) {
  if (!list.length) {
    logger?.setStatus("PARTIAL", "No symbols");
    return;
  }

  const symbols = list.slice(0, 20);
  const query = symbols.join(",");
  const payload = await fetchJSON(`/quotes?symbols=${encodeURIComponent(query)}`, {
    feature: "rv-watchlist-local",
    traceId: createTraceId(),
    logger
  });

  const errorCode = payload?.error?.code || "";
  const cacheLayer = payload?.cache?.layer || "none";
  const upstreamStatus = payload?.upstream?.status;

  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: upstreamStatus ?? null
  });

  if (!payload?.ok) {
    state.errorNote = "";
    const shadow = loadShadowQuotes();
    const shadowTs = shadow?.storedAt || shadow?.data?.updatedAt || null;
    const shadowAge =
      shadowTs && !Number.isNaN(Date.parse(shadowTs)) ? Date.now() - Date.parse(shadowTs) : null;
    const shadowQuotes = shadow?.data?.quotes || null;
    if (shadowQuotes && shadowAge !== null && shadowAge < STALE_MAX_MS) {
      state.quotes = new Map(shadowQuotes.map((item) => [item.symbol, item]));
      state.lastUpdatedAt = shadow?.data?.updatedAt || shadowTs;
      state.source = "shadow";
      const staleNote = formatStaleMinutes(shadowAge);
      logger?.setStatus("PARTIAL", staleNote ? `Stale ${staleNote}` : "Stale fallback");
      logger?.setMeta({
        updatedAt: shadow?.data?.updatedAt || shadowTs,
        source: "shadow",
        isStale: true,
        staleAgeMs: shadowAge
      });
      state.errorNote = staleNote
        ? `PARTIAL: stale ${staleNote}.`
        : "PARTIAL: stale cache fallback.";
      renderTable(root, list, logger);
      updateInfoNote(root);
      scheduleRefresh(root, list, logger);
      return;
    }

    if (errorCode === "RATE_LIMITED") {
      state.backoffLevel = Math.min(state.backoffLevel + 1, BACKOFF_STEPS.length - 1);
      state.backoffUntil = Date.now() + BACKOFF_STEPS[state.backoffLevel];
      logger?.setStatus("PARTIAL", "RATE_LIMITED");
      state.errorNote = `RATE_LIMITED: retry in ${Math.round(BACKOFF_STEPS[state.backoffLevel] / 1000)}s.`;
      startCountdown(root);
    } else if (errorCode === "ENV_MISSING") {
      logger?.setStatus("FAIL", "ENV_MISSING");
      const missing = payload?.error?.details?.missing;
      state.errorNote = missing?.length
        ? `ENV_MISSING: ${missing.join(", ")}`
        : "ENV_MISSING: Provider key missing.";
    } else if (errorCode === "BINDING_MISSING") {
      logger?.setStatus("FAIL", "BINDING_MISSING");
      state.errorNote = getBindingHint(payload);
    } else if (errorCode === "SCHEMA_INVALID") {
      logger?.setStatus("FAIL", "SCHEMA_INVALID");
      state.errorNote = "SCHEMA_INVALID: invalid response schema.";
    } else {
      logger?.setStatus("FAIL", `API error (${errorCode || "UNKNOWN"})`);
      state.errorNote = `API error: ${errorCode || "UNKNOWN"}`;
    }

    logger?.setMeta({
      updatedAt: payload?.ts,
      source: `Cache ${cacheLayer}`,
      isStale: false
    });
    renderTable(root, list, logger);
    updateInfoNote(root);
    scheduleRefresh(root, list, logger);
    return;
  }

  const quotes = payload?.data?.quotes || [];
  state.errorNote = "";
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
  state.quotes = new Map(quotes.map((item) => [item.symbol, item]));
  state.lastUpdatedAt = payload?.data?.updatedAt || payload?.ts;
  state.source = payload?.data?.source || "stooq";
  saveShadowQuotes(quotes, state.lastUpdatedAt);
  state.backoffLevel = 0;
  state.backoffUntil = 0;

  const hasWarning = payload?.error?.code;
  logger?.setStatus(
    payload?.isStale || hasWarning ? "PARTIAL" : "OK",
    payload?.isStale ? "Stale data" : hasWarning ? "Partial data" : "Live"
  );
  logger?.setMeta({
    updatedAt: state.lastUpdatedAt,
    source: state.source,
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });

  renderTable(root, list, logger);
  updateInfoNote(root);
  await refreshMetrics(root, list, logger);
  await refreshEarnings(root, list, logger);
  scheduleRefresh(root, list, logger);
}

async function refreshMetrics(root, list, logger) {
  if (!list.length) return;
  const now = Date.now();
  if (state.metricsUpdatedAt && now - state.metricsUpdatedAt < METRICS_TTL_MS) return;
  const symbols = list.slice(0, 20).join(",");
  const payload = await fetchJSON(`/tech-signals?symbols=${encodeURIComponent(symbols)}`, {
    feature: SHADOW_FEATURE,
    traceId: createTraceId(),
    logger
  });

  if (payload?.ok && payload?.data?.signals) {
    state.metrics = new Map(payload.data.signals.map((item) => [item.symbol, item]));
    state.metricsUpdatedAt = Date.now();
    const hasMarketCap = payload.data.signals.some((item) => Number.isFinite(item.marketCap));
    state.metricsMissing = !hasMarketCap;
    refreshInfoNote();
    renderTable(root, list, logger);
    updateInfoNote(root);
    return;
  }

  if (payload?.error?.code === "ENV_MISSING") {
    state.metricsMissing = true;
    refreshInfoNote();
    updateInfoNote(root);
  }
}

async function refreshEarnings(root, list, logger) {
  if (!list.length) return;
  const now = Date.now();
  if (state.earningsUpdatedAt && now - state.earningsUpdatedAt < EARNINGS_TTL_MS) return;
  const payload = await fetchJSON(`/earnings-calendar?days=30`, {
    feature: SHADOW_FEATURE,
    traceId: createTraceId(),
    logger
  });

  if (payload?.ok && payload?.data?.items) {
    const map = new Map();
    payload.data.items.forEach((item) => {
      if (!item.symbol) return;
      if (!list.includes(item.symbol)) return;
      const existing = map.get(item.symbol);
      if (!existing || new Date(item.date) < new Date(existing.date)) {
        map.set(item.symbol, { date: item.date, time: item.time || "" });
      }
    });
    state.earnings = map;
    state.earningsUpdatedAt = Date.now();
    state.earningsMissing = false;
    refreshInfoNote();
    renderTable(root, list, logger);
    updateInfoNote(root);
  } else if (payload?.error?.code === "ENV_MISSING") {
    state.earningsMissing = true;
    refreshInfoNote();
    updateInfoNote(root);
  }
}

function bind(root, list, logger) {
  const input = root.querySelector("[data-rv-watchlist-input]");
  const addButton = root.querySelector("[data-rv-watchlist-add]");
  const suggestionsBox = root.querySelector("[data-rv-watchlist-suggestions]");
  const tableBody = root.querySelector("tbody");
  const tableHead = root.querySelector("thead");

  let debounceId = null;

  const addSymbol = (symbolValue) => {
    const value = normalizeSymbolInput(symbolValue || input?.value);
    if (!value) return;
    if (!/^[A-Z0-9.:-]{1,8}$/.test(value)) {
      logger?.warn("watchlist_invalid_symbol", { symbol: value });
      state.errorNote = "Invalid symbol format.";
      updateErrorNote(root);
      return;
    }
    if (!list.includes(value) && list.length >= 20) {
      state.errorNote = "Watchlist limit reached (max 20 symbols).";
      logger?.setStatus("PARTIAL", "Limit reached");
      renderTable(root, list, logger);
      bind(root, list, logger);
      updateErrorNote(root);
      return;
    }
    if (!list.includes(value)) {
      list.push(value);
      saveList(list, logger);
      updateShared(list);
      logger?.info("watchlist_added", { symbol: value });
    }
    state.errorNote = "";
    if (input) input.value = "";
    state.suggestions = [];
    state.activeIndex = -1;
    renderTable(root, list, logger);
    bind(root, list, logger);
    populateDatalist(root);
    refreshQuotes(root, list, logger);
  };

  addButton?.addEventListener("click", () => addSymbol());
  input?.addEventListener("focus", async () => {
    await loadSymbols(logger);
    populateDatalist(root);
  });
  input?.addEventListener("input", (event) => {
    event.target.value = normalizeSymbolInput(event.target.value);
    const query = event.target.value;
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      state.suggestions = findSuggestions(query);
      state.activeIndex = 0;
      renderSuggestions(suggestionsBox, state.suggestions, state.activeIndex);
    }, 120);
  });

  input?.addEventListener("blur", () => {
    setTimeout(() => {
      state.suggestions = [];
      state.activeIndex = -1;
      renderSuggestions(suggestionsBox, state.suggestions, state.activeIndex);
    }, 120);
  });

  input?.addEventListener("keydown", (event) => {
    if (!state.suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.activeIndex = (state.activeIndex + 1) % state.suggestions.length;
      renderSuggestions(suggestionsBox, state.suggestions, state.activeIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.activeIndex =
        state.activeIndex <= 0 ? state.suggestions.length - 1 : state.activeIndex - 1;
      renderSuggestions(suggestionsBox, state.suggestions, state.activeIndex);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = state.suggestions[state.activeIndex];
      if (selected?.s) addSymbol(selected.s);
    } else if (event.key === "Escape") {
      state.suggestions = [];
      state.activeIndex = -1;
      renderSuggestions(suggestionsBox, state.suggestions, state.activeIndex);
    }
  });

  suggestionsBox?.addEventListener("click", (event) => {
    const item = event.target.closest(".rv-watchlist-suggestion");
    if (!item) return;
    const index = Number(item.getAttribute("data-index"));
    const selected = state.suggestions[index];
    if (selected?.s) addSymbol(selected.s);
  });

  tableBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rv-watchlist-remove]");
    if (!button) return;
    const symbol = button.getAttribute("data-symbol") || button.getAttribute("data-rv-watchlist-remove");
    if (!symbol) return;
    const next = list.filter((item) => item !== symbol);
    saveList(next, logger);
    updateShared(next);
    logger?.info("watchlist_removed", { symbol });
    renderTable(root, next, logger);
    bind(root, next, logger);
    refreshQuotes(root, next, logger);
  });

  tableHead?.addEventListener("click", (event) => {
    const th = event.target.closest("[data-rv-sort]");
    if (!th) return;
    const key = th.getAttribute("data-rv-sort");
    if (!key) return;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDir = "asc";
    }
    renderTable(root, list, logger);
    bind(root, list, logger);
  });
}

function setupVisibility(root, list, logger) {
  state.isVisible = document.visibilityState === "visible";
  document.addEventListener("visibilitychange", () => {
    state.isVisible = document.visibilityState === "visible";
    if (state.isVisible) {
      refreshQuotes(root, list, logger);
    } else if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
    }
  });
}

export async function init(root, context = {}) {
  const logger = context?.logger;
  const list = loadList(logger);
  updateShared(list);
  refreshInfoNote();
  renderTable(root, list, logger);
  bind(root, list, logger);
  populateDatalist(root);
  setupVisibility(root, list, logger);
  refreshQuotes(root, list, logger);
}

export async function refresh(root, context = {}) {
  const logger = context?.logger;
  const list = loadList(logger);
  updateShared(list);
  refreshInfoNote();
  renderTable(root, list, logger);
  bind(root, list, logger);
  populateDatalist(root);
  refreshQuotes(root, list, logger);
}
