/* ==========================================================================
   RUBIK VAULT - MAIN SCRIPT (MERGED VERSION)
   ========================================================================== */

/**
 * 1. CONFIGURATION & STATE
 */
const CONFIG = {
    rssApiKey: '0', // '0' ist der öffentliche Test-Key von rss2json
    feeds: [
        { url: 'https://cointelegraph.com/rss', category: 'Crypto', cssClass: 'source-crypto' },
        { url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664', category: 'Finance', cssClass: 'source-finance' },
        { url: 'https://www.theverge.com/rss/index.xml', category: 'Tech', cssClass: 'source-tech' },
        { url: 'https://news.google.com/rss/search?q=Reuters+Business&hl=en-US&gl=US&ceid=US:en', category: 'Business', cssClass: 'source-general' }
    ]
};

/**
 * 2. MARKET STATUS INDICATOR
 * Prüft grob, ob US-Märkte (NYSE/NASDAQ) offen sind (9:30 - 16:00 ET, Mo-Fr)
 */
function updateMarketStatus() {
    const statusText = document.getElementById('rv-market-status-text');
    const statusDot = document.getElementById('rv-market-status-dot');
    if (!statusText || !statusDot) return;

    const now = new Date();
    // Umrechnung in New York Zeit (UTC-5 bzw. UTC-4)
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const day = nyTime.getDay(); // 0=Sun, 6=Sat
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    const timeDec = hour + minute / 60;

    // Marktzeiten: Mo-Fr, 09:30 bis 16:00
    const isOpen = (day >= 1 && day <= 5) && (timeDec >= 9.5 && timeDec < 16);

    if (isOpen) {
        statusText.textContent = "US Market Open";
        statusDot.style.color = "#10b981"; // Grün
        statusDot.style.textShadow = "0 0 8px #10b981";
    } else {
        statusText.textContent = "US Market Closed";
        statusDot.style.color = "#ef4444"; // Rot
        statusDot.style.textShadow = "none";
    }
}

/**
 * 3. CRYPTO FEAR & GREED INDEX (API)
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
            
            // Farbe setzen
            let color = '#fbbf24'; // Neutral
            if(val < 25) color = '#ef4444'; // Fear
            else if(val > 75) color = '#10b981'; // Greed
            
            valueEl.style.color = color;
            classEl.style.color = color;

            if(markerEl) markerEl.style.left = `${val}%`;

            if(loadingEl) loadingEl.style.display = 'none';
            if(contentEl) contentEl.style.display = 'block';
        }
    } catch (e) {
        console.error("FNG API Error", e);
        if(loadingEl) loadingEl.textContent = "Data unavailable";
    }
}

/**
 * 4. NEWS FEED AGGREGATOR (Multi-Source)
 */
async function fetchAndRenderNews() {
    const gridContainer = document.getElementById('rv-news-feed-grid');
    const listContainer = document.getElementById('rv-news-feed-list');
    
    if (!gridContainer && !listContainer) return;

    // Loading State
    const skeletonHTML = '<div class="skeleton" style="height:160px; margin-bottom:10px;"></div>';
    if(gridContainer) gridContainer.innerHTML = skeletonHTML.repeat(4);
    if(listContainer) listContainer.innerHTML = skeletonHTML.repeat(4);

    let allArticles = [];

    try {
        const requests = CONFIG.feeds.map(feed => 
            fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&api_key=${CONFIG.rssApiKey}&count=5`)
            .then(res => res.json())
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
            .catch(e => [])
        );

        const results = await Promise.all(requests);
        results.forEach(arr => { allArticles = [...allArticles, ...arr]; });

        // Deduplizieren und Sortieren
        const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.link, item])).values());
        uniqueArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Render GRID
        if (gridContainer && uniqueArticles.length > 0) {
            gridContainer.innerHTML = uniqueArticles.slice(0, 8).map(item => createNewsCardHTML(item)).join('');
        }

        // Render LIST
        if (listContainer && uniqueArticles.length > 0) {
            listContainer.innerHTML = uniqueArticles.slice(0, 15).map(item => createNewsListHTML(item)).join('');
        }

    } catch (error) {
        console.error("News Error:", error);
        const errMsg = '<div class="rv-news-error">News unavailable.</div>';
        if(gridContainer) gridContainer.innerHTML = errMsg;
        if(listContainer) listContainer.innerHTML = errMsg;
    }
}

// Helpers für News HTML
function createNewsCardHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    const cleanTitle = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'");
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

function createNewsListHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    const cleanTitle = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'");
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

function formatTimeAgo(dateString) {
    const date = new Date(dateString.replace(/-/g, "/"));
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
}

/**
 * 5. LAZY LOADING FOR TRADINGVIEW WIDGETS
 * Performance Optimierung: Lädt Widgets erst, wenn sie sichtbar werden.
 */
function initLazyWidgets() {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Das Skript im Container finden und "aktivieren" (falls nötig)
                // Bei TradingView Embeds reicht oft das Einfügen des Scripts,
                // aber da sie schon im HTML sind, lassen wir den Browser das meist regeln.
                // Hier könnte man komplexe Nachlade-Logik einbauen.
                // Für dieses Setup verlassen wir uns auf native Browser-Optimierung,
                // oder fügen eine Klasse hinzu um Animationen zu starten.
                entry.target.classList.add('is-loaded');
                obs.unobserve(entry.target);
            }
        });
    });

    document.querySelectorAll('.rv-tv-box').forEach(box => {
        observer.observe(box);
    });
}

/**
 * GLOBAL INIT
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Footer Year
    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();

    // 2. Start Functions
    updateMarketStatus();
    updateCryptoFNG();
    fetchAndRenderNews();
    initLazyWidgets();

    // 3. Intervals
    setInterval(updateMarketStatus, 60000); // 1 min
    setInterval(fetchAndRenderNews, 300000); // 5 min
});