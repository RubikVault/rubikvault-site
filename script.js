/* ==========================================================================
   RUBIK VAULT - LOGIC CORE (FINAL FIX)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMarketTimer();
    initNewsFeed();
    
    // Refresh News every 30s
    setInterval(initNewsFeed, 30000);
    // Refresh Timer every 1s
    setInterval(initMarketTimer, 1000);
    
    // Footer Year
    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();
    
    // Header Scroll Effect
    const header = document.querySelector(".rv-header");
    if(header) {
        window.addEventListener("scroll", () => {
            if (window.scrollY > 10) header.classList.add("rv-header-scrolled");
            else header.classList.remove("rv-header-scrolled");
        });
    }
});

/* --- 1. THEME SWITCHER --- */
function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    // Load saved theme
    if(localStorage.getItem('theme') === 'light') {
        body.setAttribute('data-theme', 'light');
        if(toggle) toggle.innerHTML = '🌙 Dark';
    }

    if(toggle) {
        toggle.addEventListener('click', () => {
            if(body.getAttribute('data-theme') === 'light') {
                body.removeAttribute('data-theme');
                localStorage.setItem('theme', 'dark');
                toggle.innerHTML = '☀️ Light';
            } else {
                body.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                toggle.innerHTML = '🌙 Dark';
            }
        });
    }
}

/* --- 2. MARKET COUNTDOWN --- */
function initMarketTimer() {
    const statusText = document.getElementById('market-status-text');
    const statusDot = document.getElementById('market-status-dot');
    const countdown = document.getElementById('market-countdown');

    if (!statusText || !countdown) return;

    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    
    // Minuten seit Mitternacht UTC (KORRIGIERT: Zusammengeschrieben)
    const currentMinutes = (utcHour * 60) + utcMin; 
    
    const openTime = 14 * 60 + 30; // 14:30 UTC
    const closeTime = 21 * 60;     // 21:00 UTC
    const day = now.getUTCDay();   // 0=Sun, 6=Sat

    let isOpen = false;
    let label = "";
    let timeString = "";

    // Weekend Check
    if (day === 0 || day === 6) {
        isOpen = false;
        label = "Weekend Closed";
        timeString = "Opens Monday";
    } else {
        if (currentMinutes >= openTime && currentMinutes < closeTime) {
            isOpen = true;
            label = "Market Open";
            const diff = closeTime - currentMinutes;
            const h = Math.floor(diff / 60);
            const m = diff % 60;
            timeString = `Closes in ${h}h ${m}m`;
        } else {
            isOpen = false;
            label = "Market Closed";
            if (currentMinutes < openTime) {
                const diff = openTime - currentMinutes;
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                timeString = `Opens in ${h}h ${m}m`;
            } else {
                timeString = "Opens tomorrow";
            }
        }
    }

    statusText.textContent = label;
    countdown.textContent = timeString;

    if (isOpen) {
        if(statusDot) {
            statusDot.className = "status-dot status-open";
            statusDot.style.background = "#10b981";
            statusDot.style.boxShadow = "0 0 8px #10b981";
        }
    } else {
        if(statusDot) {
            statusDot.className = "status-dot status-closed";
            statusDot.style.background = "#ef4444";
            statusDot.style.boxShadow = "none";
        }
    }
}

/* --- 3. LIVE NEWS FEED --- */
const RSS_URLS = [
    'https://cointelegraph.com/rss',
    'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664',
    'https://www.theverge.com/rss/index.xml'
];

async function initNewsFeed() {
    const listContainer = document.getElementById('rv-news-feed-list');
    if (!listContainer) return;

    // Loading State only on first load
    if(listContainer.innerHTML.trim() === "") {
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Loading Live News...</div>';
    }

    let allItems = [];

    // RSS Fetching via Public Proxy (mit Timestamp gegen Caching)
    const fetchPromises = RSS_URLS.map(url => {
        return fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&api_key=0&t=${Date.now()}`)
            .then(res => res.json())
            .then(data => {
                if(data.status === 'ok') return data.items;
                return [];
            })
            .catch(e => []);
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(items => allItems = [...allItems, ...items]);

    if (allItems.length === 0) {
        // Fallback Data if API fails
        renderNews([
            { title: "Waiting for API data or limit reached...", pubDate: new Date().toISOString(), link: "#" },
            { title: "Market data is currently syncing", pubDate: new Date().toISOString(), link: "#" }
        ], listContainer);
        return;
    }

    // Sort: Newest first
    allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    renderNews(allItems.slice(0, 10), listContainer);
}

function renderNews(items, container) {
    const html = items.map(item => {
        let timeStr = "";
        try {
            // Safari/Firefox Fix for Date Parsing
            const date = new Date(item.pubDate.replace(/-/g, "/"));
            timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch(e) { timeStr = "--:--"; }
        
        let title = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'");
        if(title.length > 60) title = title.substring(0, 60) + "...";

        return `
            <a href="${item.link}" target="_blank" class="rv-news-list-item">
                <span class="rv-news-list-title">${title}</span>
                <span class="rv-news-list-time">${timeStr}</span>
            </a>
        `;
    }).join('');

    container.innerHTML = html;
}

/* --- 4. SWITCHER (Option E/F) --- */
window.switchAnalysis = function(symbol) {
    document.querySelectorAll('.rv-switch-btn').forEach(btn => {
        if(btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(symbol)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const fundContainer = document.getElementById('container-fundamentals');
    const techContainer = document.getElementById('container-technicals');

    if(fundContainer && techContainer) {
        fundContainer.innerHTML = '';
        techContainer.innerHTML = '';

        // Inject Technicals Widget
        const scriptTech = document.createElement('script');
        scriptTech.type = 'text/javascript';
        scriptTech.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
        scriptTech.async = true;
        scriptTech.text = JSON.stringify({
            "interval": "1D", "width": "100%", "isTransparent": true, "height": "100%", 
            "symbol": symbol, "showIntervalTabs": true, "displayMode": "single", 
            "locale": "en", "colorTheme": "dark"
        });
        techContainer.appendChild(createWidgetDiv(scriptTech));

        // Inject Fundamentals Widget
        const scriptFund = document.createElement('script');
        scriptFund.type = 'text/javascript';
        scriptFund.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        scriptFund.async = true;
        scriptFund.text = JSON.stringify({
            "colorTheme": "dark", "isTransparent": true, "displayMode": "regular", 
            "width": "100%", "height": "100%", "symbol": symbol, "locale": "en"
        });
        fundContainer.appendChild(createWidgetDiv(scriptFund));
    }
};

function createWidgetDiv(scriptElement) {
    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    container.appendChild(widget);
    container.appendChild(scriptElement);
    return container;
}