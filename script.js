/* ==========================================================================
   RUBIK VAULT - MAIN SCRIPT (ROBUST VERSION)
   ========================================================================== */

/**
 * 1. CONFIGURATION
 */
const CONFIG = {
    rssApiKey: '0', // Public Key (Oft überlastet -> Fallback greift ein)
    feeds: [
        { url: 'https://cointelegraph.com/rss', category: 'Crypto', cssClass: 'source-crypto' },
        { url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664', category: 'Finance', cssClass: 'source-finance' },
        { url: 'https://www.theverge.com/rss/index.xml', category: 'Tech', cssClass: 'source-tech' },
        { url: 'https://news.google.com/rss/search?q=Reuters+Business&hl=en-US&gl=US&ceid=US:en', category: 'Business', cssClass: 'source-general' }
    ]
};

// FALLBACK DATEN (Werden gezeigt, wenn API fehlschlägt)
const FALLBACK_NEWS = [
    {
        title: "Bitcoin breaks resistance levels as market sentiment turns bullish",
        pubDate: new Date().toISOString(),
        link: "https://cointelegraph.com",
        sourceCategory: "Crypto",
        sourceClass: "source-crypto"
    },
    {
        title: "Fed Chair signals potential rate cuts in late 2025 amid inflation data",
        pubDate: new Date().toISOString(),
        link: "https://cnbc.com",
        sourceCategory: "Finance",
        sourceClass: "source-finance"
    },
    {
        title: "Apple unveils revolutionary AI features in new iOS update",
        pubDate: new Date().toISOString(),
        link: "https://theverge.com",
        sourceCategory: "Tech",
        sourceClass: "source-tech"
    },
    {
        title: "Global markets rally: S&P 500 reaches new all-time high",
        pubDate: new Date(Date.now() - 3600000).toISOString(), // 1 Stunde alt
        link: "https://reuters.com",
        sourceCategory: "Business",
        sourceClass: "source-general"
    },
    {
        title: "Ethereum ETF approval drives massive institutional inflow",
        pubDate: new Date(Date.now() - 7200000).toISOString(), // 2 Stunden alt
        link: "https://cointelegraph.com",
        sourceCategory: "Crypto",
        sourceClass: "source-crypto"
    },
    {
        title: "Oil prices fluctuate as geopolitical tensions rise in the Middle East",
        pubDate: new Date(Date.now() - 10800000).toISOString(), 
        link: "https://cnbc.com",
        sourceCategory: "Finance",
        sourceClass: "source-finance"
    },
    {
        title: "NVIDIA announces next-gen chips for enterprise data centers",
        pubDate: new Date(Date.now() - 86400000).toISOString(), // 1 Tag alt
        link: "https://theverge.com",
        sourceCategory: "Tech",
        sourceClass: "source-tech"
    },
    {
        title: "European Central Bank holds rates steady for the third consecutive month",
        pubDate: new Date(Date.now() - 90000000).toISOString(),
        link: "https://reuters.com",
        sourceCategory: "Business",
        sourceClass: "source-general"
    }
];

/**
 * 2. MARKET STATUS INDICATOR
 */
function updateMarketStatus() {
    const statusText = document.getElementById('rv-market-status-text');
    const statusDot = document.getElementById('rv-market-status-dot');
    if (!statusText || !statusDot) return;

    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const day = nyTime.getDay(); 
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    const timeDec = hour + minute / 60;

    const isOpen = (day >= 1 && day <= 5) && (timeDec >= 9.5 && timeDec < 16);

    if (isOpen) {
        statusText.textContent = "US Market Open";
        statusDot.style.color = "#10b981";
        statusDot.style.textShadow = "0 0 8px #10b981";
    } else {
        statusText.textContent = "US Market Closed";
        statusDot.style.color = "#ef4444";
        statusDot.style.textShadow = "none";
    }
}

/**
 * 3. CRYPTO FEAR & GREED INDEX
 */
async function updateCryptoFNG() {
    const valueEl = document.getElementById('fng-value');
    const classEl = document.getElementById('fng-class');
    const markerEl = document.getElementById('fng-marker');
    const loadingEl = document.getElementById('rv-crypto-fng-loading');
    const contentEl = document.getElementById('rv-crypto-fng-content');

    if(!valueEl) return;

    try {
        const response = await fetch('https://api.alternative.me/fng/');
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const val = parseInt(data.data[0].value);
            const classification = data.data[0].value_classification;

            valueEl.textContent = val;
            classEl.textContent = classification;
            
            let color = '#fbbf24'; 
            if(val < 25) color = '#ef4444'; 
            else if(val > 75) color = '#10b981'; 
            
            valueEl.style.color = color;
            classEl.style.color = color;

            if(markerEl) markerEl.style.left = `${val}%`;

            if(loadingEl) loadingEl.style.display = 'none';
            if(contentEl) contentEl.style.display = 'block';
        }
    } catch (e) {
        if(loadingEl) loadingEl.textContent = "Data unavailable";
    }
}

/**
 * 4. NEWS FEED AGGREGATOR (ROBUST)
 * Wechselt zu Fallback-Daten bei API-Fehler
 */
async function fetchAndRenderNews() {
    const gridContainer = document.getElementById('rv-news-feed-grid');
    const listContainer = document.getElementById('rv-news-feed-list');
    
    if (!gridContainer && !listContainer) return;

    // Loading Skeletons
    const skeletonHTML = '<div class="skeleton" style="height:160px; margin-bottom:10px;"></div>';
    if(gridContainer) gridContainer.innerHTML = skeletonHTML.repeat(4);
    if(listContainer) listContainer.innerHTML = skeletonHTML.repeat(4);

    let allArticles = [];
    let usedFallback = false;

    try {
        // Parallel Fetching
        const requests = CONFIG.feeds.map(feed => 
            fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&api_key=${CONFIG.rssApiKey}&count=5`)
            .then(res => {
                if(!res.ok) throw new Error('Network error');
                return res.json();
            })
            .then(data => {
                if(data.status === 'ok') {
                    return data.items.map(item => ({
                        ...item, 
                        sourceCategory: feed.category, 
                        sourceClass: feed.cssClass
                    }));
                }
                return [];
            })
            .catch(() => []) // Einzelner Feed Fehler ignorieren
        );

        const results = await Promise.all(requests);
        results.forEach(arr => { allArticles = [...allArticles, ...arr]; });

        // PRÜFUNG: Haben wir Daten bekommen?
        if (allArticles.length === 0) {
            throw new Error("API Limits or Empty Data");
        }

    } catch (error) {
        console.warn("News API Error (Using Fallback):", error);
        allArticles = FALLBACK_NEWS; // Nutze Demo Daten
        usedFallback = true;
    }

    // Deduplizieren und Sortieren
    const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.link, item])).values());
    // Nur sortieren wenn es keine Fallback-Daten sind (die sind schon sortiert)
    if(!usedFallback) {
        uniqueArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }

    // Render GRID
    if (gridContainer) {
        gridContainer.innerHTML = uniqueArticles.slice(0, 8).map(item => createNewsCardHTML(item)).join('');
    }

    // Render LIST
    if (listContainer) {
        let html = uniqueArticles.slice(0, 15).map(item => createNewsListHTML(item)).join('');
        // Kleiner Hinweis im Sidebar Feed, wenn Demo-Daten laufen
        if(usedFallback) {
            html += '<div style="text-align:center; padding:10px; font-size:10px; color:#666;">(Demo Data Mode)</div>';
        }
        listContainer.innerHTML = html;
    }
}

// Helper: News Card HTML
function createNewsCardHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    // Titel säubern
    const cleanTitle = item.title ? item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'") : "No Title";
    
    return `
    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="rv-news-card">
        <div>
            <span class="rv-news-source ${item.sourceClass}">${item.sourceCategory}</span>
            <div class="rv-news-card-title">${cleanTitle}</div>
        </div>
        <div class="rv-news-card-meta">
            <span>${timeStr}</span>
            <span style="color:var(--rv-accent)">Read &rarr;</span>
        </div>
    </a>`;
}

// Helper: News List HTML
function createNewsListHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    const cleanTitle = item.title ? item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'") : "No Title";
    return `
    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="rv-news-list-item">
        <div style="margin-top:3px;">
             <span class="rv-news-source ${item.sourceClass}" style="font-size:9px; padding:2px 4px;">${item.sourceCategory.charAt(0)}</span>
        </div>
        <div class="rv-news-list-content">
            <div class="rv-news-list-title">${cleanTitle}</div>
            <div class="rv-news-list-time">${timeStr}</div>
        </div>
    </a>`;
}

// Helper: Time Ago
function formatTimeAgo(dateString) {
    try {
        const date = new Date(dateString.replace(/-/g, "/"));
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (isNaN(diff)) return 'Recently';
        if (diff < 3600) return Math.floor(diff/60) + 'm ago';
        if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
        return Math.floor(diff/86400) + 'd ago';
    } catch(e) {
        return 'Recently';
    }
}

/**
 * 5. LAZY LOADING
 */
function initLazyWidgets() {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-loaded');
                obs.unobserve(entry.target);
            }
        });
    });
    document.querySelectorAll('.rv-tv-box').forEach(box => observer.observe(box));
}

/**
 * GLOBAL INIT
 */
document.addEventListener('DOMContentLoaded', () => {
    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();

    updateMarketStatus();
    updateCryptoFNG();
    fetchAndRenderNews(); // Startet den News Prozess (mit Fallback)
    initLazyWidgets();

    setInterval(updateMarketStatus, 60000);
    setInterval(fetchAndRenderNews, 300000); // Alle 5 Min Refresh
});