/* ==========================================================================
   RUBIK VAULT - MASTER LOGIC
   ========================================================================== */

// --- 1. STOCK DATA DEFINITION (For Option E/F Explorer) ---
// Wir laden eine statische Liste der wichtigsten Aktien, um die API zu entlasten
const STOCK_LISTS = {
    nasdaq: [
        { s: "AAPL", n: "Apple Inc" }, { s: "MSFT", n: "Microsoft" }, { s: "NVDA", n: "NVIDIA" }, 
        { s: "AMZN", n: "Amazon" }, { s: "META", n: "Meta Platforms" }, { s: "GOOGL", n: "Alphabet A" },
        { s: "TSLA", n: "Tesla" }, { s: "AVGO", n: "Broadcom" }, { s: "COST", n: "Costco" },
        { s: "PEP", n: "PepsiCo" }, { s: "NFLX", n: "Netflix" }, { s: "AMD", n: "Adv. Micro Dev." }
    ],
    sp500: [
        { s: "SPY", n: "S&P 500 ETF" }, { s: "JPM", n: "JPMorgan" }, { s: "V", n: "Visa" },
        { s: "JNJ", n: "Johnson & Johnson" }, { s: "WMT", n: "Walmart" }, { s: "PG", n: "Procter & Gamble" },
        { s: "MA", n: "Mastercard" }, { s: "HD", n: "Home Depot" }, { s: "XOM", n: "Exxon Mobil" },
        { s: "UNH", n: "UnitedHealth" }, { s: "BAC", n: "Bank of America" }
    ],
    dow: [
        { s: "DIA", n: "Dow ETF" }, { s: "UNH", n: "UnitedHealth" }, { s: "GS", n: "Goldman Sachs" },
        { s: "MSFT", n: "Microsoft" }, { s: "HD", n: "Home Depot" }, { s: "CAT", n: "Caterpillar" },
        { s: "CRM", n: "Salesforce" }, { s: "V", n: "Visa" }, { s: "MCD", n: "McDonald's" }
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initUSMarketTimer();
    initNewsFeed();
    
    // Init Explorer with Nasdaq
    loadStockList('nasdaq');
    
    // Intervals
    setInterval(initUSMarketTimer, 1000); // Clock tick
    setInterval(initNewsFeed, 30000); // News Refresh 30s
});

/* --- 2. US MARKET TIMER (EXACT NYC TIME) --- */
function initUSMarketTimer() {
    const statusText = document.getElementById('mt-status');
    const dot = document.getElementById('mt-dot');
    const timeDisplay = document.getElementById('mt-time');

    // Aktuelle Zeit in New York (America/New_York)
    const options = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const nyTimeStr = new Date().toLocaleTimeString('en-US', options);
    
    // Wir brauchen das Datum in NY, um Wochentag/Stunde zu prüfen
    const nyDate = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
    const nowNY = new Date(nyDate);
    
    const day = nowNY.getDay(); // 0=Sun, 6=Sat
    const hours = nowNY.getHours();
    const minutes = nowNY.getMinutes();
    const timeVal = hours + minutes / 60;

    // Display Time
    timeDisplay.textContent = `NYC: ${nyTimeStr}`;

    // Logic
    let status = "Closed";
    let cssClass = "status-closed";

    // Weekend
    if (day === 0 || day === 6) {
        status = "Weekend Closed";
        cssClass = "status-closed";
    } else {
        // Weekday Logic
        if (timeVal >= 4.0 && timeVal < 9.5) {
            status = "Pre-Market";
            cssClass = "status-pre";
        } else if (timeVal >= 9.5 && timeVal < 16.0) {
            status = "Market Open";
            cssClass = "status-open";
        } else if (timeVal >= 16.0 && timeVal < 20.0) {
            status = "After Hours";
            cssClass = "status-pre"; // Use yellow for after hours too
        } else {
            status = "Market Closed";
            cssClass = "status-closed";
        }
    }

    statusText.textContent = status;
    dot.className = "status-dot " + cssClass;
}

/* --- 3. ROBUST NEWS FEED (Option J) --- */
// Using Yahoo Finance RSS via Proxy
const FEED_URLS = [
    'https://finance.yahoo.com/news/rssindex', 
    'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664'
];

async function initNewsFeed() {
    const container = document.getElementById('rv-news-feed-list');
    if(!container) return;

    if(container.innerHTML.trim() === "") container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Syncing US News...</div>';

    let newsItems = [];

    // Wir nutzen rss2json mit Timestamp trick
    const fetches = FEED_URLS.map(url => 
        fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&api_key=0&t=${Date.now()}`)
        .then(r => r.json())
        .then(data => data.items || [])
        .catch(e => [])
    );

    const results = await Promise.all(fetches);
    results.forEach(items => newsItems = [...newsItems, ...items]);

    // Wenn leer (API Limit), zeige Fallback
    if(newsItems.length === 0) {
        renderNews([
            { title: "⚠️ Live Feed paused (API Rate Limit). Trying to reconnect...", pubDate: new Date().toISOString(), link: "#" },
            { title: "Market data provided by Yahoo Finance & CNBC", pubDate: new Date().toISOString(), link: "#" }
        ], container);
        return;
    }

    // Sortieren
    newsItems.sort((a,b) => new Date(b.pubDate) - new Date(a.pubDate));
    renderNews(newsItems.slice(0, 15), container);
}

function renderNews(items, container) {
    const html = items.map(item => {
        let timeStr = "--:--";
        try {
            const d = new Date(item.pubDate.replace(/-/g, "/"));
            timeStr = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } catch(e) {}

        // Title Cleanup
        let title = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'");
        
        return `
        <a href="${item.link}" target="_blank" class="rv-news-list-item">
            <span class="rv-news-list-title">${title}</span>
            <span class="rv-news-list-time">${timeStr}</span>
        </a>
        `;
    }).join('');
    container.innerHTML = html;
}

/* --- 4. STOCK EXPLORER (Option E/F) --- */
let currentSymbol = "NASDAQ:AAPL";

function loadStockList(category) {
    // Tabs Active State
    document.querySelectorAll('.rv-list-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`button[onclick="loadStockList('${category}')"]`).classList.add('active');

    const listContainer = document.getElementById('rv-stock-list-container');
    const data = STOCK_LISTS[category] || [];
    
    // Exchange Prefix Logic
    let exchange = "NASDAQ";
    if(category === 'sp500') exchange = "NYSE"; // Mix actually
    if(category === 'dow') exchange = "NYSE";

    listContainer.innerHTML = data.map(stock => {
        // Simple heuristic for exchange based on symbol
        let fullSymbol = stock.s;
        if(!stock.s.includes(":")) {
            fullSymbol = `${exchange}:${stock.s}`;
            // Correct ETF/Tech exceptions
            if(['AAPL','MSFT','NVDA','GOOGL','AMZN','TSLA','NFLX','COST','AVGO','AMD','META'].includes(stock.s)) fullSymbol = `NASDAQ:${stock.s}`;
            if(stock.s === 'SPY') fullSymbol = 'AMEX:SPY';
            if(stock.s === 'DIA') fullSymbol = 'AMEX:DIA';
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

    // Technicals
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

    // Fundamentals
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