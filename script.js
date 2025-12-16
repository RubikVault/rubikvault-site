/* ==========================================================================
   RUBIKVAULT - CORE
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // Core UX
    initTheme();
    registerServiceWorker();
    initUSMarketTimer();
    initMCS();           // initialize chart shell (updates after news loads)
    initWatchlist();     // renders + triggers live quotes
    initNewsFeed();      // loads live news and updates MCS

    // Explorer defaults (existing feature)
    loadStockList('nasdaq');
    updateExplorer('NASDAQ:AAPL', 'Apple Inc');

    // Timers (keep polite; free tiers hate spam)
    setInterval(initUSMarketTimer, 1000);
    setInterval(initNewsFeed, 60_000);          // refresh news every 60s (server caches)
    setInterval(refreshWatchlistQuotes, 30_000); // refresh quotes every 30s (server caches)
});

/* --- 0. HELPERS --- */
function escapeHTML(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

// Small built-in suggestions list (fast, no API needed). Expand anytime.
const SUGGESTIONS_DB = [
    {s:'AAPL', n:'Apple'}, {s:'MSFT', n:'Microsoft'}, {s:'NVDA', n:'NVIDIA'}, {s:'AMZN', n:'Amazon'},
    {s:'GOOGL', n:'Alphabet'}, {s:'TSLA', n:'Tesla'}, {s:'META', n:'Meta'}, {s:'NFLX', n:'Netflix'},
    {s:'SPY', n:'S&P 500 ETF'}, {s:'QQQ', n:'Nasdaq 100 ETF'}, {s:'IWM', n:'Russell 2000 ETF'},
    {s:'BTC-USD', n:'Bitcoin (Yahoo-style)'}, {s:'ETH-USD', n:'Ethereum (Yahoo-style)'}
];

/* --- 1. DATASETS --- */
const STOCK_LISTS = {
    nasdaq: [
        { name: "Apple Inc", symbol: "NASDAQ:AAPL" },
        { name: "Microsoft", symbol: "NASDAQ:MSFT" },
        { name: "NVIDIA", symbol: "NASDAQ:NVDA" },
        { name: "Amazon", symbol: "NASDAQ:AMZN" },
        { name: "Alphabet", symbol: "NASDAQ:GOOGL" },
        { name: "Meta", symbol: "NASDAQ:META" },
        { name: "Tesla", symbol: "NASDAQ:TSLA" },
        { name: "Netflix", symbol: "NASDAQ:NFLX" }
    ],
    sp500: [
        { name: "SPDR S&P 500 ETF", symbol: "AMEX:SPY" },
        { name: "Berkshire Hathaway", symbol: "NYSE:BRK.B" },
        { name: "JPMorgan Chase", symbol: "NYSE:JPM" },
        { name: "Johnson & Johnson", symbol: "NYSE:JNJ" }
    ],
    dow: [
        { name: "Dow Jones Index", symbol: "FOREXCOM:DJI" },
        { name: "Coca-Cola", symbol: "NYSE:KO" },
        { name: "Visa", symbol: "NYSE:V" },
        { name: "Goldman Sachs", symbol: "NYSE:GS" }
    ]
};

/* --- 2. THEME TOGGLE --- */
function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const body = document.body;
    if (!btn) return;

    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const stored = localStorage.getItem('rv_theme');
    let theme = stored || (prefersLight ? 'light' : 'dark');

    const apply = () => {
        if (theme === 'light') {
            body.setAttribute('data-theme', 'light');
            btn.textContent = '🌙';
        } else {
            body.removeAttribute('data-theme');
            btn.textContent = '☀️';
        }
    };

    apply();

    btn.addEventListener('click', () => {
        theme = (theme === 'light') ? 'dark' : 'light';
        localStorage.setItem('rv_theme', theme);
        apply();
    });
}

/* --- 3. MARKET TIMER --- */
function initUSMarketTimer() {
    const statusText = document.getElementById('mt-status');
    const dot = document.getElementById('mt-dot');
    const timeDisplay = document.getElementById('mt-time');

    const options = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false };
    const nyTimeStr = new Date().toLocaleTimeString('en-US', options);

    const nyDate = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const nowNY = new Date(nyDate);
    const hours = nowNY.getHours();
    const minutes = nowNY.getMinutes();
    const timeVal = hours + minutes / 60;
    const day = nowNY.getDay();

    if (timeDisplay) timeDisplay.textContent = `NYC: ${nyTimeStr}`;

    let status = "Closed";
    let cls = "status-closed";

    if (day > 0 && day < 6) {
        if (timeVal >= 4.0 && timeVal < 9.5) { status = "Pre-Market"; cls = "status-pre"; }
        else if (timeVal >= 9.5 && timeVal < 16.0) { status = "Market Open"; cls = "status-open"; }
        else if (timeVal >= 16.0 && timeVal < 20.0) { status = "After Hours"; cls = "status-pre"; }
    }

    if (statusText) statusText.textContent = status;
    if (dot) dot.className = "status-dot " + cls;
}

/* --- 4. LIVE NEWS (via Cloudflare Pages Function /api/news) --- */
async function initNewsFeed() {
    const container = document.getElementById('rv-news-feed-list');
    if (!container) return;

    // Globaler Zugriff für Refresh Button
    window.initNewsFeed = initNewsFeed;

    // Show lightweight loading only when empty
    if (container.children.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Syncing live news...</div>';
    }

    try {
        const res = await fetch('/api/news', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
            const msg = (data && data.error) ? data.error : 'News API unavailable';
            container.innerHTML = `<div style="padding:20px; text-align:center; color:#ef4444;">${escapeHTML(msg)}</div>`;
            return;
        }

        const items = Array.isArray(data.items) ? data.items.slice(0, 20) : [];
        container.innerHTML = ''; // rebuild

        // If we have sentiment: update MCS
        updateMCSFromNews(items);

        if (items.length === 0) {
            container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No items right now.</div>';
            return;
        }

        const frag = document.createDocumentFragment();

        for (const it of items) {
            const a = document.createElement('a');
            a.className = 'rv-news-list-item';
            a.href = it.url || '#';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';

            const title = document.createElement('span');
            title.className = 'rv-news-list-title';
            title.textContent = it.title || 'News';

            const meta = document.createElement('span');
            meta.className = 'rv-news-list-time';

            const time = it.published_at ? new Date(it.published_at) : null;
            const hhmm = time ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            meta.textContent = hhmm;

            a.appendChild(title);
            a.appendChild(meta);

            frag.appendChild(a);
        }

        container.appendChild(frag);

        // Source label (optional UI element)
        const srcEl = document.querySelector('#section-news .rv-news-header span');
        if (srcEl && data.source) {
            srcEl.textContent = `Source: ${data.source}`;
        }
    } catch (e) {
        console.error('News Error', e);
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#ef4444;">Failed to load news.</div>';
    }
}

/* --- 5. WATCHLIST (via Cloudflare Pages Function /api/quotes) --- */
function initWatchlist() {
    const input = document.getElementById('wl-input');
    const suggestionsBox = document.getElementById('wl-suggestions');
    const container = document.getElementById('wl-container');
    const btn = document.getElementById('wl-add-btn');

    if (!input || !suggestionsBox || !container || !btn) return;

    let watchlist = JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA'];

    const persist = () => localStorage.setItem('rv_watchlist', JSON.stringify(watchlist));

    const render = () => {
        container.innerHTML = watchlist.map(sym => `
            <div class="rv-wl-item" data-sym="${sym}">
                <div style="font-weight:bold">${escapeHTML(sym)}</div>
                <div class="rv-wl-sub" style="font-size:11px; color:var(--rv-text-muted);">—</div>
                <span class="rv-wl-remove" title="Remove" onclick="removeWatchlist('${escapeHTML(sym)}')">&times;</span>
            </div>
        `).join('');
    };

    window.removeWatchlist = (sym) => {
        watchlist = watchlist.filter(s => s !== sym);
        persist();
        render();
        refreshWatchlistQuotes();
    };

    const add = (sym) => {
        const clean = String(sym || '').trim().toUpperCase();
        if (!clean) return;
        if (!watchlist.includes(clean)) {
            if (watchlist.length >= 20) {
                alert('Watchlist limit reached (20).');
                return;
            }
            watchlist.push(clean);
            persist();
            render();
            refreshWatchlistQuotes();
        }
        input.value = '';
        suggestionsBox.style.display = 'none';
    };

    // Autocomplete
    input.addEventListener('input', () => {
        const val = input.value.trim().toUpperCase();
        if (val.length < 1) { suggestionsBox.style.display = 'none'; return; }
        const matches = SUGGESTIONS_DB.filter(x => x.s.startsWith(val)).slice(0, 8);
        if (matches.length === 0) { suggestionsBox.style.display = 'none'; return; }

        suggestionsBox.innerHTML = matches.map(m =>
            `<div class="rv-suggestion-item" onclick="addWatchlistFromUI('${escapeHTML(m.s)}')">${escapeHTML(m.s)} <span style="opacity:.6">— ${escapeHTML(m.n)}</span></div>`
        ).join('');
        suggestionsBox.style.display = 'block';
    });

    window.addWatchlistFromUI = (sym) => add(sym);

    btn.addEventListener('click', () => add(input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') add(input.value);
    });

    // Initial
    render();
    refreshWatchlistQuotes();

    // expose for periodic refresh
    window.__rv_getWatchlist = () => watchlist.slice();
}

async function refreshWatchlistQuotes() {
    const container = document.getElementById('wl-container');
    if (!container) return;

    const watchlist = (window.__rv_getWatchlist ? window.__rv_getWatchlist() : JSON.parse(localStorage.getItem('rv_watchlist')) || []);
    if (watchlist.length === 0) return;

    const q = encodeURIComponent(watchlist.join(','));
    try {
        const res = await fetch(`/api/quotes?tickers=${q}`, { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok || !data.items) {
            container.querySelectorAll('.rv-wl-item .rv-wl-sub').forEach(el => {
                el.textContent = 'Quotes unavailable';
                el.style.color = '#ef4444';
            });
            return;
        }

        for (const [sym, qd] of Object.entries(data.items)) {
            const card = container.querySelector(`.rv-wl-item[data-sym="${CSS.escape(sym)}"]`);
            if (!card) continue;

            const sub = card.querySelector('.rv-wl-sub');
            if (!sub) continue;

            const price = (qd && typeof qd.price === 'number') ? qd.price : null;
            const chg = (qd && typeof qd.change === 'number') ? qd.change : null;
            const pct = (qd && typeof qd.change_pct === 'number') ? qd.change_pct : null;

            const priceStr = price !== null ? `$${price.toFixed(2)}` : '—';
            const sign = (chg !== null && chg > 0) ? '+' : '';
            const chgStr = (chg !== null) ? `${sign}${chg.toFixed(2)}` : '—';
            const pctStr = (pct !== null) ? `(${sign}${pct.toFixed(2)}%)` : '';

            sub.textContent = `${priceStr}  ${chgStr} ${pctStr}`.trim();

            if (chg !== null) {
                sub.style.color = chg > 0 ? '#10b981' : (chg < 0 ? '#ef4444' : 'var(--rv-text-muted)');
            } else {
                sub.style.color = 'var(--rv-text-muted)';
            }
        }
    } catch (e) {
        console.error('Quotes error', e);
        container.querySelectorAll('.rv-wl-item .rv-wl-sub').forEach(el => {
            el.textContent = 'Quotes unavailable';
            el.style.color = '#ef4444';
        });
    }
}

/* --- 6. MCS (computed from live news sentiment) --- */
let __rv_mcsChart = null;

function initMCS() {
    const canvas = document.getElementById('mcs-chart');
    const valueEl = document.getElementById('mcs-value');
    const ctxEl = document.getElementById('mcs-context-text');
    if (!canvas || !valueEl || !ctxEl) return;

    const ctx = canvas.getContext('2d');
    __rv_mcsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Score', 'Rest'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['rgba(56,189,248,0.85)', 'rgba(255,255,255,0.08)'],
                borderWidth: 0,
                cutout: '85%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });

    valueEl.textContent = '—';
    ctxEl.textContent = 'Waiting for live news sentiment...';
}

// Called by initNewsFeed()
function updateMCSFromNews(items) {
    const valueEl = document.getElementById('mcs-value');
    const ctxEl = document.getElementById('mcs-context-text');
    if (!valueEl || !ctxEl) return;

    const sentiments = (items || [])
        .map(x => (typeof x.sentiment === 'number' ? x.sentiment : null))
        .filter(v => v !== null);

    if (sentiments.length < 3) {
        valueEl.textContent = '—';
        ctxEl.textContent = 'Not enough sentiment data yet.';
        return;
    }

    const mean = sentiments.reduce((a,b) => a+b, 0) / sentiments.length;
    const variance = sentiments.reduce((a,b) => a + Math.pow(b-mean,2), 0) / sentiments.length;
    const std = Math.sqrt(variance);

    // Map -1..+1 to 0..100
    const score = Math.max(0, Math.min(100, Math.round((mean + 1) * 50)));

    // Labeling
    let mood = 'Mixed';
    if (mean >= 0.35) mood = 'Bullish';
    if (mean <= -0.35) mood = 'Bearish';

    let uncertainty = '';
    if (std >= 0.45) uncertainty = ' High disagreement.';
    else if (std >= 0.30) uncertainty = ' Elevated disagreement.';

    valueEl.textContent = String(score);
    ctxEl.textContent = `${mood}.${uncertainty} (n=${sentiments.length})`;

    if (__rv_mcsChart) {
        __rv_mcsChart.data.datasets[0].data = [score, 100 - score];

        const primary =
            mean >= 0.35 ? 'rgba(16,185,129,0.9)' :
            mean <= -0.35 ? 'rgba(239,68,68,0.9)' :
            'rgba(56,189,248,0.85)';

        __rv_mcsChart.data.datasets[0].backgroundColor = [primary, 'rgba(255,255,255,0.08)'];
        __rv_mcsChart.update();
    }
}

/* --- 7. EXISTING EXPLORER (kept) --- */
function loadStockList(category) {
    const container = document.getElementById("rv-stock-list-container");
    if (!container) return;

    const list = STOCK_LISTS[category] || [];
    container.innerHTML = list.map(item => `
        <div class="rv-stock-item" onclick="updateExplorer('${item.symbol}', '${escapeHTML(item.name)}')">
            <div class="rv-stock-symbol">${escapeHTML(item.symbol.split(":")[1])}</div>
            <div class="rv-stock-name">${escapeHTML(item.name)}</div>
        </div>
    `).join("");
}

function updateExplorer(symbol, name) {
    const title = document.getElementById("rv-selected-stock-name");
    if (title) title.textContent = `${name}`;

    // If your previous code injects TradingView fundamentals/technicals widgets here,
    // keep that logic in your existing file (I didn't remove anything).
}