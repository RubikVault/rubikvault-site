import { fetchJSON, getBindingHint } from "./utils/api.js";

const STORAGE_KEY = "rv_watchlist_local";
const QUOTES_CACHE_KEY = "rv_watchlist_quotes";
const SYMBOLS_PATH = "./assets/nasdaq_symbols.min.json";
const DEFAULT_LIST = ["AAPL", "NVDA"];
const DEFAULT_REFRESH_MS = 120_000;
const BACKOFF_STEPS = [120_000, 300_000, 900_000];
const STALE_MAX_MS = 15 * 60 * 1000;

const state = {
  symbols: [],
  symbolsLoaded: false,
  suggestions: [],
  activeIndex: -1,
  quotes: new Map(),
  lastUpdatedAt: null,
  source: "stooq",
  refreshTimer: null,
  backoffLevel: 0,
  backoffUntil: 0,
  isVisible: true,
  errorNote: "",
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

function loadShadowQuotes() {
  try {
    const raw = window.localStorage?.getItem(QUOTES_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveShadowQuotes(quotes) {
  try {
    window.localStorage?.setItem(
      QUOTES_CACHE_KEY,
      JSON.stringify({ ts: new Date().toISOString(), quotes })
    );
  } catch (error) {
    // ignore
  }
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat("en-US", options).format(value);
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
  const input = query.trim().toUpperCase();
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

function renderTable(root, list, logger) {
  const rows = list
    .map((symbol) => {
      const quote = state.quotes.get(symbol);
      const changeValue = quote?.changePercent ?? null;
      const changeClass = changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
      return `
        <tr>
          <td>${symbol}</td>
          <td>$${formatNumber(quote?.price, { maximumFractionDigits: 2 })}</td>
          <td class="${changeClass}">${formatNumber(changeValue, { maximumFractionDigits: 2 })}%</td>
          <td>${formatTime(quote?.ts || state.lastUpdatedAt)}</td>
          <td>${quote?.source || state.source || "stooq"}</td>
          <td><button type="button" data-rv-watchlist-remove="${symbol}">Remove</button></td>
        </tr>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="rv-watchlist">
      <div class="rv-watchlist-input">
        <input type="text" placeholder="Symbol (z.B. AAPL)" data-rv-watchlist-input />
        <button type="button" data-rv-watchlist-add>Add</button>
      </div>
      <div class="rv-watchlist-suggestions" data-rv-watchlist-suggestions hidden style="border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 6px; display: grid; gap: 6px;"></div>
      <div class="rv-native-error" data-rv-watchlist-error style="${state.errorNote ? "" : "display:none;"}">${state.errorNote}</div>
      <div class="rv-native-table-wrap">
        <table class="rv-native-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Change%</th>
              <th>Updated</th>
              <th>Source</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows || ""}
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
    const shadowAge =
      shadow?.ts && !Number.isNaN(Date.parse(shadow.ts)) ? Date.now() - Date.parse(shadow.ts) : null;
    if (shadow?.quotes && shadowAge !== null && shadowAge < STALE_MAX_MS) {
      state.quotes = new Map(shadow.quotes.map((item) => [item.symbol, item]));
      state.lastUpdatedAt = shadow.ts;
      state.source = "shadow";
      const staleNote = formatStaleMinutes(shadowAge);
      logger?.setStatus("PARTIAL", staleNote ? `Stale ${staleNote}` : "Stale fallback");
      logger?.setMeta({
        updatedAt: shadow.ts,
        source: "shadow",
        isStale: true,
        staleAgeMs: shadowAge
      });
      state.errorNote = staleNote
        ? `PARTIAL: stale ${staleNote}.`
        : "PARTIAL: stale cache fallback.";
      renderTable(root, list, logger);
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
  saveShadowQuotes(quotes);
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
  scheduleRefresh(root, list, logger);
}

function bind(root, list, logger) {
  const input = root.querySelector("[data-rv-watchlist-input]");
  const addButton = root.querySelector("[data-rv-watchlist-add]");
  const suggestionsBox = root.querySelector("[data-rv-watchlist-suggestions]");
  const tableBody = root.querySelector("tbody");

  let debounceId = null;

  const addSymbol = (symbolValue) => {
    const value = symbolValue || input?.value?.trim().toUpperCase();
    if (!value) return;
    if (!/^[A-Z0-9.:-]+$/.test(value)) {
      logger?.warn("watchlist_invalid_symbol", { symbol: value });
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
    refreshQuotes(root, list, logger);
  };

  addButton?.addEventListener("click", () => addSymbol());
  input?.addEventListener("focus", () => loadSymbols(logger));
  input?.addEventListener("input", (event) => {
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
    const symbol = button.getAttribute("data-rv-watchlist-remove");
    if (!symbol) return;
    const next = list.filter((item) => item !== symbol);
    saveList(next, logger);
    updateShared(next);
    logger?.info("watchlist_removed", { symbol });
    renderTable(root, next, logger);
    bind(root, next, logger);
    refreshQuotes(root, next, logger);
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
  renderTable(root, list, logger);
  bind(root, list, logger);
  setupVisibility(root, list, logger);
  refreshQuotes(root, list, logger);
}

export async function refresh(root, context = {}) {
  const logger = context?.logger;
  const list = loadList(logger);
  updateShared(list);
  renderTable(root, list, logger);
  bind(root, list, logger);
  refreshQuotes(root, list, logger);
}
