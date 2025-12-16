/* ==========================================================================
   RUBIK VAULT - SCRIPT (Modularisiert mit Namespaces, State, Error Boundaries)
   ========================================================================== */

// Global Namespace
const RV = {};

// Global State (Minimal, Persistent)
RV.state = {
  theme: localStorage.getItem('rv_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  layout: JSON.parse(localStorage.getItem('rv_layout')) || ['daily-insight', 'mcs', 'watchlist', 'stock-explorer', 'heatmap', 'timeline', 'dashboard'],
  watchlist: JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA'],
  preferredTab: localStorage.getItem('rv_preferredTab') || 'finance',
  lastUpdated: { news: null, quotes: null },
  cacheMeta: {}, // TTL Tracking
  onboardingShown: localStorage.getItem('rv_onboardingShown') === 'true'
};

// Persist State Utility
RV.persistState = (key) => {
  try {
    localStorage.setItem(`rv_${key}`, typeof RV.state[key] === 'object' ? JSON.stringify(RV.state[key]) : RV.state[key]);
  } catch (e) { console.warn('LocalStorage full or error:', e); }
};

// State Migration (If Schema Changes)
if (RV.state.watchlist.length > 5) { RV.state.watchlist = RV.state.watchlist.slice(0, 5); RV.persistState('watchlist'); } // Example Migration

// Utils Namespace
RV.utils = {
  sanitizeHTML: (str) => DOMPurify.sanitize(str),
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
  estimateReadTime: (text) => Math.ceil(text.split(' ').length / 200 * 60) + ' Sekunden', // ~200 WPM
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

// Fetch Wrapper with Cache (Client-Side Meta, Server Caches Data)
RV.fetchCached = async (endpoint, ttl) => {
  const now = Date.now();
  if (RV.state.cacheMeta[endpoint] && now - RV.state.cacheMeta[endpoint].timestamp < ttl) {
    return RV.state.cacheMeta[endpoint].data;
  }
  try {
    const response = await RV.utils.fetchWithTimeout(`https://api.rubikvault.com${endpoint}`);
    const data = await RV.utils.safeJson(response);
    RV.state.cacheMeta[endpoint] = { data, timestamp: now };
    return data;
  } catch (e) {
    console.error(e);
    if (RV.state.cacheMeta[endpoint]) return RV.state.cacheMeta[endpoint].data; // Fallback to Cache
    throw e;
  }
};

// Error Boundary Utility
RV.errorBoundary = (fn, fallbackId) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      const fallback = document.querySelector(`[data-module="${fallbackId}"] .error-fallback`);
      if (fallback) fallback.style.display = 'block';
      // Stub for Sentry: if (Sentry) Sentry.captureException(e);
    }
  };
};

// Modules Namespace (Each with Render/Fetch)
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
    render: () => RV.errorBoundary(() => {
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
    }, 'market-timer')()
  },
  newsFeed: {
    fetchAndRender: () => RV.errorBoundary(async () => {
      const container = document.getElementById('rv-news-feed-list');
      container.classList.add('skeleton');
      const tab = RV.state.preferredTab;
      const data = await RV.fetchCached(`/api/news?type=${tab}`, 300000); // 5 min TTL
      RV.state.lastUpdated.news = new Date();
      document.getElementById('news-last-update').innerText = `Last: ${RV.utils.timeAgo(RV.state.lastUpdated.news)}`;
      document.getElementById('hero-last-update').innerText = `Last Update: News at ${RV.state.lastUpdated.news.toLocaleTimeString()}, Quotes at ${RV.state.lastUpdated.quotes?.toLocaleTimeString() || '--:--'}`;
      const deduped = data.items.reduce((acc, item) => {
        if (!acc.some(i => i.title === item.title)) acc.push(item);
        return acc;
      }, []);
      const html = deduped.map(item => RV.utils.sanitizeHTML(`
        <a href="${item.link}" target="_blank" class="rv-news-list-item">
          <span class="rv-news-list-title">${item.title}</span>
          <span class="rv-news-list-time">${RV.utils.timeAgo(item.pubDate)}</span>
          <span class="rv-news-sentiment">${item.sentiment > 0.6 ? '📈' : item.sentiment < -0.6 ? '📉' : '⚖️'}</span>
        </a>
      `)).join('');
      container.innerHTML = html;
      container.classList.remove('skeleton');
      plausible('News Tab View', { props: { tab } });
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
      // Lazy Load Observer
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) RV.modules.newsFeed.fetchAndRender();
      });
      observer.observe(document.getElementById('rv-news-feed-list'));
    }
  },
  watchlist: {
    render: () => RV.errorBoundary(() => {
      const container = document.getElementById('wl-container');
      container.innerHTML = RV.state.watchlist.map(sym => RV.utils.sanitizeHTML(`
        <div class="rv-wl-item">
          <div style="font-weight:bold">${sym}</div>
          <div style="font-size:10px; color:#aaa;">Stock</div>
          <span class="rv-wl-remove" onclick="RV.modules.watchlist.remove('${sym}')">&times;</span>
        </div>
      `)).join('');
      plausible('Watchlist Render');
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
      plausible('Watchlist Add', { props: { symbol: sym } });
    },
    remove: (sym) => {
      RV.state.watchlist = RV.state.watchlist.filter(s => s !== sym);
      RV.persistState('watchlist');
      RV.modules.watchlist.render();
      plausible('Watchlist Remove', { props: { symbol: sym } });
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
      const data = await RV.fetchCached('/api/sentiment', 1800000); // 30 min TTL
      let score = 50; // Neutral Default
      let stdDev = 0;
      if (data.sentiments.length > 0) {
        const mean = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length;
        stdDev = Math.sqrt(data.sentiments.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / data.sentiments.length);
        score = Math.round((mean + 1) * 50); // Normalize -1 to 1 -> 0 to 100
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
      const data = await RV.fetchCached('/api/daily-brief', 3600000); // 1 hour TTL
      const brief = document.getElementById('daily-brief');
      brief.innerText = `${data.brief} (Lesezeit: ${RV.utils.estimateReadTime(data.brief)})`;
      document.getElementById('rubik-note').innerText = data.note;
      const readBtn = document.getElementById('read-aloud');
      readBtn.addEventListener('click', () => {
        const utterance = new SpeechSynthesisUtterance(data.brief + '. ' + data.note);
        speechSynthesis.speak(utterance);
      });
    }, 'daily-insight')(),
    init: () => {
      RV.modules.dailyInsight.fetchAndRender();
    }
  },
  stockExplorer: {
    render: () => RV.errorBoundary(() => {
      // Erhaltene Funktionen: loadStockList, updateExplorer, filterStocks
      loadStockList('nasdaq');
      updateExplorer('NASDAQ:AAPL', 'Apple Inc');
      // Custom Chart Integration
      const ctx = document.getElementById('custom-chart').getContext('2d');
      ctx.canvas.classList.add('skeleton');
      RV.fetchCached('/api/quote/AAPL?period=30d', 60000).then(data => { // 1 min TTL
        RV.state.lastUpdated.quotes = new Date();
        document.getElementById('hero-last-update').innerText = `Last Update: News at ${RV.state.lastUpdated.news?.toLocaleTimeString() || '--:--'}, Quotes at ${RV.state.lastUpdated.quotes.toLocaleTimeString()}`;
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: data.dates,
            datasets: [{ label: 'Price', data: data.prices, borderColor: '#10b981', fill: false }]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
        });
        ctx.canvas.classList.remove('skeleton');
      });
    }, 'stock-explorer')(),
    init: () => {
      RV.modules.stockExplorer.render();
    }
  },
  layout: {
    init: () => {
      const main = document.querySelector('.rv-main');
      Sortable.create(main, {
        animation: 150,
        handle: '::before', // Drag Handle
        onEnd: () => {
          RV.state.layout = Array.from(main.querySelectorAll('[data-module]')).map(el => el.dataset.module);
          RV.persistState('layout');
          plausible('Layout Change');
        }
      });
      // Apply Saved Layout
      RV.state.layout.forEach(mod => {
        const el = document.querySelector(`[data-module="${mod}"]`);
        if (el) main.appendChild(el);
      });
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
  }
};

// Datasets (Erhalten)
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
    { s: "BA", n: "Boeing" }, { s: "CAT", n: "Caterpillar" }, { s: "CVX", n: "Chevron" }, { s: "CSCO", n: "Cisco" }
  ],
  sp500: [
    { s: "SPY", n: "S&P 500 ETF" }, { s: "JPM", n: "JPMorgan" }, { s: "V", n: "Visa" }, { s: "LLY", n: "Lilly" },
    { s: "MA", n: "Mastercard" }, { s: "HD", n: "Home Depot" }, { s: "XOM", n: "Exxon" }, { s: "UNH", n: "UnitedHealth" }
  ]
};

// Erhaltene Funktionen (Global für Kompatibilität)
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
    return RV.utils.sanitizeHTML(`
    <div class="rv-stock-item" onclick="updateExplorer('${fullSymbol}', '${stock.n}')">
      <div>
        <div class="rv-stock-symbol">${stock.s}</div>
        <div style="font-size:10px; color:#666;">${stock.n}</div>
      </div>
      <div style="font-size:18px; color:#444;">&rsaquo;</div>
    </div>
    `);
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
  // Trigger Custom Chart Update
  RV.modules.stockExplorer.render();
}

function filterStocks() {
  const input = document.getElementById('stockSearch').value.toUpperCase();
  const items = document.querySelectorAll('.rv-stock-item');
  items.forEach(item => {
    const text = item.innerText.toUpperCase();
    item.style.display = text.includes(input) ? 'flex' : 'none';
  });
}

// Init All
document.addEventListener("DOMContentLoaded", () => {
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
  // Heartbeat for Time-on-Site (Approx)
  setInterval(() => plausible('Heartbeat'), 30000);
});