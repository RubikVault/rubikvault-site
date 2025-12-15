/* ==========================================================================
   RUBIK VAULT - MAIN SCRIPT
   ========================================================================== */

/**
 * CONFIGURATION: NEWS FEEDS
 * Wir nutzen rss2json.com um RSS Feeds in JSON zu wandeln.
 * 'apiKey: 0' nutzt den öffentlichen Free-Key (begrenzt). 
 * Für Produktion: Kostenlosen API Key bei rss2json.com holen.
 */
const NEWS_CONFIG = {
    apiKey: '0', 
    feeds: [
        { 
            // Cointelegraph (Crypto News)
            url: 'https://cointelegraph.com/rss', 
            category: 'Crypto', 
            cssClass: 'source-crypto' 
        },
        { 
            // CNBC Finance (Finance News)
            url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664', 
            category: 'Finance', 
            cssClass: 'source-finance' 
        },
        { 
            // The Verge (Tech News)
            url: 'https://www.theverge.com/rss/index.xml', 
            category: 'Tech', 
            cssClass: 'source-tech' 
        },
        {
            // Reuters Business (via Google News RSS Trick)
            url: 'https://news.google.com/rss/search?q=Reuters+Business&hl=en-US&gl=US&ceid=US:en',
            category: 'Business',
            cssClass: 'source-general'
        }
    ]
};

/**
 * MAIN FUNCTION: FETCH AND RENDER NEWS
 */
async function fetchAndRenderNews() {
    const gridContainer = document.getElementById('rv-news-feed-grid');
    const listContainer = document.getElementById('rv-news-feed-list');
    
    // Abbruch, wenn keine Container da sind
    if (!gridContainer && !listContainer) return;

    // 1. Loading State (Skeletons anzeigen)
    if(gridContainer) {
        gridContainer.innerHTML = Array(4).fill('<div class="skeleton skeleton-card"></div>').join('');
    }
    if(listContainer) {
        listContainer.innerHTML = Array(6).fill('<div class="skeleton skeleton-list"></div>').join('');
    }

    let allArticles = [];

    try {
        // 2. Alle Feeds parallel abrufen
        // Wir limitieren auf 5 Items pro Feed um Daten zu sparen
        const requests = NEWS_CONFIG.feeds.map(feed => 
            fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&api_key=${NEWS_CONFIG.apiKey}&count=5`)
            .then(res => res.json())
            .then(data => {
                if(data.status === 'ok') {
                    // Feed-Daten normalisieren
                    return data.items.map(item => ({
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate,
                        sourceCategory: feed.category, 
                        sourceClass: feed.cssClass,
                        sourceName: data.feed.title || feed.category
                    }));
                }
                return [];
            })
            .catch(err => {
                console.warn(`Feed Error (${feed.category}):`, err);
                return [];
            })
        );

        const results = await Promise.all(requests);
        
        // 3. Arrays zusammenführen (Flatten)
        results.forEach(arr => { allArticles = [...allArticles, ...arr]; });

        // 4. Duplikate entfernen (anhand URL)
        const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.link, item])).values());

        // 5. Sortieren: Neueste zuerst
        uniqueArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // 6. Grid Rendern (Top 8)
        if (gridContainer) {
            if(uniqueArticles.length > 0) {
                gridContainer.innerHTML = uniqueArticles.slice(0, 8).map(item => createNewsCardHTML(item)).join('');
            } else {
                gridContainer.innerHTML = '<div class="rv-news-error">No news available at the moment.</div>';
            }
        }

        // 7. List Rendern (Top 15 für Sidebar)
        if (listContainer) {
            if(uniqueArticles.length > 0) {
                listContainer.innerHTML = uniqueArticles.slice(0, 15).map(item => createNewsListHTML(item)).join('');
            } else {
                listContainer.innerHTML = '<div class="rv-news-error">Feed offline.</div>';
            }
        }

    } catch (error) {
        console.error("Critical News Error:", error);
        const errMsg = '<div class="rv-news-error">News system currently unavailable. Try again later.</div>';
        if(gridContainer) gridContainer.innerHTML = errMsg;
        if(listContainer) listContainer.innerHTML = errMsg;
    }
}

/**
 * HELPER: HTML Generator für Grid Card
 */
function createNewsCardHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    // HTML Entities bereinigen
    const cleanTitle = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"');

    return `
    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="rv-news-card">
        <div>
            <span class="rv-news-source ${item.sourceClass}">${item.sourceCategory}</span>
            <div class="rv-news-card-title">${cleanTitle}</div>
        </div>
        <div class="rv-news-card-meta">
            <span>${timeStr}</span>
            <span style="color:var(--rv-accent); font-weight:600;">Read &rarr;</span>
        </div>
    </a>
    `;
}

/**
 * HELPER: HTML Generator für Sidebar List
 */
function createNewsListHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    const cleanTitle = item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'");
    // Shorten title for list view
    const shortTitle = cleanTitle.length > 60 ? cleanTitle.substring(0, 60) + '...' : cleanTitle;

    return `
    <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="rv-news-list-item">
        <div style="margin-top:3px;">
             <span class="rv-news-source ${item.sourceClass}" style="font-size:9px; padding:2px 4px;">
                ${item.sourceCategory.charAt(0)}
             </span>
        </div>
        <div class="rv-news-list-content">
            <div class="rv-news-list-title">${shortTitle}</div>
            <div class="rv-news-list-time">${timeStr}</div>
        </div>
    </a>
    `;
}

/**
 * HELPER: Time Ago Formatter
 */
function formatTimeAgo(dateString) {
    const date = new Date(dateString.replace(/-/g, "/")); // Safari Fix
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (isNaN(diffInSeconds)) return ''; // Fallback bei Parse Error

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

/**
 * GLOBAL INIT
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Footer Year
    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();

    // 2. Start News Fetch
    fetchAndRenderNews();

    // 3. Auto-Refresh alle 5 Minuten
    setInterval(fetchAndRenderNews, 300000);
});