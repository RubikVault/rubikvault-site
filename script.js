// script.js

/**
 * CONFIGURATION
 * HIER KEY EINFÜGEN FÜR ECHTE DATEN:
 */
const CONFIG = {
    rssApiKey: '0', // Ersetze '0' durch Key von rss2json.com
    feeds: [
        { url: 'https://cointelegraph.com/rss', category: 'Crypto', cssClass: 'source-crypto' },
        { url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664', category: 'Finance', cssClass: 'source-finance' },
        { url: 'https://www.theverge.com/rss/index.xml', category: 'Tech', cssClass: 'source-tech' },
        { url: 'https://news.google.com/rss/search?q=Reuters+Business&hl=en-US&gl=US&ceid=US:en', category: 'Business', cssClass: 'source-general' }
    ]
};

// FALLBACK DATEN (wenn Key '0' limitiert ist)
const FALLBACK_NEWS = [
    { title: "DEMO: Bitcoin hits new all-time high amid ETF inflows", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Crypto", sourceClass: "source-crypto" },
    { title: "DEMO: Fed signals rate cuts coming in Q4", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Finance", sourceClass: "source-finance" },
    { title: "DEMO: NVIDIA announces revolutionary AI chip", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Tech", sourceClass: "source-tech" },
    { title: "DEMO: Oil prices surge on geopolitical tensions", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Business", sourceClass: "source-general" },
    { title: "DEMO: Ethereum network upgrade successful", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Crypto", sourceClass: "source-crypto" },
    { title: "DEMO: S&P 500 closes at record level", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Finance", sourceClass: "source-finance" },
    { title: "DEMO: Apple reveals new mixed reality headset", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Tech", sourceClass: "source-tech" },
    { title: "DEMO: ECB keeps interest rates unchanged", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Business", sourceClass: "source-general" },
    { title: "DEMO: Gold prices stabilize after rally", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Finance", sourceClass: "source-finance" },
    { title: "DEMO: Microsoft integrates AI into Windows", pubDate: new Date().toISOString(), link: "#", sourceCategory: "Tech", sourceClass: "source-tech" }
];

document.addEventListener("DOMContentLoaded", () => {
    // 1. UI LOGIC (Header Scroll & Smooth Scroll)
    const header = document.querySelector(".rv-header");
    if(header) {
        window.addEventListener("scroll", () => {
            if (window.scrollY > 10) header.classList.add("rv-header-scrolled");
            else header.classList.remove("rv-header-scrolled");
        });
    }

    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach((link) => {
        link.addEventListener("click", (e) => {
            const targetId = link.getAttribute("href").substring(1);
            const target = document.getElementById(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });

    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();

    // 2. MARKET STATUS
    updateMarketStatus();
    setInterval(updateMarketStatus, 60000);

    // 3. NEWS FEED LOGIC
    fetchAndRenderNews();
    setInterval(fetchAndRenderNews, 30000); // 30 Sek Update
});

// NEWS FUNCTIONS
async function fetchAndRenderNews() {
    const gridContainer = document.getElementById('rv-news-feed-grid');
    const listContainer = document.getElementById('rv-news-feed-list');
    const heroList = document.getElementById('rv-hero-news-list');
    
    if (!gridContainer && !listContainer) return;

    // First Load Skeletons
    if(listContainer && listContainer.children.length === 0) {
        listContainer.innerHTML = '<div class="skeleton" style="height:60px; margin-bottom:10px;"></div>'.repeat(5);
    }

    let allArticles = [];
    let usedFallback = false;

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
            .catch(() => [])
        );

        const results = await Promise.all(requests);
        results.forEach(arr => { allArticles = [...allArticles, ...arr]; });

        if (allArticles.length === 0) throw new Error("No Data");

    } catch (error) {
        console.warn("API Error (Using Fallback)", error);
        allArticles = FALLBACK_NEWS; 
        usedFallback = true;
    }

    if(!usedFallback) {
        allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }

    // A. Sidebar (10 Items)
    if (listContainer) {
        const listItems = allArticles.slice(0, 10);
        listContainer.innerHTML = listItems.map(item => createNewsListHTML(item)).join('');
        
        // Update Time Indicator
        const updateDiv = document.createElement('div');
        updateDiv.innerHTML = `<small style="display:block; text-align:center; color:#444; margin-top:10px;">Updated: ${new Date().toLocaleTimeString()}</small>`;
        listContainer.appendChild(updateDiv);
    }

    // B. Main Grid (8 Items)
    if (gridContainer) {
        gridContainer.innerHTML = allArticles.slice(0, 8).map(item => createNewsCardHTML(item)).join('');
    }

    // C. Hero List (3 Items compact)
    if (heroList) {
         const heroItems = allArticles.slice(0, 3);
         heroList.innerHTML = heroItems.map(item => `
            <div style="margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">
                <span class="rv-news-source ${item.sourceClass}" style="font-size:9px;">${item.sourceCategory}</span>
                <a href="${item.link}" target="_blank" style="color:#e5e7eb; text-decoration:none; display:block; margin-top:2px;">${item.title.substring(0,50)}...</a>
            </div>
         `).join('');
    }
}

function createNewsCardHTML(item) {
    const timeStr = formatTimeAgo(item.pubDate);
    const cleanTitle = item.title ? item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'") : "News";
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
    const cleanTitle = item.title ? item.title.replace(/&amp;/g, '&').replace(/&#039;/g, "'") : "News";
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
    try {
        const date = new Date(dateString.replace(/-/g, "/"));
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (isNaN(diff)) return '';
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400) return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return date.toLocaleDateString();
    } catch(e) { return ''; }
}

function updateMarketStatus() {
    const statusText = document.getElementById('rv-market-status-text');
    const statusDot = document.getElementById('rv-market-status-dot');
    if (!statusText) return;
    const now = new Date();
    // Grobe US Marktzeit Schätzung (Mo-Fr, 15:30 - 22:00 MEZ ca.)
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    // 13:30 UTC = 9:30 EST | 20:00 UTC = 16:00 EST
    // Vereinfacht: 13 bis 20 Uhr UTC
    const isOpen = (day >= 1 && day <= 5) && (hour >= 14 && hour < 21);
    
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