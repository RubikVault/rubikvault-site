/* ==========================================================================
   RUBIK VAULT - MASTER LOGIC
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initUSMarketTimer();
    initNewsFeed();
    initWatchlist();
    initMCS();
    
    // Default load: Apple
    loadStockList('nasdaq');
    updateExplorer('NASDAQ:AAPL', 'Apple Inc');
    
    // Intervals
    setInterval(initUSMarketTimer, 1000); 
    setInterval(initNewsFeed, 30000); 

    // Neue Init (additiv)
    RV.modules.theme.init();
    RV.modules.marketTimer.render();
    setInterval(RV.modules.marketTimer.render, 1000);
    RV.modules.newsFeed.init();
    RV.modules.watchlist.init();
    RV.modules.mcs.init();
    RV.modules.dailyInsight.init();
    RV.modules.stockExplorer.init();
    RV.modules.layout.init();
    RV.modules.onboarding.init();
    RV.modules.pwa.init();
    RV.modules.devPanel.init();
    // Heartbeat for Time-on-Site (Approx)
    setInterval(() => plausible('Heartbeat'), 30000);
});

/* --- 1. DATASETS --- */
const SUGGESTIONS_DB = [
    {s:'AAPL', n:'Apple Inc', t:'Stock'}, {s:'MSFT', n:'Microsoft', t:'Stock'}, {s:'NVDA', n:'NVIDIA', t:'Stock'},
    {s:'AMZN', n:'Amazon', t:'Stock'}, {s:'GOOGL', n:'Alphabet', t:'Stock'}, {s:'TSLA', n:'Tesla', t:'Stock'},
    {s:'META', n:'Meta Platforms', t:'Stock'}, {s:'BTCUSDT', n:'Bitcoin', t:'Crypto'}, {s:'ETHUSDT', n:'Ethereum', t:'Crypto'},
    {s:'AMD', n:'AMD', t:'Stock'}, {s:'NFLX', n:'Netflix', t:'Stock'}, {s:'INTC', n:'Intel', t:'Stock'},
    {s:'PYPL', n:'PayPal', t:'Stock'}, {s:'ADBE', n:'Adobe', t:'Stock'}, {s:'SOLUSDT', n:'Solana', t:'Crypto'}
];

const STOCK_LISTS = {
    nasdaq: [
        { s: "AAPL", n: "Apple" }, { s: "MSFT", n: "Microsoft" }, { s: "NVDA", n: "NVIDIA" }, { s: "AMZN", n: "Amazon" },
        { s: "META", n: "Meta" }, { s: "GOOGL", n: "Alphabet" }, { s: "TSLA", n: "Tesla" }, { s: "AVGO", n: "Broadcom" },
        { s: "COST", n: "Costco" }, { s: "PEP", n: "PepsiCo" }, { s: "NFLX", n: "Netflix" }, { s: "AMD", n: "AMD" }
    ],
    dow: [
        { s: "MMM", n: "3M" }, { s: "AXP", n: "Am. Express" }, { s: "AMGN", n: "Amgen" }, { s: "AAPL", n: "Apple" },
        { s: "BA", n: "Boeing" }, { s: "CAT", n: "Caterpillar" }, { s: "CVX", n: "Chevron" }, { s: "CSCO", n: "Cisco" },
        { s: "KO", n: "Coca-Cola" }, { s: "DIS", n: "Disney" }, { s: "DOW", n: "Dow Inc" }, { s: "GS", n: "Goldman" }
    ],
    sp500: [
        { s: "SPY", n: "S&P 500 ETF" }, { s: "JPM", n: "JPMorgan" }, { s: "V", n: "Visa" }, { s: "LLY", n: "Lilly" },
        { s: "MA", n: "Mastercard" }, { s: "HD", n: "Home Depot" }, { s: "XOM", n: "Exxon" }, { s: "UNH", n: "UnitedHealth" }
    ]
};

/* --- 2. WATCHLIST WITH AUTOCOMPLETE --- */
function initWatchlist() {
    const input = document.getElementById('wl-input');
    const suggestionsBox = document.getElementById('wl-suggestions');
    const container = document.getElementById('wl-container');
    const btn = document.getElementById('wl-add-btn');
    
    let watchlist = JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA'];

    const render = () => {
        container.innerHTML = watchlist.map(sym => `
            <div class="rv-wl-item">
                <div style="font-weight:bold">${sym}</div>
                <div style="font-size:10px; color:#aaa;">Stock</div>
                <span class="rv-wl-remove" onclick="removeFromWatchlist('${sym}')">&times;</span>
            </div>
        `).join('');
    };

    const addToWatchlist = (sym) => {
        sym = sym.toUpperCase();
        if (watchlist.includes(sym) || !SUGGESTIONS_DB.some(s => s.s === sym)) return;
        watchlist.push(sym);
        localStorage.setItem('rv_watchlist', JSON.stringify(watchlist));
        render();
    };

    const removeFromWatchlist = (sym) => {
        watchlist = watchlist.filter(s => s !== sym);
        localStorage.setItem('rv_watchlist', JSON.stringify(watchlist));
        render();
    };

    input.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        if (val.length < 1) { suggestionsBox.style.display = 'none'; return; }
        const matches = SUGGESTIONS_DB.filter(x => x.s.startsWith(val) || x.n.toUpperCase().startsWith(val));
        if (matches.length > 0) {
            suggestionsBox.innerHTML = matches.map(m => `
                <div class="rv-suggestion-item" onclick="addToWatchlist('${m.s}')">${m.s} <span style="color:#666">(${m.n})</span></div>
            `).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    btn.addEventListener('click', () => {
        if (input.value) addToWatchlist(input.value);
        input.value = '';
        suggestionsBox.style.display = 'none';
    });

    render();
}

/* --- 3. US MARKET TIMER --- */
function initUSMarketTimer() {
    const statusText = document.getElementById('mt-status');
    const dot = document.getElementById('mt-dot');
    const timeDisplay = document.getElementById('mt-time');

    const options = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false };
    const nyTimeStr = new Date().toLocaleTimeString('en-US', options);
    timeDisplay.innerText = `NY: ${nyTimeStr}`;

    const nyDate = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
    const nowNY = new Date(nyDate);
    const hours = nowNY.getHours();
    const minutes = nowNY.getMinutes();

    let status = 'CLOSED', dotClass = 'status-closed';
    if (hours >= 9 && hours < 16 || (hours === 9 && minutes >= 30)) {
        status = 'OPEN'; dotClass = 'status-open';
    } else if (hours === 9 && minutes < 30) {
        status = 'PRE'; dotClass = 'status-pre';
    }

    statusText.innerText = status;
    dot.className = `status-dot ${dotClass}`;
}

/* --- 4. LIVE NEWS FEED (YAHOO RSS VIA PROXY) --- */
function initNewsFeed() {
    const container = document.getElementById('rv-news-feed-list');
    const proxyUrl = 'https://api.allorigins.win/get?url=';
    const rssUrl = 'https://finance.yahoo.com/news/rssindex';
    fetch(`${proxyUrl}${encodeURIComponent(rssUrl)}`)
        .then(response => response.json())
        .then(data => {
            const parser = new DOMParser();
            const xml = parser.parseFromString(data.contents, 'text/xml');
            const items = xml.querySelectorAll('item');
            let html = '';
            items.forEach(item => {
                const title = item.querySelector('title').textContent;
                const link = item.querySelector('link').textContent;
                const pubDate = item.querySelector('pubDate').textContent;
                const timeAgo = ((new Date() - new Date(pubDate)) / 60000 | 0) + ' min ago';
                html += `
                    <a href="${link}" target="_blank" class="rv-news-list-item">
                        <span class="rv-news-list-title">${title}</span>
                        <span class="rv-news-list-time">${timeAgo}</span>
                    </a>
                `;
            });
            container.innerHTML = html;
        })
        .catch(error => console.error(error));
}

/* --- 5. MARKET CONSENSUS SCORE GAUGE --- */
function initMCS() {
    const ctx = document.getElementById('mcs-chart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [50, 50],
                backgroundColor: ['#10b981', 'rgba(255,255,255,0.1)'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '70%',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });

    // Dummy for now, replace with real sentiment
    const value = 65;
    chart.data.datasets[0].data = [value, 100 - value];
    chart.update();
    document.getElementById('mcs-value').innerText = value;
}

/* --- 6. STOCK EXPLORER --- */
function loadStockList(category) {
    document.querySelectorAll('.rv-list-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`button[onclick="loadStockList('${category}')"]`).classList.add('active');
    const listContainer = document.getElementById('rv-stock-list-container');
    const data = STOCK_LISTS[category] || [];
    let exchange = "NASDAQ";
    if(category === 'dow') exchange = "NYSE";
    listContainer.innerHTML = data.map(stock => {
        let fullSymbol = stock.s;
        if(!stock.s.includes(":")) {
            fullSymbol = `${exchange}:${stock.s}`;
            if(stock.s === 'SPY') fullSymbol = 'AMEX:SPY';
            if(['AAPL','MSFT','NVDA','AMZN','TSLA','NFLX','GOOGL','COST'].includes(stock.s)) fullSymbol = `NASDAQ:${stock.s}`;
        }

        return `
        <div class="rv-stock-item" onclick="updateExplorer('${fullSymbol}', '${stock.n}')">
            <div>
                <div class="rv-stock-symbol">${stock.s}</div>
                <div style="font-size:10px; color:#666;">${stock.n}</div>
            </div>
            <div style="font-size:18px; color:#444;">&rsaquo;</div>
        </div>
        `;
    }).join('');
}

function updateExplorer(symbol, name) {
    document.getElementById('rv-selected-stock-name').textContent = `${name} (${symbol})`;
    
    const fundContainer = document.getElementById('container-fundamentals');
    const techContainer = document.getElementById('container-technicals');
    
    fundContainer.innerHTML = '';
    techContainer.innerHTML = '';

    const s1 = document.createElement('script');
    s1.type = 'text/javascript';
    s1.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
    s1.async = true;
    s1.innerHTML = JSON.stringify({
        "interval": "1D", "width": "100%", "height": "100%", "symbol": symbol, 
        "showIntervalTabs": true, "displayMode": "single", "locale": "en", "colorTheme": "dark", "isTransparent": true
    });
    const c1 = document.createElement('div'); c1.className = 'tradingview-widget-container';
    c1.appendChild(s1);
    techContainer.appendChild(c1);

    const s2 = document.createElement('script');
    s2.type = 'text/javascript';
    s2.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
    s2.async = true;
    s2.innerHTML = JSON.stringify({
        "colorTheme": "dark", "isTransparent": true, "displayMode": "regular", 
        "width": "100%", "height": "100%", "symbol": symbol, "locale": "en"
    });
    const c2 = document.createElement('div'); c2.className = 'tradingview-widget-container';
    c2.appendChild(s2);
    fundContainer.appendChild(c2);
}

function filterStocks() {
    const input = document.getElementById('stockSearch').value.toUpperCase();
    const items = document.querySelectorAll('.rv-stock-item');
    items.forEach(item => {
        const text = item.innerText.toUpperCase();
        item.style.display = text.includes(input) ? 'flex' : 'none';
    });
}

/* --- 7. THEME SWITCHER --- */
function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const body = document.body;
    btn.addEventListener('click', () => {
        if(body.getAttribute('data-theme') === 'light') {
            body.removeAttribute('data-theme');
            btn.innerHTML = '☀️';
        } else {
            body.setAttribute('data-theme', 'light');
            btn.innerHTML = '🌙';
        }
    });
}

/* Neue Features additiv */

// Global Namespace (neu)
const RV = {};

// Varianten-Flags (neu)
RV.features = JSON.parse(localStorage.getItem('rv_features')) || {
  news_variant: "cards",
  watchlist_variant: "minimal",
  charts_variant: "minimal30d",
  layout_mode: "fixed",
  insight_variant: "brief",
  dev_panel: false
};

// Global State (neu additiv)
RV.state = {
  theme: localStorage.getItem('rv_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  layout: JSON.parse(localStorage.getItem('rv_layout')) || ['daily-insight', 'mcs', 'watchlist', 'stock-explorer', 'heatmap', 'timeline', 'dashboard'],
  watchlist: JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA'],
  preferredTab: localStorage.getItem('rv_preferredTab') || 'finance',
  lastUpdated: { news: null, quotes: null },
  cacheMeta: {}, // TTL Tracking
  onboardingShown: localStorage.getItem('rv_onboardingShown') === 'true'
};

// Persist State (neu)
RV.persistState = (key) => {
  try {
    localStorage.setItem(`rv_${key}`, typeof RV.state[key] === 'object' ? JSON.stringify(RV.state[key]) : RV.state[key]);
  } catch (e) { console.warn('LocalStorage full or error:', e); }
};

// Persist Features (neu)
RV.persistFeatures = () => {
  localStorage.setItem('rv_features', JSON.stringify(RV.features));
};

// Save Variants from Dev Panel (neu)
RV.saveVariants = () => {
  RV.features.news_variant = document.getElementById('news-variant').value;
  RV.features.watchlist_variant = document.getElementById('watchlist-variant').value;
  RV.features.charts_variant = document.getElementById('charts-variant').value;
  RV.features.layout_mode = document.getElementById('layout-mode').value;
  RV.features.insight_variant = document.getElementById('insight-variant').value;
  RV.persistFeatures();
  location.reload();
};

// Utils (neu)
RV.utils = {
  sanitizeHTML: (str) => DOMPurify.sanitize(str), // Ergänzt für Sicherheit (Tip 6)
  timeAgo: (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  },
  estimateReadTime: (text) => Math.ceil(text.split(' ').length / 200 * 60) + ' Sekunden',
  fetchWithTimeout: async (url, ms = 5000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  },
  safeJson: async (response) => {
    if (!response.ok) throw new Error('Network error');
    return response.json();
  }
};

// Fetch Cached via Worker (neu)
RV.fetchCached = async (endpoint, ttl) => {
  const now = Date.now();
  if (RV.state.cacheMeta[endpoint] && now - RV.state.cacheMeta[endpoint].timestamp < ttl) {
    return RV.state.cacheMeta[endpoint].data;
  }
  try {
    const response = await RV.utils.fetchWithTimeout(`/api${endpoint}`);
    const data = await RV.utils.safeJson(response);
    RV.state.cacheMeta[endpoint] = { data, timestamp: now };
    return data;
  } catch (e) {
    console.error(e);
    if (RV.state.cacheMeta[endpoint]) return RV.state.cacheMeta[endpoint].data;
    throw e;
  }
};

// Error Boundary (neu)
RV.errorBoundary = (fn, fallbackId) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      const fallback = document.querySelector(`[data-module="${fallbackId}"] .error-fallback`);
      if (fallback) fallback.style.display = 'block';
    }
  };
};

// Modules (neu additiv)
RV.modules = {
  theme: {
    init: () => {
      const body = document.body;
      body.setAttribute('data-theme', RV.state.theme);
      const btn = document.getElementById('theme-toggle');
      btn.innerHTML = RV.state.theme === 'light' ? '🌙' : '☀️';
      btn.addEventListener('click', () => {
        RV.state.theme = RV.state.theme === 'light' ? 'dark' : 'light';
        body.setAttribute('data-theme', RV.state.theme);
        btn.innerHTML = RV.state.theme === 'light' ? '🌙' : '☀️';
        RV.persistState('theme');
      });
    }
  },
  marketTimer: {
    render: () => RV.errorBoundary(initUSMarketTimer, 'market-timer')()
  },
  newsFeed: {
    fetchAndRender: () => RV.errorBoundary(async () => {
      const container = document.getElementById('rv-news-feed-list');
      container.classList.add('skeleton');
      const tab = RV.state.preferredTab;
      const data = await RV.fetchCached(`/news?mode=${tab}&limit=20`, 300000); // 5 min
      RV.state.lastUpdated.news = new Date();
      document.getElementById('news-last-update').innerText = `Last: ${RV.utils.timeAgo(RV.state.lastUpdated.news)}`;
      document.getElementById('hero-last-update').innerText = `Last Update: News at ${RV.state.lastUpdated.news.toLocaleTimeString()}, Quotes at ${RV.state.lastUpdated.quotes?.toLocaleTimeString() || '--:--'}`;
      const deduped = data.items.reduce((acc, item) => {
        if (!acc.some(i => i.title === item.title)) acc.push(item);
        return acc;
      }, []);
      let html = '';
      if (RV.features.news_variant === 'cards') {
        html = deduped.map(item => RV.utils.sanitizeHTML(`
          <div class="rv-news-card">
            <h4>${item.title}</h4>
            <p>${item.description}</p>
            <a href="${item.link}" target="_blank" rel="noopener noreferrer">Read more</a>
            <span>${RV.utils.timeAgo(item.pubDate)}</span>
            <span class="rv-news-sentiment">${item.sentiment ? (item.sentiment > 0.6 ? '📈' : item.sentiment < -0.6 ? '📉' : '⚖️') : ''}</span>
          </div>
        `)).join('');
      } else if (RV.features.news_variant === 'compact') {
        html = deduped.map(item => RV.utils.sanitizeHTML(`
          <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="rv-news-list-item">
            <span class="rv-news-list-title">${item.title}</span>
            <span class="rv-news-list-time">${RV.utils.timeAgo(item.pubDate)}</span>
            <span class="rv-news-sentiment">${item.sentiment ? (item.sentiment > 0.6 ? '📈' : item.sentiment < -0.6 ? '📉' : '⚖️') : ''}</span>
          </a>
        `)).join('');
      } else if (RV.features.news_variant === 'ticker') {
        html = '<div class="rv-news-ticker">' + deduped.map(item => RV.utils.sanitizeHTML(
          `<span>${item.title} (${RV.utils.timeAgo(item.pubDate)})</span>`
        )).join(' • ') + '</div>';
      }
      container.innerHTML = html;
      container.classList.remove('skeleton');
    }, 'dashboard')(),
    init: () => {
      document.querySelectorAll('.rv-news-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          document.querySelectorAll('.rv-news-tab').forEach(t => t.classList.remove('active'));
          e.target.classList.add('active');
          RV.state.preferredTab = e.target.dataset.tab;
          RV.persistState('preferredTab');
          RV.modules.newsFeed.fetchAndRender();
        });
      });
      if (document.querySelector(`.rv-news-tab[data-tab="${RV.state.preferredTab}"]`)) {
        document.querySelector(`.rv-news-tab[data-tab="${RV.state.preferredTab}"]`).classList.add('active');
      }
      RV.modules.newsFeed.fetchAndRender();
      setInterval(RV.modules.newsFeed.fetchAndRender, 300000);
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) RV.modules.newsFeed.fetchAndRender();
      });
      observer.observe(document.getElementById('rv-news-feed-list'));
    }
  },
  watchlist: {
    render: () => RV.errorBoundary(() => {
      const container = document.getElementById('wl-container');
      const variant = RV.features.watchlist_variant;
      let html = '';
      if (variant === 'minimal') {
        html = RV.state.watchlist.map(sym => RV.utils.sanitizeHTML(`
          <div class="rv-wl-item">
            <div style="font-weight:bold">${sym}</div>
            <div style="font-size:10px; color:#aaa;">Stock</div>
            <span class="rv-wl-remove" onclick="RV.modules.watchlist.remove('${sym}')">&times;</span>
          </div>
        `)).join('');
      } else if (variant === 'detailed') {
        // Fetch quotes for detailed
        RV.fetchCached(`/quotes?tickers=${RV.state.watchlist.join(',')}`, 60000).then(quotes => {
          html = RV.state.watchlist.map(sym => {
            const q = quotes[sym] || { price: '--', change: '--' };
            return RV.utils.sanitizeHTML(`
              <div class="rv-wl-item">
                <div style="font-weight:bold">${sym}</div>
                <div>Price: ${q.price}</div>
                <div>Change: ${q.change}</div>
                <span class="rv-wl-remove" onclick="RV.modules.watchlist.remove('${sym}')">&times;</span>
              </div>
            `);
          }).join('');
          container.innerHTML = html;
        });
        return;
      } else if (variant === 'sparklines') {
        // Fetch history for sparklines
        RV.fetchCached(`/history?ticker=${RV.state.watchlist.join(',')}&range=30d`, 3600000).then(hist => {
          html = RV.state.watchlist.map(sym => {
            const canvasId = `spark-${sym}`;
            setTimeout(() => {
              const ctx = document.getElementById(canvasId).getContext('2d');
              new Chart(ctx, {
                type: 'line',
                data: { labels: hist[sym].dates, datasets: [{ data: hist[sym].prices, borderColor: '#10b981', fill: false }] },
                options: { scales: { x: { display: false }, y: { display: false } }, elements: { point: { radius: 0 } }, plugins: { legend: { display: false } } }
              });
            }, 0);
            return RV.utils.sanitizeHTML(`
              <div class="rv-wl-item">
                <div style="font-weight:bold">${sym}</div>
                <canvas id="${canvasId}" height="50"></canvas>
                <span class="rv-wl-remove" onclick="RV.modules.watchlist.remove('${sym}')">&times;</span>
              </div>
            `);
          }).join('');
          container.innerHTML = html;
        });
        return;
      }
      container.innerHTML = html;
    }, 'watchlist')(),
    add: (sym) => {
      sym = sym.toUpperCase();
      if (RV.state.watchlist.includes(sym) || !SUGGESTIONS_DB.some(s => s.s === sym)) return;
      if (RV.state.watchlist.length >= 5) {
        alert('Watchlist Limit: 5 free. Upgrade for more.');
        return;
      }
      RV.state.watchlist.push(sym);
      RV.persistState('watchlist');
      RV.modules.watchlist.render();
    },
    remove: (sym) => {
      RV.state.watchlist = RV.state.watchlist.filter(s => s !== sym);
      RV.persistState('watchlist');
      RV.modules.watchlist.render();
    },
    init: () => {
      const input = document.getElementById('wl-input');
      const suggestionsBox = document.getElementById('wl-suggestions');
      const btn = document.getElementById('wl-add-btn');
      const exportBtn = document.getElementById('wl-export');
      input.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        if (val.length < 1) { suggestionsBox.style.display = 'none'; return; }
        const matches = SUGGESTIONS_DB.filter(x => x.s.startsWith(val) || x.n.toUpperCase().startsWith(val));
        if (matches.length > 0) {
          suggestionsBox.innerHTML = matches.map(m => RV.utils.sanitizeHTML(
            `<div class="rv-suggestion-item" onclick="RV.modules.watchlist.add('${m.s}')">${m.s} <span style="color:#666">(${m.n})</span></div>`
          )).join('');
          suggestionsBox.style.display = 'block';
        } else {
          suggestionsBox.style.display = 'none';
        }
      });
      btn.addEventListener('click', () => { if (input.value) RV.modules.watchlist.add(input.value); input.value = ''; suggestionsBox.style.display = 'none'; });
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(RV.state.watchlist)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'watchlist.json';
        a.click();
        URL.revokeObjectURL(url);
      });
      RV.modules.watchlist.render();
    }
  },
  mcs: {
    fetchAndRender: () => RV.errorBoundary(async () => {
      const data = await RV.fetchCached('/sentiment', 1800000); // 30 min
      let score = 50;
      let stdDev = 0;
      if (data.sentiments.length > 0) {
        const mean = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length;
        stdDev = Math.sqrt(data.sentiments.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / data.sentiments.length);
        score = Math.round((mean + 1) * 50);
      }
      const ctx = document.getElementById('mcs-chart').getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Consensus', 'Neutral'],
          datasets: [{
            data: [score, 100 - score],
            backgroundColor: [stdDev > 20 ? '#f59e0b' : '#10b981', 'rgba(255,255,255,0.1)'],
            borderWidth: 0,
            cutout: '85%'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
      document.getElementById('mcs-value').innerText = score;
      document.getElementById('mcs-label').innerText = stdDev > 20 ? 'High Uncertainty' : 'Sentiment Score';
      if (data.sentiments.length < 10) document.getElementById('mcs-value').innerText = '--';
    }, 'mcs')(),
    init: () => {
      RV.modules.mcs.fetchAndRender();
      setInterval(RV.modules.mcs.fetchAndRender, 1800000);
    }
  },
  dailyInsight: {
    fetchAndRender: () => RV.errorBoundary(async () => {
      const data = await RV.fetchCached('/daily-brief', 3600000); // 1 hour
      const brief = document.getElementById('daily-brief');
      brief.innerText = `${data.brief} (Lesezeit: ${RV.utils.estimateReadTime(data.brief)})`;
      document.getElementById('rubik-note').innerText = data.note;
      const readBtn = document.getElementById('read-aloud');
      readBtn.addEventListener('click', () => {
        const utterance = new SpeechSynthesisUtterance(data.brief + '. ' + data.note);
        speechSynthesis.speak(utterance);
      });
      if (RV.features.insight_variant === 'expanded') {
        brief.innerText += `\nExpanded: ${data.expanded}`;
      }
    }, 'daily-insight')(),
    init: () => {
      RV.modules.dailyInsight.fetchAndRender();
    }
  },
  stockExplorer: {
    render: () => RV.errorBoundary(() => {
      loadStockList('nasdaq');
      updateExplorer('NASDAQ:AAPL', 'Apple Inc');
      const variant = RV.features.charts_variant;
      const ctx = document.getElementById('custom-chart').getContext('2d');
      ctx.canvas.classList.add('skeleton');
      RV.fetchCached('/history?ticker=AAPL&range=30d', 60000).then(data => {
        RV.state.lastUpdated.quotes = new Date();
        document.getElementById('hero-last-update').innerText = `Last Update: News at ${RV.state.lastUpdated.news?.toLocaleTimeString() || '--:--'}, Quotes at ${RV.state.lastUpdated.quotes.toLocaleTimeString()}`;
        let config = {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [{ label: 'Price', data: data.prices, borderColor: '#10b981', fill: false }]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
        };
        if (variant === 'compact') {
          config.options.scales = { x: { display: false }, y: { display: false } };
          config.options.elements = { point: { radius: 0 } };
          config.options.plugins = { legend: { display: false } };
        }
        new Chart(ctx, config);
        ctx.canvas.classList.remove('skeleton');
      });
    }, 'stock-explorer')(),
    init: () => {
      RV.modules.stockExplorer.render();
    }
  },
  layout: {
    init: () => {
      if (RV.features.layout_mode === 'sortable') {
        const main = document.querySelector('.rv-main');
        Sortable.create(main, {
          animation: 150,
          handle: '::before',
          onEnd: () => {
            RV.state.layout = Array.from(main.querySelectorAll('[data-module]')).map(el => el.dataset.module);
            RV.persistState('layout');
          }
        });
        RV.state.layout.forEach(mod => {
          const el = document.querySelector(`[data-module="${mod}"]`);
          if (el) main.appendChild(el);
        });
      }
    }
  },
  onboarding: {
    init: () => {
      if (!RV.state.onboardingShown) {
        document.getElementById('onboarding').open = true;
        RV.state.onboardingShown = true;
        RV.persistState('onboardingShown');
      }
    }
  },
  pwa: {
    init: () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').then(reg => console.log('SW Registered')).catch(err => console.error(err));
      }
      window.addEventListener('offline', () => document.getElementById('offline-fallback').style.display = 'block');
      window.addEventListener('online', () => document.getElementById('offline-fallback').style.display = 'none');
    }
  },
  devPanel: {
    init: () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('dev') || localStorage.getItem('RV_DEV') === '1') {
        RV.features.dev_panel = true;
        document.getElementById('dev-panel').style.display = 'block';
        document.getElementById('news-variant').value = RV.features.news_variant;
        document.getElementById('watchlist-variant').value = RV.features.watchlist_variant;
        document.getElementById('charts-variant').value = RV.features.charts_variant;
        document.getElementById('layout-mode').value = RV.features.layout_mode;
        document.getElementById('insight-variant').value = RV.features.insight_variant;
      }
    }
  },
  narrativeHeatmap: { // Ergänzt (Tip 4)
    analyze: (titles) => {
      const keywords = ['FED', 'RATE', 'AI', 'CRYPTO', 'EARNINGS'];
      const counts = keywords.reduce((acc, k) => { acc[k] = 0; return acc; }, {});
      titles.forEach(title => {
        keywords.forEach(k => {
          if (title.toUpperCase().includes(k)) counts[k]++;
        });
      });
      const div = document.getElementById('cheat-heat');
      if (div) {
        div.innerHTML = keywords.map(k => RV.utils.sanitizeHTML(`
          <div class="narrative-item">
            <span>${k}</span>: ${counts[k]}
          </div>
        `)).join('');
      }
    }
  }
};