// script.js

/**
 * CONFIGURATION
 * WICHTIG: Füge deinen Key von rss2json.com ein!
 */
const CONFIG = {
    rssApiKey: '0', // <--- DEIN KEY HIER (sonst keine Daten!)
    feeds: [
        { url: 'https://cointelegraph.com/rss', category: 'Crypto' },
        { url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664', category: 'Finance' },
        { url: 'https://www.theverge.com/rss/index.xml', category: 'Tech' },
        { url: 'https://news.google.com/rss/search?q=Reuters+Business&hl=en-US&gl=US&ceid=US:en', category: 'Business' }
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. Header & Scroll
    const header = document.querySelector(".rv-header");
    if(header) {
        window.addEventListener("scroll", () => {
            if (window.scrollY > 10) header.classList.add("rv-header-scrolled");
            else header.classList.remove("rv-header-scrolled");
        });
    }

    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();

    // 2. Market Status
    updateMarketStatus();
    setInterval(updateMarketStatus, 60000);

    // 3. Init Widgets E & F (Fundamentals & Technicals)
    // Start mit Apple als Default
    switchAnalysis('NASDAQ:AAPL');

    // 4. Start News Feed (Live Update)
    fetchAndRenderNews();
    setInterval(fetchAndRenderNews, 30000); // 30s
});

/**
 * FEATURE: SWITCHABLE WIDGETS (Option E & F)
 * Lädt die Widgets neu mit dem übergebenen Symbol
 */
function switchAnalysis(symbol) {
    // Buttons aktualisieren
    document.querySelectorAll('.rv-switch-btn').forEach(btn => {
        if(btn.getAttribute('onclick').includes(symbol)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const fundContainer = document.getElementById('container-fundamentals');
    const techContainer = document.getElementById('container-technicals');

    if(fundContainer && techContainer) {
        // Leeren
        fundContainer.innerHTML = '';
        techContainer.innerHTML = '';

        // Technicals Widget Injection
        const scriptTech = document.createElement('script');
        scriptTech.type = 'text/javascript';
        scriptTech.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
        scriptTech.async = true;
        scriptTech.innerHTML = JSON.stringify({
            "interval": "1D",
            "width": "100%",
            "isTransparent": true,
            "height": "100%",
            "symbol": symbol, // Dynamisches Symbol
            "showIntervalTabs": true,
            "displayMode": "single",
            "locale": "en",
            "colorTheme": "dark"
        });
        const widgetContainerTech = document.createElement('div');
        widgetContainerTech.className = 'tradingview-widget-container';
        const widgetDivTech = document.createElement('div');
        widgetDivTech.className = 'tradingview-widget-container__widget';
        widgetContainerTech.appendChild(widgetDivTech);
        widgetContainerTech.appendChild(scriptTech);
        techContainer.appendChild(widgetContainerTech);

        // Fundamentals Widget Injection
        const scriptFund = document.createElement('script');
        scriptFund.type = 'text/javascript';
        scriptFund.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        scriptFund.async = true;
        // Achtung: Fundamentals Widget braucht oft spezifische Exchange Prefixes.
        // Falls AMEX:SPY gewählt wird, macht Fundamentals wenig Sinn, wir fangen das nicht ab, 
        // aber TV zeigt dann ggf. "No Data" an. Für Aktien (AAPL) klappt es.
        scriptFund.innerHTML = JSON.stringify({
            "colorTheme": "dark",
            "isTransparent": true,
            "displayMode": "regular",
            "width": "100%",
            "height": "100%",
            "symbol": symbol, // Dynamisches Symbol
            "locale": "en"
        });
        const widgetContainerFund = document.createElement('div');
        widgetContainerFund.className = 'tradingview-widget-container';
        const widgetDivFund = document.createElement('div');
        widgetDivFund.className = 'tradingview-widget-container__widget';
        widgetContainerFund.appendChild(widgetDivFund);
        widgetContainerFund.appendChild(scriptFund);
        fundContainer.appendChild(widgetContainerFund);
    }
}

/**
 * FEATURE: LIVE NEWS FEED
 */
async function fetchAndRenderNews() {
    const listContainer = document.getElementById('rv-news-feed-list');
    if (!listContainer) return;

    let allArticles = [];

    try {
        const requests = CONFIG.feeds.map(feed => 
            fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&api_key=${CONFIG.rssApiKey}&count=5`)
            .then(res => res.json())
            .then(data => {
                if(data.status === 'ok') {
                    return data.items;
                }
                return [];
            })
            .catch(() => [])
        );

        const results = await Promise.all(requests);
        results.forEach(arr => { allArticles = [...allArticles, ...arr]; });

        // KEINE Dummy Daten. Wenn leer, zeige Fehler.
        if (allArticles.length === 0) {
            // Check if containers empty to show error
            if(listContainer.innerHTML.trim() === '') {
                listContainer.innerHTML = '<div class="rv-news-error">Waiting for Live Data... <br>(Check API Key if persistent)</div>';
            }
            return;
        }

        // Sortieren: Neueste zuerst
        allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Render Top 10
        const listItems = allArticles.slice(0, 10);
        listContainer.innerHTML = listItems.map(item => createNewsListHTML(item)).join('');
        
        // Update Time
        const updateDiv = document.createElement('div');
        updateDiv.innerHTML = `<small style="display:block; text-align:center; color:#444; margin-top:10px;">Live Update: ${new Date().toLocaleTimeString()}</small>`;
        listContainer.appendChild(updateDiv);

    } catch (error) {
        console.error("News Fetch Error:", error);
    }
}

function createNewsListHTML(item) {
    // Nur Uhrzeit extrahieren (HH:MM)
    const dateObj = new Date(item.pubDate.replace(/-/g, "/"));
    const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Title cleanen
    const cleanTitle = item.title ? item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'") : "News";

    return `
    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="rv-news-list-item">
        <div class="rv-news-list-title">${cleanTitle}</div>
        <div class="rv-news-list-time">${timeStr}</div>
    </a>`;
}

function updateMarketStatus() {
    const statusText = document.getElementById('rv-market-status-text');
    const statusDot = document.getElementById('rv-market-status-dot');
    if (!statusText) return;
    
    const now = new Date();
    // UTC Zeiten für US Market (grob 14:30 - 21:00 UTC)
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const min = now.getUTCMinutes();
    const timeDec = hour + min/60;

    // US Market approx: 13:30 UTC to 20:00 UTC (Standard Time)
    const isOpen = (day >= 1 && day <= 5) && (timeDec >= 14.5 && timeDec < 21);
    
    if(isOpen) { 
        statusText.textContent="US Market Open"; 
        statusDot.style.color="#10b981"; 
        statusDot.style.textShadow="0 0 5px #10b981";
    } else { 
        statusText.textContent="US Market Closed"; 
        statusDot.style.color="#ef4444"; 
        statusDot.style.textShadow="none";
    }
}