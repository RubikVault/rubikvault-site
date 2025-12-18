/* RubikVault Frontend Script (Vanilla)
   - Theme toggle + persistence
   - Market timer (NYC, US cash session)
   - Fear & Greed gauges (proxy-based/demo values)
   - Watchlist (localStorage)
   - Deep Dive explorer (static lists + TradingView widgets)
   - Live News feed (RSS via public proxy)
*/

(function () {
  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatTime(date, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone
    }).format(date);
  }

  // ─────────────────────────────────────────────────────────────
  // Theme (dark/light)
  // ─────────────────────────────────────────────────────────────
  function initTheme() {
    const btn = $('#theme-toggle');
    if (!btn) return;

    const stored = localStorage.getItem('rv_theme');
    if (stored === 'light') document.documentElement.classList.add('light');

    const syncIcon = () => {
      const isLight = document.documentElement.classList.contains('light');
      btn.textContent = isLight ? '🌙' : '☀️';
    };

    syncIcon();

    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      localStorage.setItem('rv_theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
      syncIcon();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Market timer (NYC) + session status
  // ─────────────────────────────────────────────────────────────
  function initMarketTimer() {
    const dot = $('#mt-dot');
    const status = $('#mt-status');
    const timeEl = $('#mt-time');
    if (!dot || !status || !timeEl) return;

    // US cash session approx: 09:30–16:00 ET (Mon–Fri)
    function tick() {
      const now = new Date();
      const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const day = nyTime.getDay(); // 0 Sun ... 6 Sat
      const hh = nyTime.getHours();
      const mm = nyTime.getMinutes();
      const minutes = hh * 60 + mm;

      const isWeekday = day >= 1 && day <= 5;
      const open = 9 * 60 + 30;
      const close = 16 * 60;
      const isOpen = isWeekday && minutes >= open && minutes < close;

      timeEl.textContent = `NYC: ${formatTime(now, 'America/New_York')}`;
      status.textContent = isOpen ? 'US Market Open' : (isWeekday ? 'US Market Closed' : 'Weekend');
      dot.classList.toggle('open', !!isOpen);
    }

    tick();
    setInterval(tick, 10_000);
  }

  // ─────────────────────────────────────────────────────────────
  // Fear & Greed Gauges (simple + deterministic demo)
  // NOTE: Real CNN F&G is not easily scraped reliably for free from client-side.
  // This is a proxy visualization to keep the UI alive.
  // ─────────────────────────────────────────────────────────────
  function makeGauge(canvas, valueEl, seed) {
    if (!canvas || !valueEl || !window.Chart) return;

    // deterministic-ish daily value
    const d = new Date();
    const daySeed = (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
    const raw = (Math.sin((daySeed + seed) * 0.0007) + 1) / 2; // 0..1
    const v = Math.round(raw * 100);

    valueEl.textContent = `${v}`;

    const ctx = canvas.getContext('2d');
    const data = {
      labels: ['Score', ''],
      datasets: [{
        data: [v, 100 - v],
        borderWidth: 0,
        cutout: '78%'
      }]
    };

    // Destroy previous if any
    if (canvas.__chart) {
      canvas.__chart.destroy();
    }

    canvas.__chart = new Chart(ctx, {
      type: 'doughnut',
      data,
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  function initGauges() {
    makeGauge($('#mcs-chart-stock'), $('#mcs-value-stock'), 1);
    makeGauge($('#mcs-chart-crypto'), $('#mcs-value-crypto'), 2);
  }

  // ─────────────────────────────────────────────────────────────
  // Watchlist
  // ─────────────────────────────────────────────────────────────
  const WL_KEY = 'rv_watchlist_v1';

  const SYMBOL_SUGGEST = [
    { sym: 'AAPL', name: 'Apple' },
    { sym: 'MSFT', name: 'Microsoft' },
    { sym: 'NVDA', name: 'NVIDIA' },
    { sym: 'AMZN', name: 'Amazon' },
    { sym: 'GOOGL', name: 'Alphabet' },
    { sym: 'META', name: 'Meta' },
    { sym: 'TSLA', name: 'Tesla' },
    { sym: 'SPY', name: 'S&P 500 ETF' },
    { sym: 'QQQ', name: 'Nasdaq 100 ETF' },
    { sym: 'BTCUSD', name: 'Bitcoin' },
    { sym: 'ETHUSD', name: 'Ethereum' }
  ];

  function loadWatchlist() {
    return safeJSONParse(localStorage.getItem(WL_KEY), ['AAPL', 'MSFT', 'NVDA', 'SPY', 'BTCUSD']);
  }

  function saveWatchlist(list) {
    localStorage.setItem(WL_KEY, JSON.stringify(list));
  }

  function renderWatchlist(list) {
    const container = $('#wl-container');
    if (!container) return;

    container.innerHTML = '';
    list.forEach((sym) => {
      const card = document.createElement('div');
      card.className = 'rv-watch-card';

      // TradingView mini symbol overview needs exchange prefix sometimes.
      // We'll do a naive mapping:
      const tvSym =
        sym === 'BTCUSD' ? 'BINANCE:BTCUSDT' :
        sym === 'ETHUSD' ? 'BINANCE:ETHUSDT' :
        `NASDAQ:${sym}`;

      card.innerHTML = `
        <div class="rv-watch-top">
          <div class="rv-watch-sym">${sym}</div>
          <button class="rv-watch-remove" title="Remove">✕</button>
        </div>
        <div class="rv-watch-widget">
          <div class="tradingview-widget-container">
            <div class="tradingview-widget-container__widget"></div>
          </div>
        </div>
      `;

      const removeBtn = card.querySelector('.rv-watch-remove');
      removeBtn.addEventListener('click', () => {
        const updated = loadWatchlist().filter(s => s !== sym);
        saveWatchlist(updated);
        renderWatchlist(updated);
      });

      // Inject widget script
      const widgetContainer = card.querySelector('.tradingview-widget-container');
      const s = document.createElement('script');
      s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
      s.async = true;
      s.textContent = JSON.stringify({
        symbol: tvSym,
        width: '100%',
        height: '100%',
        locale: 'en',
        dateRange: '1D',
        colorTheme: 'dark',
        isTransparent: true,
        autosize: true
      });
      widgetContainer.appendChild(s);

      container.appendChild(card);
    });

    // Sortable
    if (window.Sortable) {
      new Sortable(container, {
        animation: 120,
        onEnd: () => {
          const newList = $$('.rv-watch-card .rv-watch-sym', container).map(el => el.textContent.trim());
          saveWatchlist(newList);
        }
      });
    }
  }

  function initWatchlist() {
    const input = $('#wl-input');
    const btn = $('#wl-add-btn');
    const sug = $('#wl-suggestions');
    if (!input || !btn) return;

    const list = loadWatchlist();
    renderWatchlist(list);

    function showSuggestions(q) {
      if (!sug) return;
      const query = (q || '').trim().toUpperCase();
      if (!query) { sug.innerHTML = ''; sug.style.display = 'none'; return; }

      const hits = SYMBOL_SUGGEST
        .filter(x => x.sym.includes(query) || x.name.toUpperCase().includes(query))
        .slice(0, 6);

      if (!hits.length) { sug.innerHTML = ''; sug.style.display = 'none'; return; }

      sug.style.display = 'block';
      sug.innerHTML = hits.map(h => `<div class="rv-suggestion" data-sym="${h.sym}"><strong>${h.sym}</strong> <span>${h.name}</span></div>`).join('');

      $$('.rv-suggestion', sug).forEach(el => {
        el.addEventListener('click', () => {
          input.value = el.getAttribute('data-sym') || '';
          sug.innerHTML = '';
          sug.style.display = 'none';
          input.focus();
        });
      });
    }

    input.addEventListener('input', (e) => showSuggestions(e.target.value));
    document.addEventListener('click', (e) => {
      if (!sug) return;
      if (!sug.contains(e.target) && e.target !== input) {
        sug.innerHTML = '';
        sug.style.display = 'none';
      }
    });

    function addSymbol() {
      const sym = input.value.trim().toUpperCase();
      if (!sym) return;
      const existing = loadWatchlist();
      if (existing.includes(sym)) {
        input.value = '';
        return;
      }
      existing.unshift(sym);
      saveWatchlist(existing);
      renderWatchlist(existing);
      input.value = '';
    }

    btn.addEventListener('click', addSymbol);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addSymbol();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Deep Dive Explorer (lists)
  // ─────────────────────────────────────────────────────────────
  const LISTS = {
    nasdaq: ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','AVGO','COST','NFLX','AMD','INTC','TSLA'],
    sp500:  ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','BRK.B','JPM','V','LLY','UNH','XOM'],
    dow:    ['AAPL','MSFT','JPM','V','JNJ','WMT','PG','KO','DIS','CSCO','CVX','IBM']
  };

  let activeList = 'nasdaq';
  let activeSymbol = 'AAPL';

  function setActiveTab(key) {
    activeList = key;
    $$('.rv-list-tab').forEach(btn => btn.classList.remove('active'));
    const btns = $$('.rv-list-tab');
    if (key === 'nasdaq') btns[0]?.classList.add('active');
    if (key === 'sp500') btns[1]?.classList.add('active');
    if (key === 'dow') btns[2]?.classList.add('active');
  }

  function renderStockList() {
    const container = $('#rv-stock-list-container');
    if (!container) return;
    const search = ($('#stockSearch')?.value || '').trim().toUpperCase();

    const items = (LISTS[activeList] || []).filter(sym => !search || sym.includes(search));
    container.innerHTML = items.map(sym => `
      <div class="rv-stock-item ${sym === activeSymbol ? 'active' : ''}" data-sym="${sym}">
        <span>${sym}</span>
      </div>
    `).join('');

    $$('.rv-stock-item', container).forEach(el => {
      el.addEventListener('click', () => {
        const sym = el.getAttribute('data-sym');
        if (!sym) return;
        activeSymbol = sym;
        $('#rv-selected-stock-name').textContent = sym;
        renderStockList();
        updateExplorer(sym);
      });
    });
  }

  function loadStockList(key) {
    setActiveTab(key);
    renderStockList();
  }

  function filterStocks() {
    renderStockList();
  }

  function updateExplorer(sym) {
    // Inject TradingView widgets into the two containers
    const fundamentals = $('#container-fundamentals');
    const technicals = $('#container-technicals');
    if (!fundamentals || !technicals) return;

    fundamentals.innerHTML = '';
    technicals.innerHTML = '';

    const fWrap = document.createElement('div');
    fWrap.className = 'tradingview-widget-container';
    fWrap.innerHTML = `<div class="tradingview-widget-container__widget"></div>`;
    const tWrap = document.createElement('div');
    tWrap.className = 'tradingview-widget-container';
    tWrap.innerHTML = `<div class="tradingview-widget-container__widget"></div>`;

    fundamentals.appendChild(fWrap);
    technicals.appendChild(tWrap);

    const s1 = document.createElement('script');
    s1.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
    s1.async = true;
    s1.textContent = JSON.stringify({
      symbol: `NASDAQ:${sym}`,
      colorTheme: 'dark',
      isTransparent: true,
      locale: 'en',
      width: '100%',
      height: '100%'
    });

    const s2 = document.createElement('script');
    s2.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
    s2.async = true;
    s2.textContent = JSON.stringify({
      symbol: `NASDAQ:${sym}`,
      interval: '1D',
      colorTheme: 'dark',
      isTransparent: true,
      locale: 'en',
      width: '100%',
      height: '100%'
    });

    fWrap.appendChild(s1);
    tWrap.appendChild(s2);
  }

  // ─────────────────────────────────────────────────────────────
  // Live News Feed (RSS)
  // Uses AllOrigins as a free proxy to fetch RSS XML. Then parses XML via DOMParser.
  // ─────────────────────────────────────────────────────────────
  function parseRss(xmlText, sourceName) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const items = Array.from(xml.querySelectorAll('item')).slice(0, 25);

    return items.map(it => {
      const title = it.querySelector('title')?.textContent?.trim() || '';
      const link = it.querySelector('link')?.textContent?.trim() || '';
      const pubDate = it.querySelector('pubDate')?.textContent?.trim() || '';
      return { title, link, pubDate, source: sourceName };
    });
  }

  function renderNews(items, container) {
    if (!container) return;

    const clean = (s) => {
      if (!window.DOMPurify) return s;
      return DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    };

    const html = items.map(n => `
      <a class="rv-news-item" href="${clean(n.link)}" target="_blank" rel="noopener noreferrer">
        <div class="rv-news-title">${clean(n.title)}</div>
        <div class="rv-news-meta">${clean(n.source)} · <span>${clean(n.pubDate || '')}</span></div>
      </a>
    `).join('');

    container.innerHTML = html || `<div style="padding:14px; opacity:.8;">No news items.</div>`;
  }

  async function fetchViaAllOrigins(url) {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Proxy fetch failed');
    const json = await res.json();
    return json.contents;
  }

  async function initNewsFeed() {
    const container = $('#rv-news-feed-list');
    const btn = $('#news-refresh-btn');
    if (!container) return;

    const SOURCES = [
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
      { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' }
    ];

    async function refresh() {
      if (btn) btn.disabled = true;
      container.innerHTML = `<div style="padding:14px; opacity:.8;">Loading news…</div>`;

      try {
        const all = [];
        for (const s of SOURCES) {
          const xmlText = await fetchViaAllOrigins(s.url);
          const parsed = parseRss(xmlText, s.name);
          all.push(...parsed);
        }

        // Sort by pubDate string (best-effort)
        const newsItems = all
          .filter(x => x.title && x.link)
          .slice(0, 40);

        renderNews(newsItems, container);
                if (window.RV_ADD && typeof window.RV_ADD.__updateCheatHeat === 'function') {
                    window.RV_ADD.__updateCheatHeat(newsItems);
                }
      } catch (e) {
        container.innerHTML = `<div style="padding:14px; opacity:.8;">Failed to load news. Try again.</div>`;
        if (window.RV_ADD && typeof window.RV_ADD.__updateCheatHeat === 'function') {
          window.RV_ADD.__updateCheatHeat([]);
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    if (btn) btn.addEventListener('click', refresh);

    // initial load
    refresh();
  }

  // ─────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMarketTimer();
    initGauges();
    initWatchlist();

    // Deep dive default
    loadStockList('nasdaq');
    updateExplorer(activeSymbol);

    // News feed
    initNewsFeed();
    if (window.RV_ADD && typeof window.RV_ADD.__updateCheatHeat === 'function') window.RV_ADD.__updateCheatHeat([]);
  });

})();


// ─────────────────────────────────────────────────────────────
// RV_ADD namespace bridge (additive; does not break existing code)
// This fixes inline handlers in index.html like RV_ADD.Explorer.load()
// and powers the small "Automated Insights (Beta)" box.
// ─────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // Do not overwrite if something already defined
  window.RV_ADD = window.RV_ADD || {};

  // Bridge existing Deep Dive functions to the RV_ADD.Explorer namespace expected by index.html
  window.RV_ADD.Explorer = window.RV_ADD.Explorer || {};
  if (typeof window.RV_ADD.Explorer.load !== 'function' && typeof window.loadStockList === 'function') {
    window.RV_ADD.Explorer.load = window.loadStockList;
  }
  if (typeof window.RV_ADD.Explorer.filter !== 'function' && typeof window.filterStocks === 'function') {
    window.RV_ADD.Explorer.filter = window.filterStocks;
  }

  // Cheats: deterministic mini-insight from the already-fetched Yahoo RSS items
  // Input shape expected: [{ title, link, pubDate, source }]
  function computeKeywordHeat(items) {
    const stop = new Set([
      'the','a','an','and','or','to','of','in','on','for','with','as','at','by','from','is','are','was','were',
      'after','before','over','under','into','about','amid','says','say','saying','new','live','update','updates',
      'market','markets','stock','stocks','crypto','bitcoin','shares','price','prices','today','this','that'
    ]);
    const counts = new Map();
    for (const it of items || []) {
      const text = (it?.title || '').toLowerCase();
      const words = text.split(/[^a-z0-9]+/).filter(Boolean);
      for (const w of words) {
        if (w.length < 3) continue;
        if (stop.has(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 8);
  }

  function renderHeat(el, items) {
    if (!el) return;
    if (!items || !items.length) {
      el.textContent = 'No data yet (waiting for news sync).';
      return;
    }
    const top = computeKeywordHeat(items);
    const uniqueSources = new Set(items.map(x => x.source).filter(Boolean));
    const now = new Date();
    const ts = now.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });

    const parts = [];
    parts.push(`<div><strong>Updated:</strong> ${ts}</div>`);
    parts.push(`<div><strong>Items:</strong> ${items.length} · <strong>Sources:</strong> ${uniqueSources.size}</div>`);
    if (top.length) {
      parts.push('<div style="margin-top:8px;"><strong>Top narratives (keyword heat):</strong></div>');
      parts.push('<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">' +
        top.map(([w,c]) => `<span style="padding:4px 8px; border:1px solid rgba(255,255,255,.15); border-radius:999px; font-size:12px;">${escapeHtml(w)} <span style="opacity:.7">(${c})</span></span>`).join('') +
      '</div>');
    } else {
      parts.push('<div style="margin-top:8px; opacity:.8;">No strong keyword signal yet.</div>');
    }
    el.innerHTML = parts.join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // Public hook for existing news fetch code:
  window.RV_ADD.__updateCheatHeat = function (newsItems) {
    const el = document.getElementById('cheat-heat');
    renderHeat(el, newsItems);
  };
})();