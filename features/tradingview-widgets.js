const NASDAQ_OVERRIDE = new Set([
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "TSLA",
  "NFLX",
  "GOOGL",
  "COST"
]);

const STOCK_LISTS = {
  nasdaq: [
    { s: "AAPL", n: "Apple" },
    { s: "MSFT", n: "Microsoft" },
    { s: "NVDA", n: "NVIDIA" },
    { s: "AMZN", n: "Amazon" },
    { s: "META", n: "Meta" },
    { s: "GOOGL", n: "Alphabet" },
    { s: "TSLA", n: "Tesla" },
    { s: "AVGO", n: "Broadcom" },
    { s: "COST", n: "Costco" },
    { s: "PEP", n: "PepsiCo" },
    { s: "NFLX", n: "Netflix" },
    { s: "AMD", n: "AMD" }
  ],
  dow: [
    { s: "MMM", n: "3M" },
    { s: "AXP", n: "Am. Express" },
    { s: "AMGN", n: "Amgen" },
    { s: "AAPL", n: "Apple" },
    { s: "BA", n: "Boeing" },
    { s: "CAT", n: "Caterpillar" },
    { s: "CVX", n: "Chevron" },
    { s: "CSCO", n: "Cisco" },
    { s: "KO", n: "Coca-Cola" },
    { s: "DIS", n: "Disney" },
    { s: "DOW", n: "Dow Inc" },
    { s: "GS", n: "Goldman" }
  ],
  sp500: [
    { s: "SPY", n: "S&P 500 ETF" },
    { s: "JPM", n: "JPMorgan" },
    { s: "V", n: "Visa" },
    { s: "LLY", n: "Lilly" },
    { s: "MA", n: "Mastercard" },
    { s: "HD", n: "Home Depot" },
    { s: "XOM", n: "Exxon" },
    { s: "UNH", n: "UnitedHealth" }
  ]
};

const DEFAULT_SYMBOL = { symbol: "NASDAQ:AAPL", name: "Apple Inc." };

function getFullSymbol(symbol, category) {
  if (symbol.includes(":")) return symbol;
  let exchange = category === "dow" ? "NYSE" : "NASDAQ";
  if (symbol === "SPY") exchange = "AMEX";
  if (NASDAQ_OVERRIDE.has(symbol)) exchange = "NASDAQ";
  return `${exchange}:${symbol}`;
}

function buildMarkup(root) {
  root.innerHTML = `
    <div class="rv-tradingview">
      <div class="rv-tradingview-header">
        <div>
          <h3>Live market widgets</h3>
          <p class="rv-tradingview-subtitle">
            Select a stock to load TradingView technicals and fundamentals.
          </p>
        </div>
        <div class="rv-tradingview-actions">
          <button class="rv-pill-button" type="button" data-rv-category="nasdaq">NASDAQ</button>
          <button class="rv-pill-button" type="button" data-rv-category="dow">Dow</button>
          <button class="rv-pill-button" type="button" data-rv-category="sp500">S&amp;P 500</button>
        </div>
      </div>
      <div class="rv-tradingview-body">
        <aside class="rv-stock-panel">
          <div class="rv-stock-search">
            <input type="text" placeholder="Search stocks" data-rv-stock-search />
          </div>
          <div class="rv-stock-list" data-rv-stock-list></div>
        </aside>
        <div class="rv-tradingview-widgets">
          <div class="rv-widget-card">
            <h4 class="rv-widget-title">Selected</h4>
            <div class="rv-widget-selected" data-rv-selected-name>${DEFAULT_SYMBOL.name} (${DEFAULT_SYMBOL.symbol})</div>
          </div>
          <div class="rv-widget-card">
            <h4 class="rv-widget-title">Technicals</h4>
            <div class="tradingview-widget-container" data-rv-widget="technicals"></div>
          </div>
          <div class="rv-widget-card">
            <h4 class="rv-widget-title">Fundamentals</h4>
            <div class="tradingview-widget-container" data-rv-widget="fundamentals"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStockList(root, category) {
  const list = root.querySelector("[data-rv-stock-list]");
  if (!list) return;
  const data = STOCK_LISTS[category] || [];
  list.innerHTML = data
    .map((stock) => {
      const fullSymbol = getFullSymbol(stock.s, category);
      return `
        <button class="rv-stock-item" type="button" data-rv-symbol="${fullSymbol}" data-rv-name="${stock.n}">
          <span class="rv-stock-symbol">${stock.s}</span>
          <span class="rv-stock-name">${stock.n}</span>
        </button>
      `;
    })
    .join("");
}

function renderWidget(container, src, config) {
  if (!container) return;
  container.innerHTML = "";
  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = src;
  script.async = true;
  script.innerHTML = JSON.stringify(config);
  container.appendChild(script);
}

function updateWidgets(root, symbol, name) {
  const selected = root.querySelector("[data-rv-selected-name]");
  if (selected) selected.textContent = `${name} (${symbol})`;

  const technicals = root.querySelector('[data-rv-widget="technicals"]');
  const fundamentals = root.querySelector('[data-rv-widget="fundamentals"]');

  renderWidget(
    technicals,
    "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js",
    {
      interval: "1D",
      width: "100%",
      height: "100%",
      symbol,
      showIntervalTabs: true,
      displayMode: "single",
      locale: "en",
      colorTheme: "dark",
      isTransparent: true
    }
  );

  renderWidget(
    fundamentals,
    "https://s3.tradingview.com/external-embedding/embed-widget-financials.js",
    {
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "regular",
      width: "100%",
      height: "100%",
      symbol,
      locale: "en"
    }
  );
}

function bindInteractions(root) {
  const searchInput = root.querySelector("[data-rv-stock-search]");

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rv-category]");
    if (button) {
      const category = button.getAttribute("data-rv-category");
      renderStockList(root, category);
      return;
    }

    const stockButton = event.target.closest(".rv-stock-item");
    if (stockButton) {
      const symbol = stockButton.getAttribute("data-rv-symbol");
      const name = stockButton.getAttribute("data-rv-name");
      if (symbol && name) updateWidgets(root, symbol, name);
    }
  });

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      const query = event.target.value.trim().toUpperCase();
      const items = Array.from(root.querySelectorAll(".rv-stock-item"));
      items.forEach((item) => {
        const text = item.textContent.toUpperCase();
        item.hidden = query && !text.includes(query);
      });
    });
  }
}

export async function init(root, context = {}) {
  buildMarkup(root);
  renderStockList(root, "nasdaq");
  bindInteractions(root);
  updateWidgets(root, DEFAULT_SYMBOL.symbol, DEFAULT_SYMBOL.name);

  const logger = context?.logger;
  logger?.setStatus("OK", "Widgets ready");
  logger?.setMeta({ updatedAt: new Date().toISOString(), source: "TradingView" });
}

export async function refresh(root, context = {}) {
  updateWidgets(root, DEFAULT_SYMBOL.symbol, DEFAULT_SYMBOL.name);
  const logger = context?.logger;
  logger?.setStatus("OK", "Widgets refreshed");
  logger?.setMeta({ updatedAt: new Date().toISOString(), source: "TradingView" });
}
