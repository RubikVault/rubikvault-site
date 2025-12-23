const STORAGE_KEY = "rv_watchlist_local";
const DEFAULT_LIST = ["AAPL", "NVDA"];

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

function render(root, list, logger) {
  root.innerHTML = `
    <div class="rv-watchlist">
      <div class="rv-watchlist-input">
        <input type="text" placeholder="Symbol (z.B. AAPL)" data-rv-watchlist-input />
        <button type="button" data-rv-watchlist-add>Add</button>
      </div>
      <div class="rv-watchlist-list" data-rv-watchlist-list>
        ${list
          .map(
            (symbol) => `
              <div class="rv-watchlist-item" data-rv-symbol="${symbol}">
                <strong>${symbol}</strong>
                <button type="button" data-rv-watchlist-remove="${symbol}">Remove</button>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;

  logger?.setStatus("OK", "Local");
  logger?.setMeta({ updatedAt: new Date().toISOString(), source: "local" });
}

function bind(root, list, logger) {
  const input = root.querySelector("[data-rv-watchlist-input]");
  const addButton = root.querySelector("[data-rv-watchlist-add]");
  const listContainer = root.querySelector("[data-rv-watchlist-list]");

  const addSymbol = () => {
    const value = input?.value?.trim().toUpperCase();
    if (!value) return;
    if (!/^[A-Z0-9.:-]+$/.test(value)) {
      logger?.warn("watchlist_invalid_symbol", { symbol: value });
      return;
    }
    if (!list.includes(value)) {
      list.push(value);
      saveList(list, logger);
      updateShared(list);
      logger?.info("watchlist_added", { symbol: value });
      render(root, list, logger);
      bind(root, list, logger);
    }
    if (input) input.value = "";
  };

  addButton?.addEventListener("click", addSymbol);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addSymbol();
  });

  listContainer?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rv-watchlist-remove]");
    if (!button) return;
    const symbol = button.getAttribute("data-rv-watchlist-remove");
    if (!symbol) return;
    const next = list.filter((item) => item !== symbol);
    saveList(next, logger);
    updateShared(next);
    logger?.info("watchlist_removed", { symbol });
    render(root, next, logger);
    bind(root, next, logger);
  });
}

export async function init(root, context = {}) {
  const logger = context?.logger;
  const list = loadList(logger);
  updateShared(list);
  render(root, list, logger);
  bind(root, list, logger);
}

export async function refresh(root, context = {}) {
  const logger = context?.logger;
  const list = loadList(logger);
  updateShared(list);
  render(root, list, logger);
  bind(root, list, logger);
}
