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
});

/* --- 1. FULL STOCK DATA (EXPANDED LISTS) --- */
const STOCK_LISTS = {
    nasdaq: [
        { s: "AAPL", n: "Apple" }, { s: "MSFT", n: "Microsoft" }, { s: "NVDA", n: "NVIDIA" }, { s: "AMZN", n: "Amazon" },
        { s: "META", n: "Meta" }, { s: "GOOGL", n: "Alphabet" }, { s: "TSLA", n: "Tesla" }, { s: "AVGO", n: "Broadcom" },
        { s: "COST", n: "Costco" }, { s: "PEP", n: "PepsiCo" }, { s: "NFLX", n: "Netflix" }, { s: "AMD", n: "AMD" },
        { s: "ADBE", n: "Adobe" }, { s: "QCOM", n: "Qualcomm" }, { s: "TXN", n: "Texas Instr." }, { s: "INTC", n: "Intel" },
        { s: "AMGN", n: "Amgen" }, { s: "HON", n: "Honeywell" }, { s: "INTU", n: "Intuit" }, { s: "SBUX", n: "Starbucks" }
    ],
    dow: [
        { s: "MMM", n: "3M" }, { s: "AXP", n: "Am. Express" }, { s: "AMGN", n: "Amgen" }, { s: "AAPL", n: "Apple" },
        { s: "BA", n: "Boeing" }, { s: "CAT", n: "Caterpillar" }, { s: "CVX", n: "Chevron" }, { s: "CSCO", n: "Cisco" },
        { s: "KO", n: "Coca-Cola" }, { s: "DIS", n: "Disney" }, { s: "DOW", n: "Dow Inc" }, { s: "GS", n: "Goldman" },
        { s: "HD", n: "Home Depot" }, { s: "HON", n: "Honeywell" }, { s: "IBM", n: "IBM" }, { s: "INTC", n: "Intel" },
        { s: "JNJ", n: "J&J" }, { s: "JPM", n: "JPMorgan" }, { s: "MCD", n: "McDonalds" }, { s: "MRK", n: "Merck" },
        { s: "MSFT", n: "Microsoft" }, { s: "NKE", n: "Nike" }, { s: "PG", n: "P&G" }, { s: "CRM", n: "Salesforce" },
        { s: "TRV", n: "Travelers" }, { s: "UNH", n: "UnitedHealth" }, { s: "VZ", n: "Verizon" }, { s: "V", n: "Visa" },
        { s: "WMT", n: "Walmart" }
    ],
    sp500: [
        { s: "SPY", n: "S&P 500 ETF" }, { s: "JPM", n: "JPMorgan" }, { s: "V", n: "Visa" }, { s: "LLY", n: "Lilly" },
        { s: "MA", n: "Mastercard" }, { s: "HD", n: "Home Depot" }, { s: "XOM", n: "Exxon" }, { s: "UNH", n: "UnitedHealth" },
        { s: "JNJ", n: "J&J" }, { s: "PG", n: "P&G" }, { s: "COST", n: "Costco" }, { s: "ABBV", n: "AbbVie" },
        { s: "BAC", n: "BofA" }, { s: "KO", n: "Coca-Cola" }, { s: "CRM", n: "Salesforce" }, { s: "ACN", n: "Accenture" },
        { s: "MCD", n: "McDonalds" }, { s: "DIS", n: "Disney" }, { s: "CSCO", n: "Cisco" }, { s: "T", n: "AT&T" }
    ]
};

/* --- 2. US MARKET TIMER --- */
function initUSMarketTimer() {
    const statusText = document.getElementById('mt-status');
    const dot = document.getElementById('mt-dot');
    const timeDisplay = document.getElementById('mt-time');

    const options = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false };
    const nyTimeStr = new Date().toLocaleTimeString('en-US', options);
    
    const nyDate = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
    const nowNY = new Date(nyDate);
    const day = nowNY.getDay(); 
    const hours = nowNY.getHours();
    const minutes = nowNY.getMinutes();
    const timeVal = hours + minutes / 60;

    timeDisplay.textContent = `NYC: ${nyTimeStr}`;

    let status = "Closed";
    let cssClass = "status-closed";

    if (day === 0 || day === 6) {
        status = "Weekend Closed";
        cssClass = "status-closed";
    } else {
        if (timeVal >= 4.0 && timeVal < 9.5) { status = "Pre-Market"; cssClass = "status-pre"; }
        else if (timeVal >= 9.5 && timeVal < 16.0) { status = "Market Open"; cssClass = "status-open"; }
        else if (timeVal >= 16.0 && timeVal < 20.0) { status = "After Hours"; cssClass = "status-pre"; }
    }

    if(statusText) statusText.textContent = status;
    if(dot) dot.className = "status-dot " + cssClass;
}

/* --- 3. LIVE NEWS FEED (XML PARSER) --- */
const PROXY = "https://api.allorigins.win/get?url=";
const FEED_URL = "https://finance.yahoo.com/news/rssindex";

async function initNewsFeed() {
    const container = document.getElementById('rv-news-feed-list');
    if(!container) return;

    if(container.innerHTML.trim() === "") container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Syncing...</div>';

    // Add random param to prevent caching
    const cacheBuster = `&t=${Date.now()}`;

    try {
        const response = await fetch(PROXY + encodeURIComponent(FEED_URL) + cacheBuster);
        const data = await response.json();
        
        if (data.contents) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(data.contents, "text/xml");
            const items = xml.querySelectorAll("item");
            
            let newsItems = [];
            items.forEach((item, index) => {
                if(index > 15) return; 
                const title = item.querySelector("title")?.textContent;
                const link = item.querySelector("link")?.textContent;
                const pubDate = item.querySelector("pubDate")?.textContent;
                
                if(title && link) {
                    newsItems.push({
                        title: title,
                        link: link,
                        date: pubDate ? new Date(pubDate) : new Date()
                    });
                }
            });

            if(newsItems.length > 0) {
                renderNews(newsItems, container);
            }
        }
    } catch (e) {
        console.error("News Fetch Error", e);
    }
}

function renderNews(items, container) {
    const html = items.map(item => {
        let timeStr = item.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        return `
        <a href="${item.link}" target="_blank" class="rv-news-list-item">
            <span class="rv-news-list-title">${item.title}</span>
            <span class="rv-news-list-time">${timeStr}</span>
        </a>
        `;
    }).join('');
    container.innerHTML = html;
}

/* --- 4. STOCK EXPLORER --- */
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
    const d1 = document.createElement('div'); d1.className = 'tradingview-widget-container__widget';
    const c1 = document.createElement('div'); c1.className = 'tradingview-widget-container';
    c1.appendChild(d1); c1.appendChild(s1);
    techContainer.appendChild(c1);

    const s2 = document.createElement('script');
    s2.type = 'text/javascript';
    s2.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
    s2.async = true;
    s2.innerHTML = JSON.stringify({
        "colorTheme": "dark", "isTransparent": true, "displayMode": "regular", 
        "width": "100%", "height": "100%", "symbol": symbol, "locale": "en"
    });
    const d2 = document.createElement('div'); d2.className = 'tradingview-widget-container__widget';
    const c2 = document.createElement('div'); c2.className = 'tradingview-widget-container';
    c2.appendChild(d2); c2.appendChild(s2);
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

/* --- 5. THEME SWITCHER --- */
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

/* --- 6. WATCHLIST WITH SIMULATED LIVE PRICE (MOCK) --- */
// Hinweis: Echte Live-Preise für Einzelaktien kosten API-Gebühren. Wir simulieren hier für die UX.
function initWatchlist() {
    const input = document.getElementById('wl-input');
    const suggestionsBox = document.getElementById('wl-suggestions');
    const container = document.getElementById('wl-container');
    const btn = document.getElementById('wl-add-btn');
    
    let watchlist = JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA'];

    const render = () => {
        container.innerHTML = watchlist.map(sym => `
            <div class="rv-wl-item" id="wl-item-${sym}">
                <div style="font-weight:bold; font-size:14px;">${sym}</div>
                <div class="rv-wl-price" style="font-size:12px; color:#888; margin-top:4px;">Loading...</div>
                <span class="rv-wl-remove" onclick="removeWatchlist('${sym}')">&times;</span>
            </div>
        `).join('');
        
        // Mock Price Update
        setTimeout(() => {
            document.querySelectorAll('.rv-wl-item').forEach(item => {
                const sym = item.id.replace('wl-item-', '');
                const el = item.querySelector('.rv-wl-price');
                
                // Deterministic Mock Price based on symbol char codes
                const seed = sym.split('').reduce((a,b) => a+b.charCodeAt(0), 0);
                const price = (seed % 500) + 50 + (Math.random()*2);
                const change = (Math.random() * 4) - 2; // -2% to +2%
                
                const color = change >= 0 ? '#10b981' : '#ef4444';
                const sign = change >= 0 ? '+' : '';
                
                el.innerHTML = `$${price.toFixed(2)} <br><span style="color:${color}">${sign}${change.toFixed(2)}%</span>`;
            });
        }, 800);
    };
    
    window.removeWatchlist = (sym) => {
        watchlist = watchlist.filter(s => s !== sym);
        localStorage.setItem('rv_watchlist', JSON.stringify(watchlist));
        render();
    };

    input.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        if(val.length < 1) { suggestionsBox.style.display = 'none'; return; }
        const matches = STOCK_LISTS.nasdaq.concat(STOCK_LISTS.sp500).concat(STOCK_LISTS.dow).filter(x => x.s.startsWith(val) || x.n.toUpperCase().startsWith(val));
        
        if(matches.length > 0) {
            suggestionsBox.innerHTML = matches.slice(0,5).map(m => 
                `<div class="rv-suggestion-item" onclick="addWatchlist('${m.s}')">${m.s} <span style="color:#666">(${m.n})</span></div>`
            ).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    window.addWatchlist = (sym) => {
        if(!watchlist.includes(sym)) {
            watchlist.push(sym);
            localStorage.setItem('rv_watchlist', JSON.stringify(watchlist));
            render();
        }
        input.value = '';
        suggestionsBox.style.display = 'none';
    };
    
    btn.addEventListener('click', () => { if(input.value) addWatchlist(input.value.toUpperCase()); });
    render();
}

/* --- 7. DUAL FEAR & GREED (STOCKS + CRYPTO) --- */
function initMCS() {
    // 1. Stock Gauge (Canvas)
    const ctxStock = document.getElementById('mcs-chart-stock').getContext('2d');
    const scoreStock = 62; // Mock Value (Greed)
    document.getElementById('mcs-value-stock').innerText = scoreStock;
    new Chart(ctxStock, {
        type: 'doughnut',
        data: {
            labels: ['Greed', 'Fear'],
            datasets: [{
                data: [scoreStock, 100-scoreStock],
                backgroundColor: ['#10b981', 'rgba(255,255,255,0.1)'],
                borderWidth: 0,
                cutout: '80%'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });

    // 2. Crypto Gauge (Canvas)
    const ctxCrypto = document.getElementById('mcs-chart-crypto').getContext('2d');
    const scoreCrypto = 74; // Mock Value
    document.getElementById('mcs-value-crypto').innerText = scoreCrypto;
    new Chart(ctxCrypto, {
        type: 'doughnut',
        data: {
            labels: ['Greed', 'Fear'],
            datasets: [{
                data: [scoreCrypto, 100-scoreCrypto],
                backgroundColor: ['#10b981', 'rgba(255,255,255,0.1)'],
                borderWidth: 0,
                cutout: '80%'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
}