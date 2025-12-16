/* ==========================================================================
   RUBIK VAULT - LOGIC CORE (FIXED)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMarketTimer();
    initNewsFeed();
    
    // Refresh News every 30s
    setInterval(initNewsFeed, 30000);
    // Refresh Timer every 1s
    setInterval(initMarketTimer, 1000);
});

/* --- 1. THEME SWITCHER --- */
function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const body = document.body;
    
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

/* --- 2. MARKET COUNTDOWN (FIXED) --- */
function initMarketTimer() {
    const statusText = document.getElementById('market-status-text');
    const statusDot = document.getElementById('market-status-dot');
    const countdown = document.getElementById('market-countdown');

    if (!statusText || !countdown) return;

    const now = new Date();
    // UTC Zeiten nutzen, um Zeitzonen-Probleme zu minimieren
    // NYSE Open: 14:30 UTC | NYSE Close: 21:00 UTC
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    
    // Minuten seit Mitternacht UTC berechnen
    const currentMinutes = (utcHour * 60) + utcMin; // <-- HIER WAR DER FEHLER
    
    const openTime = 14 * 60 + 30; // 14:30 UTC = 870 min
    const closeTime = 21 * 60;     // 21:00 UTC = 1260 min
    const day = now.getUTCDay();   // 0=Sun, 6=Sat

    let isOpen = false;
    let label = "";
    let timeString = "";

    // Wochenende Check
    if (day === 0 || day === 6) {
        isOpen = false;
        label = "Weekend Closed";
        timeString = "Opens Monday";
    } else {
        // Innerhalb der Woche
        if (currentMinutes >= openTime && currentMinutes < closeTime) {
            // MARKT OFFEN
            isOpen = true;
            label = "Market Open";
            
            // Zeit bis Close berechnen
            const diff = closeTime - currentMinutes;
            const h = Math.floor(diff / 60);
            const m = diff % 60;
            timeString = `Closes in ${h}h ${m}m`;
        } else {
            // MARKT GESCHLOSSEN
            isOpen = false;
            label = "Market Closed";
            
            if (currentMinutes < openTime) {
                // Vor Marktöffnung (heute)
                const diff = openTime - currentMinutes;
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                timeString = `Opens in ${h}h ${m}m`;
            } else {
                // Nach Marktöffnung (macht erst morgen auf)
                timeString = "Opens tomorrow";
            }
        }
    }

    // UI Updates
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
    'https://feeds.feedburner.com/TechCrunch/',
    'https://cointelegraph.com/rss',
    'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664'
];

async function initNewsFeed() {
    const listContainer = document.getElementById('rv-news-feed-list');
    if (!listContainer) return;

    // Loading State nur beim ersten leeren Container
    if(listContainer.innerHTML.trim() === "") {
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Loading Live News...</div>';
    }

    let allItems = [];

    // RSS Fetching via Proxy
    const fetchPromises = RSS_URLS.map(url => {
        return fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&api_key=0`)
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
        // Fallback falls API Limits erreicht sind
        const fallback = [
            { title: "Market Data Unavailable (API Limit) - Please check later", pubDate: new Date().toISOString(), link: "#" },
            { title: "Bitcoin holds steady amidst global uncertainty", pubDate: new Date().toISOString(), link: "#" }
        ];
        renderNews(fallback, listContainer);
        return;
    }

    // Sortieren: Neueste zuerst
    allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    // Top 10 rendern
    renderNews(allItems.slice(0, 10), listContainer);
}

function renderNews(items, container) {
    const html = items.map(item => {
        // Zeit formatieren
        let timeStr = "";
        try {
            const date = new Date(item.pubDate.replace(/-/g, "/"));
            timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch(e) { timeStr = "--:--"; }
        
        // Titel bereinigen
        let title = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'");
        if(title.length > 65) title = title.substring(0, 65) + "...";

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
// Globale Funktion für HTML access
window.switchAnalysis = function(symbol) {
    // Buttons toggeln
    document.querySelectorAll('.rv-switch-btn').forEach(btn => {
        // Einfacher Check ob das Symbol im Onclick Attribut ist
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

        // Technicals
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

        // Fundamentals
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

// Helper für Widget Creation
function createWidgetDiv(scriptElement) {
    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    container.appendChild(widget);
    container.appendChild(scriptElement);
    return container;
}